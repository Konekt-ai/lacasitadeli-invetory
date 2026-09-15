// Rutas del API (contrato v2, sección 4). Todas las de datos son GET. Escrituras
// que existen, y ninguna más: POST /login, POST /logout, POST /solicitudes (proxy al
// admin: crea una solicitud de resurtido que ejecuta la TC52) y
// POST /alertas/:id/descartar (SQLite propio). La prueba de rutas lo verifica.
import express from 'express';
import { config } from '../config.js';
import { AdminNoResponde, pedirAlAdmin } from '../datos/admin.js';
import { traerMovimientosProducto } from '../datos/fuente.js';
import { descartadas, descartar, deshacer } from '../db/propio.js';
import { log } from '../log.js';
import {
  asegurarDatos, capacidades, estadoMotor, hayDatos, marcarUso, obtenerSnapshot,
} from '../servicios/inventario.js';
import {
  vistaAlertas, vistaBuscar, vistaEstado, vistaInventario, vistaMovimiento, vistaProducto, vistaResurtir,
} from '../servicios/vistas.js';
import {
  borrarCookie, exigeSesion, ipDe, ponerCookie, revisarLogin, usuarioDe,
} from './auth.js';
import { crearProxySolicitudes } from './solicitudes.js';

const siNo = v => v === '1' || v === 'true' || v === 'si';
const ID_ALERTA = /^[a-z_]{2,40}:[A-Za-z0-9._\-]{1,64}$/;
const CODIGO_OK = /^[A-Za-z0-9._\-]{1,64}$/;

// Las solicitudes pendientes del admin se piden para la pantalla Resurtir; con 30 s
// de caché para que cambiar de filtro diez veces no sean diez llamadas al admin.
const CACHE_PENDIENTES_MS = 30_000;
let cachePendientes = { cuando: 0, valor: null };

export function crearRutas() {
  const r = express.Router();

  // ── Entrar y salir ──────────────────────────────────────────────────────
  r.post('/login', express.json({ limit: '1kb' }), async (req, res) => {
    const { usuario, contrasena } = req.body ?? {};
    const resultado = await revisarLogin({ usuario, contrasena, ip: ipDe(req) });
    if (!resultado.ok) {
      // Mensaje genérico a propósito: no se dice si el usuario existe.
      if (resultado.motivo === 'muchos_intentos') {
        res.status(429).json({ error: `Demasiados intentos. Espera ${config.sesion.intentosVentanaMin} minutos.` });
        return;
      }
      if (resultado.motivo === 'ocupado') {
        res.status(429).json({ error: 'Hay muchos intentos ahorita. Inténtalo en un minuto.' });
        return;
      }
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    ponerCookie(res, resultado.usuario);
    res.json({ ok: true, usuario: resultado.usuario });
  });

  r.post('/logout', (req, res) => {
    borrarCookie(res);
    res.json({ ok: true });
  });

  // ── De aquí para abajo, se necesita sesión ──────────────────────────────
  r.use(exigeSesion);
  // Ya con sesión: esto cuenta como "alguien está usando la app" y por eso se
  // vuelven a programar los refrescos.
  r.use((req, _res, siguiente) => { marcarUso(); siguiente(); });

  /**
   * Devuelve la foto en memoria o avisa que todavía se está calculando. El
   * manejador puede ser async: si truena, cae al manejador de errores de app.js.
   */
  const conDatos = manejador => (req, res, siguiente) => {
    asegurarDatos({ forzar: siNo(req.query.fresco) });
    if (!hayDatos()) {
      res.status(503).json({
        listo: false,
        calculando: true,
        mensaje: 'Estamos juntando la información del inventario. Tarda unos segundos.',
      });
      return;
    }
    Promise.resolve().then(() => manejador(req, res, obtenerSnapshot())).catch(siguiente);
  };

  r.get('/estado', (req, res) => {
    asegurarDatos({ forzar: siNo(req.query.fresco) });
    res.json(vistaEstado(obtenerSnapshot(), estadoMotor(), usuarioDe(req), {
      capacidades: capacidades(),
      umbrales: config.umbrales,
    }));
  });

  r.get('/inventario', conDatos((req, res, snap) => {
    res.json(vistaInventario(snap, {
      area: req.query.area,
      condiciones: req.query.condiciones,
      prioridad: req.query.prioridad,
      categoria: req.query.categoria,
      orden: req.query.orden,
      q: req.query.q,
      pagina: req.query.pagina,
      porPagina: req.query.porPagina,
      soloConPiezas: req.query.soloConPiezas,
      cocina: req.query.cocina,
    }));
  }));

  r.get('/buscar', conDatos((req, res, snap) => {
    res.json(vistaBuscar(snap, { q: req.query.q ?? '' }));
  }));

  r.get('/producto/:codigo', conDatos(async (req, res, snap) => {
    const codigo = String(req.params.codigo ?? '').trim();
    if (!CODIGO_OK.test(codigo) || (!snap.porCodigo.has(codigo) && !snap.catalogoCompleto?.has(codigo))) {
      res.status(404).json({ error: 'Ese producto no está en la lista' });
      return;
    }
    // Movimientos y solicitudes son "lo mejor que se pueda": si la base o el admin
    // no contestan, la ficha sale igual, sin esa parte.
    const movimientos = await traerMovimientosProducto(codigo).catch(e => {
      log.aviso('web', `sin movimientos para ${codigo}`, e);
      return [];
    });
    const solicitudes = await solicitudesDelProducto(codigo);
    res.json({ producto: vistaProducto(snap, codigo, { movimientos, solicitudes }) });
  }));

  r.get('/resurtir', conDatos(async (req, res, snap) => {
    const admin = await pendientesDelAdmin();
    res.json(vistaResurtir(snap, {
      horizonte: req.query.horizonte,
      condicion: req.query.condicion,
      area: req.query.area,
      categoria: req.query.categoria,
      prioridad: req.query.prioridad,
      cocina: req.query.cocina,
      sinConteo: req.query.sinConteo,
      q: req.query.q,
      tope: req.query.tope,
    }, {
      pendientes: admin?.solicitudes ?? null,
      conteo: admin?.conteo ?? null,
      coberturaBajaDias: config.umbrales.coberturaBajaDias,
    }));
  }));

  r.get('/movimiento', conDatos((req, res, snap) => {
    res.json(vistaMovimiento(snap, {
      dias: req.query.dias,
      area: req.query.area,
      cocina: req.query.cocina,
    }));
  }));

  r.get('/alertas', conDatos((req, res, snap) => {
    res.json(vistaAlertas(snap, {
      filtro: req.query.filtro,
      descartadas: req.query.descartadas,
      limite: req.query.limite,
    }, { descartadas: descartadas() }));
  }));

  // La única escritura propia: descartar (o des-descartar) una alerta. Se guarda
  // en data/invetory.db con usuario y fecha; no toca nada del negocio.
  r.post('/alertas/:id/descartar', express.json({ limit: '1kb' }), conDatos((req, res, snap) => {
    const id = String(req.params.id ?? '').trim();
    if (!ID_ALERTA.test(id)) {
      res.status(400).json({ error: 'Alerta no válida' });
      return;
    }
    const quitar = !!(req.body && req.body.deshacer === true);
    if (quitar) {
      deshacer(id);
      res.json({ ok: true, descartada: null });
      return;
    }
    const alerta = (snap.alertas ?? []).find(a => a.id === id);
    if (!alerta) {
      res.status(404).json({ error: 'Esa alerta ya no existe' });
      return;
    }
    const marca = descartar(id, { tipo: alerta.tipo, codigo: alerta.codigo, usuario: req.usuario });
    res.json({ ok: true, descartada: { usuario: marca.usuario, cuando: marca.cuando } });
  }));

  // ── Solicitudes de resurtido: proxy al admin (solo esas rutas) ──────────
  r.use('/solicitudes', crearProxySolicitudes({ obtenerSnapshot, alCrear: _limpiarCachePendientes }));

  // Cualquier otra cosa bajo /api no existe (y nada de PUT/PATCH/DELETE).
  r.all('*', (req, res) => res.status(404).json({ error: 'No existe' }));

  return r;
}

/** Solicitudes de un producto en el admin (10 últimas); [] si no contesta. */
async function solicitudesDelProducto(codigo) {
  if (!capacidades().solicitudes) return [];
  try {
    const q = new URLSearchParams({ codigo, limit: '10' });
    const { status, cuerpo } = await pedirAlAdmin(`/api/resurtido?${q}`, { timeoutMs: 5_000 });
    return status === 200 && Array.isArray(cuerpo?.solicitudes) ? cuerpo.solicitudes : [];
  } catch (e) {
    if (!(e instanceof AdminNoResponde)) log.aviso('web', `solicitudes de ${codigo}`, e);
    return [];
  }
}

/** Pendientes y conteo del admin para Resurtir ({solicitudes, conteo}); null si no contesta. */
async function pendientesDelAdmin() {
  if (!capacidades().solicitudes) return null;
  // También se recuerda un "no contestó": si no, cada cambio de filtro esperaría 5 s.
  if (Date.now() - cachePendientes.cuando < CACHE_PENDIENTES_MS) return cachePendientes.valor;
  try {
    const { status, cuerpo } = await pedirAlAdmin('/api/resurtido?estado=pendiente&limit=500', { timeoutMs: 5_000 });
    const valor = status === 200 && Array.isArray(cuerpo?.solicitudes)
      ? { solicitudes: cuerpo.solicitudes, conteo: cuerpo.conteo ?? null }
      : null;
    cachePendientes = { cuando: Date.now(), valor };
    return valor;
  } catch (e) {
    if (!(e instanceof AdminNoResponde)) log.aviso('web', 'pendientes del admin', e);
    cachePendientes = { cuando: Date.now(), valor: null };
    return null;
  }
}

/** Solo para pruebas: olvida las pendientes cacheadas del admin. */
export function _limpiarCachePendientes() {
  cachePendientes = { cuando: 0, valor: null };
}
