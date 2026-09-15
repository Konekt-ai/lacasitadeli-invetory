// Proxy de las solicitudes de resurtido hacia el API del admin.
//
// Es la ÚNICA escritura sobre el negocio que sale de esta app: "Solicitar
// resurtido" crea una tarea que el de bodega ejecuta con la TC52 (mueve las
// piezas y las registra escaneando; la solicitud se cierra sola). Por eso sí es
// un botón: hace algo real. Esta app NO cancela ni marca hechas.
//
// Reglas:
//   · solo las rutas de la tabla del contrato (sección 4); nada más del admin se
//     expone (ni /api/products, ni /api/novacaja, ni nada);
//   · siempre con sesión (el router se monta después de exigeSesion);
//   · se valida aquí ANTES de molestar al admin (código, cantidad, destino en las
//     áreas activas, nota corta, producto no descontinuado);
//   · el status y el cuerpo del admin se pasan tal cual (200/400/404/409), solo
//     sin llaves de dinero y con las fechas en -06:00 (src/datos/admin.js);
//   · si el admin no contesta en 10 s: 503 con un mensaje que se entiende.
import express from 'express';
import { AdminNoResponde, MENSAJE_ADMIN_CAIDO, pedirAlAdmin } from '../datos/admin.js';
import { log } from '../log.js';

const ESTADOS = ['pendiente', 'hecha', 'cancelada', 'todas'];
const CODIGO_OK = /^[A-Za-z0-9._\-]{1,60}$/;
const ID_OK = /^\d{1,9}$/;
const UBICACION_OK = /^[^\r\n]{1,50}$/;
const NOTA_MAX = 200;

const texto = v => String(v ?? '').trim();

/**
 * @param {{obtenerSnapshot: () => object|null, alCrear?: () => void}} dependencias
 *   obtenerSnapshot: la foto en memoria (para validar áreas y "descontinuado")
 *   alCrear: se llama cuando el admin aceptó una solicitud nueva (para olvidar la
 *            caché de pendientes y que Resurtir la marque de inmediato)
 */
export function crearProxySolicitudes({ obtenerSnapshot, alCrear }) {
  const r = express.Router();

  /** Manda al admin y contesta con lo que diga; 503 si no contesta. */
  const reenviar = async (res, ruta, opciones) => {
    try {
      const { status, cuerpo } = await pedirAlAdmin(ruta, opciones);
      res.status(status).json(cuerpo);
      return status;
    } catch (e) {
      if (!(e instanceof AdminNoResponde)) throw e;
      log.aviso('solicitudes', `el admin no contestó ${opciones?.metodo ?? 'GET'} ${ruta}`, e.causa ?? e);
      res.status(503).json({ error: MENSAJE_ADMIN_CAIDO });
      return 503;
    }
  };
  const seguro = fn => (req, res, siguiente) => fn(req, res).catch(siguiente);

  // GET /api/solicitudes?estado=&codigo=&limit=  -> {solicitudes, conteo}
  r.get('/', seguro(async (req, res) => {
    const q = new URLSearchParams();
    const estado = texto(req.query.estado);
    if (ESTADOS.includes(estado)) q.set('estado', estado);
    const codigo = texto(req.query.codigo);
    if (codigo) {
      if (!CODIGO_OK.test(codigo)) { res.status(400).json({ error: 'Código no válido' }); return; }
      q.set('codigo', codigo);
    }
    const limit = Math.floor(Number(req.query.limit));
    if (limit > 0) q.set('limit', String(Math.min(limit, 500)));
    const s = q.toString();
    await reenviar(res, `/api/resurtido${s ? `?${s}` : ''}`);
  }));

  // GET /api/solicitudes/pendientes
  r.get('/pendientes', seguro(async (req, res) => {
    await reenviar(res, '/api/resurtido/pendientes');
  }));

  // GET /api/solicitudes/ubicaciones -> {todas, venta, respaldo}
  r.get('/ubicaciones', seguro(async (req, res) => {
    await reenviar(res, '/api/resurtido/ubicaciones');
  }));

  // GET /api/solicitudes/sugerencia/:codigo?destino=&origen=
  r.get('/sugerencia/:codigo', seguro(async (req, res) => {
    const codigo = texto(req.params.codigo);
    const destino = texto(req.query.destino);
    const origen = texto(req.query.origen) || 'Bodega';
    if (!CODIGO_OK.test(codigo)) { res.status(400).json({ error: 'Código no válido' }); return; }
    if (!destino || !UBICACION_OK.test(destino) || !UBICACION_OK.test(origen)) {
      res.status(400).json({ error: 'Falta el destino (?destino=Casita 1)' });
      return;
    }
    const q = new URLSearchParams({ destino, origen });
    await reenviar(res, `/api/resurtido/sugerencia/${encodeURIComponent(codigo)}?${q}`);
  }));

  // GET /api/solicitudes/:id (con eventos)
  r.get('/:id', seguro(async (req, res) => {
    const id = texto(req.params.id);
    if (!ID_OK.test(id)) { res.status(404).json({ error: 'No existe' }); return; }
    await reenviar(res, `/api/resurtido/${id}`);
  }));

  // POST /api/solicitudes {codigo_barras, a_ubicacion, de_ubicacion?, cantidad, nota?}
  r.post('/', express.json({ limit: '2kb' }), seguro(async (req, res) => {
    const snap = obtenerSnapshot();
    if (!snap) {
      res.status(503).json({ listo: false, calculando: true, mensaje: 'Estamos juntando la información del inventario. Tarda unos segundos.' });
      return;
    }
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const codigo = texto(b.codigo_barras);
    const destino = texto(b.a_ubicacion);
    const origen = texto(b.de_ubicacion) || 'Bodega';
    const cantidad = Number(b.cantidad);
    const nota = b.nota === undefined || b.nota === null ? '' : String(b.nota).trim();
    const areas = new Set((snap.areas ?? []).map(a => a.nombre));

    const error = (() => {
      if (!codigo || !CODIGO_OK.test(codigo)) return 'Falta el código del producto';
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 9999) return 'La cantidad debe ser un número entero entre 1 y 9999';
      if (!destino || !areas.has(destino)) return 'El destino no es un área activa';
      if (!areas.has(origen)) return 'El origen no es un área activa';
      if (origen === destino) return 'Origen y destino deben ser diferentes';
      if (nota.length > NOTA_MAX) return `La nota no puede pasar de ${NOTA_MAX} caracteres`;
      return null;
    })();
    if (error) { res.status(400).json({ error }); return; }

    // El dueño ya decidió que no se compra ni se mueve más: no se pide.
    if (snap.porCodigo?.get(codigo)?.descontinuado) {
      res.status(400).json({ error: 'Ese producto está descontinuado' });
      return;
    }

    const cuerpo = {
      codigo_barras: codigo,
      a_ubicacion: destino,
      de_ubicacion: origen,
      cantidad,
      ...(nota ? { nota } : {}),
      usuario: req.usuario,
      origen: 'invetory',
    };
    log.info('solicitudes', `${req.usuario} pide mover ${cantidad} de ${codigo}: ${origen} -> ${destino}`);
    const status = await reenviar(res, '/api/resurtido', { metodo: 'POST', cuerpo });
    if (status === 200) alCrear?.();
  }));

  return r;
}
