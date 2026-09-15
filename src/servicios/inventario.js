// El motor: mantiene en memoria la foto del inventario y decide cuándo refrescar.
//
// Reglas de rendimiento (la base es la del punto de venta):
//   · NUNCA se calcula por visita: las pantallas leen lo que ya está en memoria.
//   · Lote rápido (stock, apartados, ventas por área, desfases) cada 5 min ≈ 0.5 s de SQL.
//   · Lote pesado (última venta de 4.5 años + catálogo + ventas largas 60/90/180 +
//     ventas por día) cada 30 min ≈ 6 s de SQL; al arrancar y cada 6 h se corre
//     "completo" (≈ 10 s) con las fases por código alterno/GTIN/PLU y el catálogo
//     COMPLETO de NovaCaja (solo para el buscador).
//   · Un solo cálculo a la vez: si ya hay uno corriendo, el que llega se cuelga de
//     ese (single-flight).
//   · Si nadie entra a la app en una hora, deja de refrescar. Vuelve a hacerlo con
//     la primera visita (mostrando mientras tanto lo último que tenía).
//
// Además de la base, el motor sabe dos cosas más:
//   · los overrides del admin (foto, categoría propia, DESCONTINUADO) del SQLite
//     del panel, cada 30 min (src/db/overrides.js);
//   · si el API del admin contesta (capacidades.solicitudes): se pregunta al
//     arrancar y cada 5 min con GET /api/resurtido/ubicaciones, tiempo límite 5 s.
//     Si no contesta, el frontend esconde "Solicitar resurtido" y ya.
import { armarSnapshot } from '../calculos/armar.js';
import { config } from '../config.js';
import { capacidadesOverrides, obtenerOverrides } from '../db/overrides.js';
import { abrirPropio, cerrarPropio } from '../db/propio.js';
import { pedirAlAdmin } from '../datos/admin.js';
import { traerCatalogoSuelto, traerHistorial, traerRapido } from '../datos/fuente.js';
import { log } from '../log.js';

const estado = {
  rapido: null,             // datos del lote rápido
  historial: new Map(),     // codigo -> {codigo, ultima, v120, concepto}
  ventasAreaLargo: [],      // [{area, codigo, v60, v90, v180}] del lote de cada 30 min
  ventasDia: [],            // [{area, dia, codigo, piezas}] de 90 días, del lote de cada 30 min
  catalogoCompleto: [],     // [{art_codigo, descripcion, categoria, marca}] TODA la vista (cada 6 h)
  catalogo: new Map(),      // codigo -> {art_codigo, descripcion, categoria, marca, via}
  faltantes: new Set(),     // códigos que ya buscamos y NO están en NovaCaja
  overrides: new Map(),     // art_codigo -> {foto, categoria, descontinuado, descontinuadoDesde}
  snapshot: null,
  error: null,
  desde: {
    rapido: 0, historial: 0, completo: 0, snapshot: 0,
  },
  // Cuándo falló por última vez cada lote, para no reintentar sin parar mientras
  // SQL Server no contesta (el lote pesado escanea 4.5 años: hacerlo en cada
  // visita sería lo peor que se le puede hacer al punto de venta).
  fallo: { rapido: 0, historial: 0 },
  corriendo: { rapido: null, historial: null },
  // ¿El API del admin contesta? (para el botón "Solicitar resurtido")
  admin: { responde: false, revisado: 0, ubicaciones: null, revisando: null },
  ultimoUso: Date.now(),
  temporizadores: [],
};

export function marcarUso() {
  estado.ultimoUso = Date.now();
}

const ocioso = () => Date.now() - estado.ultimoUso > config.refresco.ociosoMin * 60_000;
const viejo = (marca, minutos) => Date.now() - marca > minutos * 60_000;

/** ¿Ya hay algo que mostrar? */
export function hayDatos() {
  return !!estado.snapshot;
}

export function obtenerSnapshot() {
  return estado.snapshot;
}

export function estadoMotor() {
  return {
    listo: !!estado.snapshot,
    generado: estado.snapshot?.generado ?? null,
    actualizado: {
      stock: estado.desde.rapido ? new Date(estado.desde.rapido).toISOString() : null,
      historial: estado.desde.historial ? new Date(estado.desde.historial).toISOString() : null,
    },
    calculando: !!(estado.corriendo.rapido || estado.corriendo.historial),
    error: estado.error,
  };
}

/**
 * Qué puede hacer esta instalación (el frontend esconde lo que no se pueda):
 *   solicitudes  el admin contestó /api/resurtido/ubicaciones (botón "Solicitar resurtido")
 *   fotos        hay ligas de foto en el SQLite del admin
 *   overrides    el SQLite del admin trae la columna `descontinuado` (admin nuevo)
 *   shopify      llegaron tipos/títulos de Shopify (categorías bonitas); hoy no
 */
export function capacidades() {
  const o = capacidadesOverrides();
  return {
    solicitudes: !!estado.admin.responde,
    fotos: !!o.fotos,
    overrides: !!o.overrides,
    shopify: !!estado.snapshot?.hayTiposShopify,
  };
}

// ── Refrescos ──────────────────────────────────────────────────────────────────

/** Minutos de calma después de que un lote falló (para no machacar a la caja). */
const ESPERA_TRAS_FALLO_MIN = { rapido: 1, historial: 5 };
const enCalma = lote => estado.fallo[lote] > 0
  && Date.now() - estado.fallo[lote] < ESPERA_TRAS_FALLO_MIN[lote] * 60_000;

export function refrescarRapido() {
  if (estado.corriendo.rapido) return estado.corriendo.rapido;
  if (enCalma('rapido')) return Promise.resolve();
  estado.corriendo.rapido = (async () => {
    const datos = await traerRapido(config.umbrales);
    estado.rapido = datos;
    estado.desde.rapido = Date.now();
    estado.fallo.rapido = 0;
    await completarCatalogoFaltante(datos);
    recomputar();
  })()
    .catch(e => {
      estado.error = 'No se pudo leer el inventario de la caja.';
      estado.fallo.rapido = Date.now();
      log.error('motor', 'falló el lote rápido', e);
    })
    .finally(() => { estado.corriendo.rapido = null; });
  return estado.corriendo.rapido;
}

export function refrescarHistorial({ completo = false } = {}) {
  if (estado.corriendo.historial) return estado.corriendo.historial;
  if (enCalma('historial')) return Promise.resolve();
  estado.corriendo.historial = (async () => {
    const datos = await traerHistorial({
      completo,
      duplicadosDias: config.umbrales.duplicadosDias,
      ventasDiaDias: config.umbrales.ventasDiaDias,
    });
    mezclarHistorial(datos.historial, completo);
    estado.ventasAreaLargo = datos.ventasAreaLargo;
    estado.ventasDia = datos.ventasDia;
    // El catálogo completo solo viene con `completo`; entre uno y otro se conserva.
    if (datos.catalogoCompleto) estado.catalogoCompleto = datos.catalogoCompleto;
    for (const fila of datos.catalogo) {
      if (fila.art_codigo) estado.catalogo.set(String(fila.codigo).trim(), { ...fila, codigo: String(fila.codigo).trim() });
    }
    // Se vuelve a intentar con los que salieron "sin alta": el admin puede haberlos
    // dado de alta desde el último refresco.
    estado.faltantes = new Set();
    estado.desde.historial = Date.now();
    estado.fallo.historial = 0;
    if (completo) estado.desde.completo = Date.now();
    recomputar();
  })()
    .catch(e => {
      estado.error = 'No se pudo leer el historial de ventas.';
      estado.fallo.historial = Date.now();
      log.error('motor', 'falló el lote de historial', e);
    })
    .finally(() => { estado.corriendo.historial = null; });
  return estado.corriendo.historial;
}

/**
 * Mezcla el historial nuevo con el que ya estaba.
 *
 * El refresco de cada 30 minutos solo trae la ventana de 120 días (barato). Se
 * puede mezclar sin miedo porque una venta vieja no se mueve: la última venta solo
 * avanza. Lo que SÍ hay que reemplazar es v120 (piezas vendidas en la ventana):
 * si un código ya no aparece en la ventana, es que lleva 120 días sin venderse y
 * su v120 vuelve a cero.
 */
function mezclarHistorial(filas, completo) {
  if (completo) {
    estado.historial = new Map();
    for (const f of filas) {
      const codigo = String(f.codigo ?? '').trim();
      if (codigo) estado.historial.set(codigo, { ...f, codigo });
    }
    return;
  }
  const frescos = new Set();
  for (const f of filas) {
    const codigo = String(f.codigo ?? '').trim();
    if (!codigo) continue;
    frescos.add(codigo);
    const viejo = estado.historial.get(codigo);
    const ultimaVieja = viejo?.ultima ? new Date(viejo.ultima) : null;
    const ultimaNueva = f.ultima ? new Date(f.ultima) : null;
    estado.historial.set(codigo, {
      codigo,
      ultima: ultimaVieja && (!ultimaNueva || ultimaVieja > ultimaNueva) ? viejo.ultima : f.ultima,
      v120: f.v120,
      concepto: f.concepto ?? viejo?.concepto ?? null,
    });
  }
  for (const [codigo, fila] of estado.historial) {
    if (!frescos.has(codigo) && Number(fila.v120) !== 0) estado.historial.set(codigo, { ...fila, v120: 0 });
  }
}

/**
 * Entre dos lotes pesados pueden aparecer códigos nuevos (la TC52 contó algo que
 * no estaba). Se resuelven de a poquito para que no salgan como "sin alta en caja"
 * sin haberlos buscado.
 */
async function completarCatalogoFaltante(datos) {
  const nuevos = [];
  for (const fila of datos.inventario ?? []) {
    const codigo = String(fila.codigo ?? '').trim();
    if (!codigo || estado.catalogo.has(codigo) || estado.faltantes.has(codigo)) continue;
    nuevos.push(codigo);
  }
  if (!nuevos.length || !estado.desde.historial) return; // al arranque manda el lote pesado
  // Los ~2,000 "sin alta" ya los revisó el lote pesado hace un rato; aquí solo
  // interesan los que aparecieron después, si no se gastarían consultas de más.
  if (nuevos.length > 400) {
    for (const codigo of nuevos) estado.faltantes.add(codigo);
    return;
  }
  try {
    const encontrados = await traerCatalogoSuelto(nuevos.slice(0, 400));
    for (const fila of encontrados) estado.catalogo.set(fila.codigo, fila);
    for (const codigo of nuevos) if (!estado.catalogo.has(codigo)) estado.faltantes.add(codigo);
    if (encontrados.length) log.info('motor', `catálogo al vuelo: ${encontrados.length} de ${nuevos.length} códigos nuevos`);
  } catch (e) {
    log.aviso('motor', 'no se pudo resolver el catálogo de códigos nuevos', e);
  }
}

/**
 * Rearma la foto en memoria con lo último que haya de cada fuente.
 *
 * OJO: hace falta que el lote PESADO haya cargado al menos una vez. Si se armara
 * solo con el lote rápido, el historial y el catálogo estarían vacíos y la app
 * enseñaría los 11 mil productos como "sin alta en caja" y "nunca se ha vendido".
 * Es preferible seguir diciendo "estamos juntando la información" que mostrar algo
 * que está mal.
 */
function recomputar() {
  if (!estado.rapido) return;
  if (!estado.desde.historial) {
    log.info('motor', 'todavía no hay historial: no se publica la foto (sería toda "sin alta")');
    return;
  }
  const t0 = Date.now();
  try {
    estado.snapshot = armarSnapshot(
      {
        ahora: estado.rapido.ahora ? new Date(estado.rapido.ahora) : undefined,
        areas: estado.rapido.areas,
        mapaCajas: estado.rapido.mapaCajas,
        inventario: estado.rapido.inventario,
        reservas: estado.rapido.reservas,
        equivalencias: estado.rapido.equivalencias,
        ventasArea: estado.rapido.ventasArea,
        ventasAreaLargo: estado.ventasAreaLargo,
        ventasDia: estado.ventasDia,
        desfases: estado.rapido.desfases,
        historial: estado.historial.values(),
        catalogo: [...estado.catalogo.values()].map(c => ({ ...c, codigo: c.codigo })),
        catalogoCompleto: estado.catalogoCompleto,
        overrides: estado.overrides,
      },
      {
        ...config.umbrales,
        refrigerado: config.refrigerado,
        cocina: config.cocina,
        areasRespaldo: config.areas.respaldo,
      },
    );
    estado.desde.snapshot = Date.now();
    estado.error = null;
    log.info('motor', `foto rearmada en ${Date.now() - t0} ms`, {
      productos: estado.snapshot.productos.length,
      conPiezas: estado.snapshot.resumen.conPiezas,
      catalogoCompleto: estado.snapshot.catalogoCompleto.size,
      alertas: estado.snapshot.alertas.length,
      descontinuados: estado.snapshot.resumenDia.descontinuados,
    });
  } catch (e) {
    estado.error = 'No se pudo armar la foto del inventario.';
    log.error('motor', 'falló armarSnapshot', e);
  }
}

/** Fotos, categoría propia y descontinuados del SQLite del admin. */
async function refrescarOverrides({ forzar = false } = {}) {
  try {
    const antes = estado.overrides;
    estado.overrides = await obtenerOverrides({ forzar });
    if (estado.rapido && estado.overrides !== antes) recomputar();
  } catch (e) {
    log.aviso('motor', 'sin overrides del admin (fotos, categorías, descontinuados)', e);
  }
}

/**
 * ¿El API del admin contesta? Se pregunta con la ruta más barata del módulo de
 * resurtido y con 5 s de límite. Nunca lanza: si no contesta, `solicitudes` queda
 * en false y el frontend esconde el botón.
 * @returns {Promise<boolean>}
 */
export function revisarAdmin() {
  if (estado.admin.revisando) return estado.admin.revisando;
  estado.admin.revisando = (async () => {
    try {
      const { status, cuerpo } = await pedirAlAdmin('/api/resurtido/ubicaciones', { timeoutMs: 5_000 });
      const responde = status === 200 && Array.isArray(cuerpo?.todas);
      if (responde !== estado.admin.responde) {
        log.info('motor', responde
          ? `el admin contesta en ${config.admin.api}: se enciende "Solicitar resurtido"`
          : `el admin en ${config.admin.api} contestó ${status}: se esconde "Solicitar resurtido"`);
      }
      estado.admin.responde = responde;
      estado.admin.ubicaciones = responde ? cuerpo : null;
    } catch (e) {
      if (estado.admin.responde || !estado.admin.revisado) {
        log.aviso('motor', `el admin no contesta en ${config.admin.api}: se esconde "Solicitar resurtido"`, e?.causa ?? e);
      }
      estado.admin.responde = false;
      estado.admin.ubicaciones = null;
    } finally {
      estado.admin.revisado = Date.now();
    }
    return estado.admin.responde;
  })().finally(() => { estado.admin.revisando = null; });
  return estado.admin.revisando;
}

/** Lo último que contestó el admin en /api/resurtido/ubicaciones ({todas, venta, respaldo}) o null. */
export function ubicacionesAdmin() {
  return estado.admin.ubicaciones;
}

// ── Arranque y calendario ──────────────────────────────────────────────────────

/** Primer cálculo + temporizadores. No truena si la base no contesta. */
export async function arrancarMotor({ esperarPrimero = false } = {}) {
  // Primero lo barato (overrides del admin: un SQLite local; y el stock, 0.3 s) y
  // luego lo caro (9 s): así, en cuanto termina el historial ya hay stock y la
  // foto se arma de una vez con fotos y descontinuados. Al revés, el lote pesado
  // terminaba y recomputar() se salía porque todavía no había stock.
  // El SQLite propio (alertas descartadas) se abre aquí para que server.js no
  // tenga que saber de él; si falla, propio.js sigue en memoria y lo avisa.
  await abrirPropio();
  const primera = (async () => {
    await refrescarOverrides({ forzar: true });
    await refrescarRapido();
    await refrescarHistorial({ completo: true });
  })();
  if (esperarPrimero) await primera; else primera.catch(() => {});
  // El admin se revisa aparte: no depende de la base y no debe retrasar la foto.
  revisarAdmin();

  const cada = (minutos, fn) => {
    const t = setInterval(fn, Math.max(1, minutos) * 60_000);
    t.unref?.();
    estado.temporizadores.push(t);
  };

  cada(config.refresco.rapidoMin, () => {
    if (ocioso()) return;
    refrescarRapido();
  });
  cada(config.refresco.medioMin, () => {
    if (ocioso()) return;
    const completo = viejo(estado.desde.completo, config.refresco.historialHoras * 60);
    refrescarHistorial({ completo });
  });
  cada(config.refresco.fotosMin, () => {
    if (ocioso()) return;
    refrescarOverrides({ forzar: true });
  });
  cada(config.admin.revisarMin, () => {
    if (ocioso()) return;
    revisarAdmin();
  });
  return primera;
}

export function detenerMotor() {
  for (const t of estado.temporizadores) clearInterval(t);
  estado.temporizadores = [];
  cerrarPropio();
}

/**
 * Lo que llama la API en cada visita: no calcula, pero si los datos ya están
 * viejos (porque la app estaba ociosa) dispara el refresco en segundo plano.
 * @param {{forzar?: boolean}} [opciones]
 */
export function asegurarDatos({ forzar = false } = {}) {
  marcarUso();
  if (!estado.rapido || !estado.desde.historial) {
    // Arranque en frío: que el primer visitante no se quede esperando 10 s.
    // (Si acaba de fallar, refrescar* se sale solo: hay una calma entre intentos.)
    Promise.resolve(refrescarRapido()).then(() => refrescarHistorial({ completo: true }));
    return { calculando: true };
  }
  const stockViejo = viejo(estado.desde.rapido, forzar ? 1 : config.refresco.rapidoMin);
  if (stockViejo) refrescarRapido();
  if (viejo(estado.desde.historial, config.refresco.medioMin)) {
    refrescarHistorial({ completo: viejo(estado.desde.completo, config.refresco.historialHoras * 60) });
  }
  // Si la app estuvo ociosa, el admin también se vuelve a revisar.
  if (viejo(estado.admin.revisado, config.admin.revisarMin)) revisarAdmin();
  return { calculando: !!(estado.corriendo.rapido || estado.corriendo.historial) };
}

/** Solo para pruebas: mete una foto ya armada sin tocar la base. */
export function _ponerSnapshotDePrueba(snapshot) {
  estado.snapshot = snapshot;
  estado.desde.rapido = Date.now();
  estado.desde.historial = Date.now();
  estado.rapido = estado.rapido ?? { ahora: null };
}

/** Solo para pruebas: finge lo que contestó el admin (o que no contesta). */
export function _ponerAdminDePrueba({ responde = false, ubicaciones = null } = {}) {
  estado.admin.responde = !!responde;
  estado.admin.ubicaciones = ubicaciones;
  estado.admin.revisado = Date.now();
}
