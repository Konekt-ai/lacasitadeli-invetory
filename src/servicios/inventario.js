// El motor: mantiene en memoria la foto del inventario y decide cuándo refrescar.
//
// Reglas de rendimiento (la base es la del punto de venta):
//   · NUNCA se calcula por visita: las pantallas leen lo que ya está en memoria.
//   · Lote rápido (stock, apartados, ventas por área, desfases) cada 5 min ≈ 0.5 s de SQL.
//   · Lote pesado (última venta de 4.5 años + catálogo + ventas de 90 días) cada
//     30 min ≈ 6 s de SQL;
//     al arrancar y cada 6 h se corre "completo" (≈ 9.5 s) con las fases por código
//     alterno/GTIN/PLU.
//   · Un solo cálculo a la vez: si ya hay uno corriendo, el que llega se cuelga de
//     ese (single-flight).
//   · Si nadie entra a la app en una hora, deja de refrescar. Vuelve a hacerlo con
//     la primera visita (mostrando mientras tanto lo último que tenía).
import { armarSnapshot } from '../calculos/armar.js';
import { config } from '../config.js';
import { obtenerFotos } from '../db/fotos.js';
import { traerCatalogoSuelto, traerHistorial, traerRapido } from '../datos/fuente.js';
import { log } from '../log.js';

const estado = {
  rapido: null,          // datos del lote rápido
  historial: new Map(),  // codigo -> {codigo, ultima, v120, concepto}
  ventas90: [],          // [{area, codigo, v90}] del lote de cada 30 min
  catalogo: new Map(),   // codigo -> {art_codigo, descripcion, categoria, marca, via}
  faltantes: new Set(),  // códigos que ya buscamos y NO están en NovaCaja
  fotos: new Map(),
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
    const datos = await traerHistorial({ completo, duplicadosDias: config.umbrales.duplicadosDias });
    mezclarHistorial(datos.historial, completo);
    estado.ventas90 = datos.ventas90;
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
        ventasArea90: estado.ventas90,
        desfases: estado.rapido.desfases,
        historial: estado.historial.values(),
        catalogo: [...estado.catalogo.values()].map(c => ({ ...c, codigo: c.codigo })),
        fotos: estado.fotos,
      },
      {
        ...config.umbrales,
        cocina: config.cocina,
        areasRespaldo: config.areas.respaldo,
      },
    );
    estado.desde.snapshot = Date.now();
    estado.error = null;
    log.info('motor', `foto rearmada en ${Date.now() - t0} ms`, {
      productos: estado.snapshot.productos.length,
      conPiezas: estado.snapshot.resumen.conPiezas,
    });
  } catch (e) {
    estado.error = 'No se pudo armar la foto del inventario.';
    log.error('motor', 'falló armarSnapshot', e);
  }
}

async function refrescarFotos() {
  try {
    estado.fotos = await obtenerFotos();
    if (estado.rapido) recomputar();
  } catch (e) {
    log.aviso('motor', 'sin fotos', e);
  }
}

// ── Arranque y calendario ──────────────────────────────────────────────────────

/** Primer cálculo + temporizadores. No truena si la base no contesta. */
export async function arrancarMotor({ esperarPrimero = false } = {}) {
  // Primero lo barato (0.3 s) y luego lo caro (9 s): así, en cuanto termina el
  // historial ya hay stock y la foto se puede armar de una vez. Al revés, el lote
  // pesado terminaba y recomputar() se salía porque todavía no había stock.
  const primera = (async () => {
    await refrescarRapido();
    await refrescarHistorial({ completo: true });
    await refrescarFotos();
  })();
  if (esperarPrimero) await primera; else primera.catch(() => {});

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
    refrescarFotos();
  });
  return primera;
}

export function detenerMotor() {
  for (const t of estado.temporizadores) clearInterval(t);
  estado.temporizadores = [];
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
  return { calculando: !!(estado.corriendo.rapido || estado.corriendo.historial) };
}

/** Solo para pruebas: mete una foto ya armada sin tocar la base. */
export function _ponerSnapshotDePrueba(snapshot) {
  estado.snapshot = snapshot;
  estado.desde.rapido = Date.now();
  estado.desde.historial = Date.now();
  estado.rapido = estado.rapido ?? { ahora: null };
}
