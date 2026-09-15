// Módulo "Movimiento": comportamiento del inventario medido en PIEZAS (sección 5
// del contrato v2). Ni una llave ni un texto de dinero: aquí solo se cuentan piezas.
//
// Funciones puras sobre el snapshot ya armado:
//   · los KPIs, el top, las categorías, las sucursales y el ranking salen de
//     `vendidas.dN` (toda la tienda) o de `porArea[area].vN` (una sucursal);
//   · el "periodo anterior" (para el % de cambio) es el mismo número de días justo
//     antes: 7 vs (14 − 7), 30 vs (60 − 30), 90 vs (180 − 90);
//   · los mapas de calor salen de `snap.ventasDiaIndice`, que arma armarSnapshot en
//     UNA pasada desde `datos.ventasDia` (90 días): Map código → Map área →
//     Map 'YYYY-MM-DD' → piezas.
//
// Fechas: todo es "naive CDMX" (las partes UTC son la hora de pared de México), así
// que el día de la semana se saca con getUTCDay() y NUNCA con getDay().

import { cambioPorciento } from './condiciones.js';

export const PERIODOS = [7, 30, 90];
export const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const DIAS_SEMANA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const redondear = (v, dec = 2) => {
  const f = 10 ** dec;
  return Math.round(num(v) * f) / f;
};
const p2 = n => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de un Date naive CDMX (partes UTC) o de un texto que empiece así. */
export function claveDia(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return `${valor.getUTCFullYear()}-${p2(valor.getUTCMonth() + 1)}-${p2(valor.getUTCDate())}`;
  }
  const s = String(valor).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : claveDia(new Date(s));
}

/** Índice 0..6 con lunes = 0 (getUTCDay da domingo = 0). */
export function diaSemanaDe(clave) {
  const [a, m, d] = String(clave).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return (dia + 6) % 7;
}

/** La clave del día que está `atras` días antes de `ahora` (naive CDMX). */
function claveHace(ahora, atras) {
  const base = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return claveDia(new Date(base - atras * 86_400_000));
}

/**
 * Arma el índice de ventas por día en UNA pasada.
 * @param {Array<{area: string, dia: Date|string, codigo: string, piezas: number}>} filas
 * @param {{porCodigo?: Map, equivalencias?: Map<string, {base: string, unidades: number}>}} [opciones]
 *   porCodigo: si viene, solo se indexan los códigos que están en el snapshot;
 *   equivalencias: código de caja → producto suelto (se suman ×unidades al suelto).
 * @returns {Map<string, Map<string, Map<string, number>>>}
 */
export function indexarVentasDia(filas, { porCodigo = null, equivalencias = null } = {}) {
  const indice = new Map();
  const sumar = (codigo, area, clave, piezas) => {
    let porArea = indice.get(codigo);
    if (!porArea) indice.set(codigo, (porArea = new Map()));
    let porDia = porArea.get(area);
    if (!porDia) porArea.set(area, (porDia = new Map()));
    porDia.set(clave, (porDia.get(clave) ?? 0) + piezas);
  };
  for (const f of filas ?? []) {
    const codigo = String(f.codigo ?? '').trim();
    const clave = claveDia(f.dia ?? f.fecha);
    const piezas = num(f.piezas ?? f.cantidad);
    if (!codigo || !clave || !piezas) continue;
    const area = String(f.area ?? '').trim() || 'Sin área';
    if (!porCodigo || porCodigo.has(codigo)) sumar(codigo, area, clave, piezas);
    const eq = equivalencias?.get(codigo);
    if (eq && eq.base !== codigo && (!porCodigo || porCodigo.has(eq.base))) {
      sumar(eq.base, area, clave, piezas * Math.max(1, num(eq.unidades) || 1));
    }
  }
  return indice;
}

/**
 * Nota del mapa de calor: el día (o los dos días) con más piezas.
 *   · si los dos días más fuertes juntan más del 40 %: "Sábado y domingo concentran…"
 *   · si no: "El viernes concentra el mayor movimiento"
 *   · sin datos: null
 * @param {number[]} porDia 7 valores, lunes primero
 */
export function notaCalor(porDia) {
  const valores = (porDia ?? []).map(num);
  const total = valores.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  const orden = valores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const [primero, segundo] = orden;
  if (segundo && segundo.v > 0 && (primero.v + segundo.v) / total > 0.4) {
    const [a, b] = [primero.i, segundo.i].sort((x, y) => x - y);
    const nombreA = DIAS_SEMANA_LARGO[a];
    return `${nombreA.charAt(0).toUpperCase()}${nombreA.slice(1)} y ${DIAS_SEMANA_LARGO[b]} concentran el mayor movimiento`;
  }
  return `El ${DIAS_SEMANA_LARGO[primero.i]} concentra el mayor movimiento`;
}

/**
 * @param {object} snap  snapshot de armarSnapshot (productos, porCodigo, areasVenta, ventasDiaIndice, ahora)
 * @param {{dias?: number|string, area?: string, incluirCocina?: boolean}} [filtros]
 */
export function calcularMovimiento(snap, filtros = {}) {
  const dias = PERIODOS.includes(Number(filtros.dias)) ? Number(filtros.dias) : 30;
  const area = String(filtros.area ?? '').trim();
  const incluirCocina = !!filtros.incluirCocina;
  const ahora = snap?.ahora ?? new Date();
  const areasVenta = snap?.areasVenta ?? [];

  // "Cocina" incluye lo que nunca se contó en ninguna área: son los códigos
  // genéricos con los que se cobra la comida hecha en casa (igual que en la v1).
  const visible = p => incluirCocina || !(p.esCocina || p.nuncaContado);
  const enArea = (p, n) => num(p.porArea?.get?.(area)?.[`v${n}`]);
  const total = (p, n) => num(p.vendidas?.[`d${n}`]);
  const vender = area ? enArea : total;
  const piezasEnTienda = p => (area ? (p.porArea?.get?.(area)?.cantidad ?? null) : num(p.piezas));

  const productos = (snap?.productos ?? []).filter(visible);

  // ── KPIs: 7 / 30 / 90 contra el periodo anterior ───────────────────────────
  const sumas = { 7: 0, 14: 0, 30: 0, 60: 0, 90: 0, 180: 0 };
  for (const p of productos) {
    for (const n of [7, 14, 30, 60, 90, 180]) sumas[n] += vender(p, n);
  }
  const kpi = n => {
    const piezas = redondear(sumas[n]);
    // Si no hay datos del periodo doble (p. ej. todavía no llega v180), no se inventa.
    const anterior = sumas[2 * n] >= sumas[n] ? redondear(sumas[2 * n] - sumas[n]) : null;
    return { piezas, anterior, cambio: anterior === null ? null : cambioPorciento(piezas, anterior) };
  };
  const kpis = { d7: kpi(7), d30: kpi(30), d90: kpi(90) };

  // ── Por producto en el periodo elegido ─────────────────────────────────────
  const filas = [];
  const porCategoria = new Map();
  for (const p of productos) {
    const piezas = vender(p, dias);
    if (!(piezas > 0)) continue;
    const doble = vender(p, dias * 2);
    const anterior = doble >= piezas ? doble - piezas : null;
    filas.push({ p, piezas, anterior, cambio: anterior === null ? null : cambioPorciento(piezas, anterior) });
    const cat = p.categoria || 'Sin categoría';
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + piezas);
  }
  filas.sort((a, b) => b.piezas - a.piezas || a.p.nombre.localeCompare(b.p.nombre, 'es') || a.p.codigo.localeCompare(b.p.codigo));

  const top = filas.slice(0, 10).map(f => ({
    codigo: f.p.codigo,
    nombre: f.p.nombre,
    foto: f.p.foto ?? null,
    categoria: f.p.categoria || 'Sin categoría',
    piezas: redondear(f.piezas),
    piezasEnTienda: piezasEnTienda(f.p),
    tendencia: f.cambio,
  }));

  const totalCategorias = [...porCategoria.values()].reduce((s, v) => s + v, 0);
  const categorias = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, 12)
    .map(([nombre, piezas]) => ({
      nombre,
      piezas: redondear(piezas),
      porcentaje: totalCategorias > 0 ? redondear((piezas / totalCategorias) * 100, 1) : 0,
    }));

  // ── Comparativo por sucursal (siempre todas las áreas de venta) ─────────────
  const porSucursal = areasVenta.map(nombre => ({ area: nombre, piezas: 0 }));
  for (const p of productos) {
    for (const s of porSucursal) s.piezas += num(p.porArea?.get?.(s.area)?.[`v${dias}`]);
  }
  const totalSucursales = porSucursal.reduce((s, x) => s + x.piezas, 0);
  const sucursales = porSucursal.map(s => ({
    area: s.area,
    piezas: redondear(s.piezas),
    porcentaje: totalSucursales > 0 ? redondear((s.piezas / totalSucursales) * 100, 1) : 0,
  }));

  // ── Aceleran / bajan: mínimo 10 piezas en el periodo para no ver ruido ──────
  const conCambio = filas.filter(f => f.piezas >= 10 && f.cambio !== null);
  const tendenciaJson = f => ({
    codigo: f.p.codigo, nombre: f.p.nombre, piezas: redondear(f.piezas),
    anterior: redondear(f.anterior), cambio: f.cambio,
  });
  const aceleran = conCambio.filter(f => f.cambio > 0)
    .sort((a, b) => b.cambio - a.cambio || b.piezas - a.piezas).slice(0, 5).map(tendenciaJson);
  const bajan = conCambio.filter(f => f.cambio < 0)
    .sort((a, b) => a.cambio - b.cambio || b.piezas - a.piezas).slice(0, 5).map(tendenciaJson);

  // ── Mapas de calor (ventas por día) ────────────────────────────────────────
  const claves = [];
  const semanaDe = new Map();      // clave -> 0..6
  for (let atras = dias - 1; atras >= 0; atras--) {
    const clave = claveHace(ahora, atras);
    claves.push(clave);
    semanaDe.set(clave, diaSemanaDe(clave));
  }
  const porFecha = new Map(claves.map(c => [c, 0]));
  const porDia = [0, 0, 0, 0, 0, 0, 0];
  const categoriaDia = new Map();  // categoría -> [7]
  const sucursalDia = new Map(areasVenta.map(a => [a, [0, 0, 0, 0, 0, 0, 0]]));
  const porCodigo = snap?.porCodigo ?? new Map();
  for (const [codigo, porArea] of snap?.ventasDiaIndice ?? []) {
    const p = porCodigo.get(codigo);
    if (!p || !visible(p)) continue;
    const cat = p.categoria || 'Sin categoría';
    for (const [nombreArea, dias_] of porArea) {
      const fila = sucursalDia.get(nombreArea);
      const cuenta = !area || nombreArea === area;
      if (!fila && !cuenta) continue;
      for (const [clave, piezas] of dias_) {
        const w = semanaDe.get(clave);
        if (w === undefined) continue;
        // El comparativo por sucursal no respeta el filtro de área: es para comparar.
        if (fila) fila[w] += piezas;
        if (!cuenta) continue;
        porFecha.set(clave, porFecha.get(clave) + piezas);
        porDia[w] += piezas;
        let c = categoriaDia.get(cat);
        if (!c) categoriaDia.set(cat, (c = [0, 0, 0, 0, 0, 0, 0]));
        c[w] += piezas;
      }
    }
  }
  const sumaFila = v => v.reduce((s, x) => s + x, 0);
  const calor = {
    dias: DIAS_SEMANA,
    categoriaDia: [...categoriaDia.entries()]
      .sort((a, b) => sumaFila(b[1]) - sumaFila(a[1]) || a[0].localeCompare(b[0], 'es'))
      .slice(0, 10)
      .map(([nombre, valores]) => ({ nombre, valores: valores.map(v => redondear(v)) })),
    sucursalDia: [...sucursalDia.entries()].map(([nombre, valores]) => ({ nombre, valores: valores.map(v => redondear(v)) })),
    fechas: claves.map(clave => ({ fecha: clave, dia: DIAS_SEMANA[semanaDe.get(clave)], piezas: redondear(porFecha.get(clave)) })),
    nota: notaCalor(porDia),
  };

  // ── Ranking de rotación ────────────────────────────────────────────────────
  const ranking = filas.slice(0, 100).map(f => ({
    codigo: f.p.codigo,
    nombre: f.p.nombre,
    categoria: f.p.categoria || 'Sin categoría',
    piezas: redondear(f.piezas),
    pzasDia: redondear(f.piezas / dias),
    rotacion: num(f.p.rotacion),
    diasSinMovimiento: f.p.diasSinMovimiento ?? null,
    piezasEnTienda: piezasEnTienda(f.p),
  }));

  return {
    filtros: { dias, area, incluirCocina },
    kpis,
    top,
    categorias,
    sucursales,
    aceleran,
    bajan,
    calor,
    ranking,
  };
}
