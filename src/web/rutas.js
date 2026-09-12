// Rutas del API. TODAS las de datos son GET (esta app no escribe nada en el
// negocio); lo único que recibe POST es entrar y salir.
import express from 'express';
import { config } from '../config.js';
import {
  asegurarDatos, estadoMotor, hayDatos, marcarUso, obtenerSnapshot,
} from '../servicios/inventario.js';
import {
  DIAS_MAS_VENDIDOS, vistaBuscar, vistaEstado, vistaMasVendidos, vistaProducto, vistaResurtido, vistaSinVenta,
} from '../servicios/vistas.js';
import {
  borrarCookie, exigeSesion, ipDe, ponerCookie, revisarLogin, usuarioDe,
} from './auth.js';

const siNo = v => v === '1' || v === 'true' || v === 'si';

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

  /** Devuelve la foto en memoria o avisa que todavía se está calculando. */
  const conDatos = manejador => (req, res) => {
    asegurarDatos({ forzar: siNo(req.query.fresco) });
    if (!hayDatos()) {
      res.status(503).json({
        listo: false,
        calculando: true,
        mensaje: 'Estamos juntando la información del inventario. Tarda unos segundos.',
      });
      return;
    }
    manejador(req, res, obtenerSnapshot());
  };

  r.get('/estado', (req, res) => {
    asegurarDatos({ forzar: siNo(req.query.fresco) });
    res.json({
      ...vistaEstado(obtenerSnapshot(), estadoMotor(), usuarioDe(req)),
      umbrales: {
        descontinuadoDias: config.umbrales.descontinuadoDias,
        lentoDias: config.umbrales.lentoDias,
        nuevoDias: config.umbrales.nuevoDias,
        diasSugeridos: config.umbrales.diasSugeridos,
        ventanaVentaDiariaDias: config.umbrales.ventanaVentaDiariaDias,
      },
    });
  });

  r.get('/sin-venta', conDatos((req, res, snap) => {
    res.json(vistaSinVenta(snap, {
      clase: req.query.clase ?? 'descontinuado',
      area: req.query.area ?? '',
      dias: req.query.dias ?? 0,
      buscar: req.query.buscar ?? '',
      orden: req.query.orden === 'dias' ? 'dias' : 'piezas',
      pagina: Number(req.query.pagina) || 1,
    }, config.umbrales));
  }));

  r.get('/resurtido', conDatos((req, res, snap) => {
    res.json(vistaResurtido(snap, {
      area: req.query.area ?? '',
      incluirCocina: siNo(req.query.cocina),
      incluirSinConteo: siNo(req.query.sinConteo),
      buscar: req.query.buscar ?? '',
    }, { tope: Math.min(Number(req.query.tope) || 150, 500) }));
  }));

  r.get('/mas-vendidos', conDatos((req, res, snap) => {
    res.json(vistaMasVendidos(snap, {
      dias: DIAS_MAS_VENDIDOS.includes(Number(req.query.dias)) ? Number(req.query.dias) : 30,
      area: req.query.area ?? '',
      incluirCocina: siNo(req.query.cocina),
      limite: Math.min(Number(req.query.limite) || 50, 200),
    }));
  }));

  r.get('/buscar', conDatos((req, res, snap) => {
    res.json(vistaBuscar(snap, { q: req.query.q ?? '' }));
  }));

  r.get('/producto/:codigo', conDatos((req, res, snap) => {
    const producto = vistaProducto(snap, req.params.codigo);
    if (!producto) {
      res.status(404).json({ error: 'Ese producto no está en la lista' });
      return;
    }
    res.json({ producto });
  }));

  // Cualquier otra cosa bajo /api no existe (y nada de PUT/PATCH/DELETE).
  r.all('*', (req, res) => res.status(404).json({ error: 'No existe' }));

  return r;
}
