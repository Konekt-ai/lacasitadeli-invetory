// Condiciones (badges) y prioridad de un producto — sección 3 del contrato v2.
//
// Un producto puede cumplir VARIAS a la vez ("Sobrestock" + "Sin movimiento 90+
// días" + "Descontinuado"), a diferencia de `clase` (clasificacion.js), que se
// queda con una sola y se conserva por compatibilidad.
//
// Reglas que costó aprender y que aquí mandan:
//   · "Descontinuado" SOLO viene de product_overrides.descontinuado = 1 (lo marca el
//     dueño en el Admin). Lo demás que lleve tiempo sin venderse es "Sin movimiento".
//   · Sin fila en un área ≠ cero: si no está contado no hay "sin stock" ni cobertura.
//   · "Sin stock" (falta en anaquel) y "agotado" NO son lo mismo, y confundirlos fue
//     la queja del jefe (2026-09-17): veía HUBBA BUBBA con 202 piezas bajo "Sin
//     stock" porque en Casita 1 había 0 y las 202 estaban en Casita 2. Ahora:
//       sin_stock = se vende en una sucursal, ahí hay 0, pero HAY en otra área
//                   (lo que toca es MOVERLAS);
//       agotado   = se vende y no hay en NINGUNA área contada (toca comprarlo).
//     Los dos traen `faltaEn` (dónde falta) y `hayEn` (dónde sí hay) para que la
//     tarjeta lo diga en una frase.
//   · Un área DESFASADA (contada en 0 y se sigue vendiendo) tiene un 0 falso: no
//     cuenta como "sin stock" ni da cobertura; su badge es "Desfasado: cuéntalo".
//   · Lo apartado por la página web no está disponible (disponible = físico − apartado).
//   · Nuevo sin venta (contado hace < 30 días y nunca vendido) NO lleva "sin movimiento".
//
// Todo es una función pura: entra un producto ya armado (armar.js) y salen números.

import { diasEntre } from './fechas.js';

export const CONDICIONES = [
  'agotado', 'sin_stock', 'bajo_stock', 'sobrestock', 'mas_vendidos', 'lento',
  'sin_movimiento_30', 'sin_movimiento_60', 'sin_movimiento_90', 'sin_movimiento_180',
  'nuevo_sin_venta', 'descontinuado', 'duplicado_probable', 'sin_alta', 'desfasado',
];

export const ETIQUETAS_CONDICION = {
  agotado: 'Agotado',
  sin_stock: 'Falta en anaquel',
  bajo_stock: 'Bajo stock',
  sobrestock: 'Sobrestock',
  mas_vendidos: 'Más vendido',
  lento: 'Lento',
  sin_movimiento_30: 'Sin movimiento 30+ días',
  sin_movimiento_60: 'Sin movimiento 60+ días',
  sin_movimiento_90: 'Sin movimiento 90+ días',
  sin_movimiento_180: 'Sin movimiento 180+ días',
  nuevo_sin_venta: 'Nuevo, sin venta',
  descontinuado: 'Descontinuado',
  duplicado_probable: 'Posible código duplicado',
  sin_alta: 'Sin alta en caja',
  desfasado: 'Desfasado: cuéntalo',
};

export const PRIORIDADES = ['alta', 'media', 'baja'];

export const OPCIONES_CONDICIONES = {
  ventanaVentaDiariaDias: 14,
  coberturaUrgenteDias: 2,
  coberturaBajaDias: 7,
  sobrestockDias: 120,
  sobrestockMin: 24,
  lentoDias: 30,
  sinMovimientoDias: 90,     // "lento" va de lentoDias a aquí (antes se llamaba descontinuadoDias)
  nuevoDias: 30,
  tramosSinMovimiento: [30, 60, 90, 180],
  areasVenta: [],
};

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const contado = a => a && a.cantidad !== null && a.cantidad !== undefined;
const redondear = (v, dec = 2) => {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
};

/** Acepta el Map de armar.js o una lista de áreas (para las pruebas). */
function listaAreas(porArea) {
  if (!porArea) return [];
  if (porArea instanceof Map) return [...porArea.values()];
  if (Array.isArray(porArea)) return porArea;
  return Object.values(porArea);
}

/**
 * Cambio en % contra el periodo anterior de la misma duración. `null` si el
 * periodo anterior fue 0 (o no se conoce: si no hay v180, el anterior de 90 sale
 * negativo y tampoco dice nada).
 */
export function cambioPorciento(actual, anterior) {
  const a = num(anterior);
  if (!(a > 0)) return null;
  return redondear(((num(actual) - a) / a) * 100, 1);
}

/**
 * Cuántos días lleva sin moverse: desde la última venta; si nunca vendió, desde la
 * primera vez que se contó (creado); si tampoco, desde la última entrada.
 * OJO: NO se usa ultima_entrada como primera opción para los nunca vendidos: esa
 * fecha se mueve con cada surtido interno (ver clasificacion.js).
 */
export function diasSinMovimientoDe(p, ahora) {
  if (p.ultimaVenta) return diasEntre(p.ultimaVenta, ahora);
  if (p.primeraVez) return diasEntre(p.primeraVez, ahora);
  if (p.ultimaEntrada) return diasEntre(p.ultimaEntrada, ahora);
  return null;
}

/** El tramo MAYOR que cumpla (0 si ninguno). */
export function tramoDe(dias, tramos = OPCIONES_CONDICIONES.tramosSinMovimiento) {
  if (dias === null || dias === undefined) return 0;
  let tramo = 0;
  for (const t of tramos) if (dias >= t && t > tramo) tramo = t;
  return tramo;
}

/**
 * Prioridad: alta si "sin stock", desfasado o alguna área de venta con cobertura
 * menor al umbral urgente; media si "bajo stock"; baja el resto.
 * @param {{condiciones: string[], areas?: Array<{cobertura: number|null}>}} r
 * @param {{coberturaUrgenteDias?: number}} [opciones]
 */
export function calcularPrioridad(r, opciones = {}) {
  const urgente = opciones.coberturaUrgenteDias ?? OPCIONES_CONDICIONES.coberturaUrgenteDias;
  const c = new Set(r.condiciones ?? []);
  if (c.has('agotado') || c.has('sin_stock') || c.has('desfasado')) return 'alta';
  for (const a of r.areas ?? []) {
    if (a.cobertura !== null && a.cobertura !== undefined && a.cobertura < urgente) return 'alta';
  }
  if (c.has('bajo_stock')) return 'media';
  return 'baja';
}

/**
 * @param {Object} p  producto armado por armar.js (o uno de mentiras con la misma forma)
 * @param {string}  p.codigo
 * @param {boolean} p.alta            existe en NovaCaja
 * @param {boolean} [p.descontinuado] SOLO de product_overrides
 * @param {object|null} [p.duplicado] resultado de buscarDuplicados()
 * @param {boolean} [p.masVendido]    está en el top N por piezas de 30 días (lo decide armar.js)
 * @param {boolean} [p.esCocina]
 * @param {number}  p.piezas          físicas en toda la tienda
 * @param {number}  [p.apartado]      apartadas por pedidos web (toda la tienda)
 * @param {Date|null} [p.ultimaVenta]
 * @param {Date|null} [p.primeraVez]
 * @param {Date|null} [p.ultimaEntrada]
 * @param {{piezas: number}|null} [p.desfase]
 * @param {{d7:number,d14:number,d30:number,d60?:number,d90:number,d180?:number}} p.vendidas
 * @param {Map|Array} p.porArea       {area, cantidad|null, apartado, v14, desfase}
 * @param {Partial<typeof OPCIONES_CONDICIONES> & {ahora?: Date}} [opciones]
 */
export function calcularCondiciones(p, opciones = {}) {
  const o = { ...OPCIONES_CONDICIONES, ...opciones };
  const ahora = o.ahora;
  const ventana = Math.max(1, num(o.ventanaVentaDiariaDias) || 14);
  const v = p.vendidas ?? {};
  const d7 = num(v.d7); const d14 = num(v.d14); const d30 = num(v.d30);
  const d60 = num(v.d60); const d90 = num(v.d90); const d180 = num(v.d180);
  const piezas = num(p.piezas);
  const areasVenta = new Set(o.areasVenta ?? []);

  // ── Por área de venta: ¿se vende ahí?, ¿está contado?, cobertura ────────────
  const areas = [];
  for (const a of listaAreas(p.porArea)) {
    if (!a || !areasVenta.has(a.area)) continue;
    const ventaDiaria = num(a.v14) / ventana;
    const seVende = ventaDiaria > 0;
    const estaContado = contado(a);
    const disponible = estaContado ? num(a.cantidad) - num(a.apartado) : null;
    // El 0 de un área desfasada es falso (ver resurtido.js): sin cobertura.
    const desfasada = seVende && estaContado && num(a.desfase?.piezas) > 0;
    const cobertura = seVende && estaContado && !desfasada ? disponible / ventaDiaria : null;
    areas.push({
      area: a.area,
      ventaDiaria: redondear(ventaDiaria),
      disponible,
      cobertura: cobertura === null ? null : redondear(cobertura, 1),
      seVende,
      contado: estaContado,
      desfasada,
    });
  }

  // ── Números del producto ────────────────────────────────────────────────────
  const ventaDiaria = d14 / ventana;
  let coberturaDias = null;
  for (const a of areas) {
    if (a.cobertura === null) continue;
    if (coberturaDias === null || a.cobertura < coberturaDias) coberturaDias = a.cobertura;
  }
  // Cobertura de TODA la tienda (bodega incluida): es la que dice si hay de más.
  const disponibleTienda = piezas - num(p.apartado);
  const coberturaTiendaDias = ventaDiaria > 0 ? redondear(Math.max(disponibleTienda, 0) / ventaDiaria, 1) : null;
  const rotacion = redondear(d30 / Math.max(piezas, 1));
  const tendencia = {
    d7: cambioPorciento(d7, d14 - d7),
    d30: cambioPorciento(d30, d60 - d30),
    d90: cambioPorciento(d90, d180 - d90),
  };

  const diasSinVenta = p.ultimaVenta ? diasEntre(p.ultimaVenta, ahora) : null;
  const nuncaVendido = diasSinVenta === null;
  const diasSinMovimiento = diasSinMovimientoDe(p, ahora);
  const referenciaNuevo = p.primeraVez ? diasEntre(p.primeraVez, ahora)
    : (p.ultimaEntrada ? diasEntre(p.ultimaEntrada, ahora) : null);
  const esNuevoSinVenta = nuncaVendido && referenciaNuevo !== null && referenciaNuevo < o.nuevoDias;
  const tramoSinMovimiento = esNuevoSinVenta ? 0 : tramoDe(diasSinMovimiento, o.tramosSinMovimiento);

  // ── Dónde falta y dónde sí hay ──────────────────────────────────────────────
  // faltaEn: sucursales donde se vende y hay 0 (con conteo real, no desfasado).
  // hayEn: TODAS las áreas contadas con piezas disponibles (Bodega incluida), de
  // más a menos: es lo que se puede mover.
  const faltaEn = areas.filter(a => a.seVende && a.contado && !a.desfasada && a.disponible <= 0).map(a => a.area);
  const hayEn = listaAreas(p.porArea)
    .filter(a => a && contado(a) && num(a.cantidad) - num(a.apartado) > 0)
    .map(a => ({ area: a.area, piezas: redondear(num(a.cantidad) - num(a.apartado)) }))
    .sort((a, b) => b.piezas - a.piezas || a.area.localeCompare(b.area, 'es'));

  // ── Condiciones ─────────────────────────────────────────────────────────────
  const c = new Set();
  if (faltaEn.length) c.add(hayEn.length ? 'sin_stock' : 'agotado');
  for (const a of areas) {
    if (!a.seVende || !a.contado || a.desfasada) continue;
    if (a.disponible > 0 && a.cobertura !== null && a.cobertura < o.coberturaBajaDias) c.add('bajo_stock');
  }
  // Sobrestock: muchas piezas y (alcanzan para más de N días, o no se vende desde
  // hace 30 días). Un producto NUEVO todavía no puede estar "de más": apenas llegó.
  if (piezas >= o.sobrestockMin) {
    const sinVenta30 = !(d30 > 0) && !esNuevoSinVenta;
    if ((coberturaTiendaDias !== null && coberturaTiendaDias > o.sobrestockDias) || sinVenta30) c.add('sobrestock');
  }
  if (p.masVendido && !p.esCocina) c.add('mas_vendidos');
  if (!nuncaVendido && diasSinVenta >= o.lentoDias && diasSinVenta < o.sinMovimientoDias) c.add('lento');
  if (tramoSinMovimiento > 0) c.add(`sin_movimiento_${tramoSinMovimiento}`);
  if (esNuevoSinVenta) c.add('nuevo_sin_venta');
  if (p.descontinuado) c.add('descontinuado');
  if (p.duplicado) c.add('duplicado_probable');
  if (!p.alta) c.add('sin_alta');
  if (num(p.desfase?.piezas) > 0 || areas.some(a => a.desfasada)) c.add('desfasado');

  const condiciones = CONDICIONES.filter(id => c.has(id));
  const prioridad = calcularPrioridad({ condiciones, areas }, o);

  return {
    condiciones,
    prioridad,
    tramoSinMovimiento,
    diasSinMovimiento,
    diasSinVenta,
    nuncaVendido,
    rotacion,
    tendencia,
    ventaDiaria: redondear(ventaDiaria),
    coberturaDias,
    coberturaTiendaDias,
    areas,
    faltaEn,
    hayEn,
  };
}
