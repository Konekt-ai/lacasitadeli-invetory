// Trae los datos crudos de `compucaja` y los deja con nombres de casa.
// Aquí NO se decide nada: las reglas viven en src/calculos/.
import { consultar } from '../db/mssql.js';
import { log } from '../log.js';
import {
  consultaCatalogoSuelto, consultaDesfases, consultaMovimientosProducto, loteHistorial, loteRapido,
} from './consultas.js';

let avisoSinPermisoDesfases = false;

/** Lote rápido: stock, apartados, áreas, mapa de cajas, ventas por área y desfases. */
export async function traerRapido(opciones = {}) {
  const { recordsets, ms } = await consultar(loteRapido(opciones));
  const [areas, mapaCajas, inventario, reservas, equivalencias, ventasArea, reloj] = recordsets;
  const desfases = await traerDesfases(opciones);
  log.info('datos', `lote rápido ${ms} ms`, {
    inventario: inventario?.length ?? 0, ventasArea: ventasArea?.length ?? 0,
    desfases: desfases?.length ?? 'sin datos',
  });
  return {
    ms,
    ahora: reloj?.[0]?.ahora ?? null,
    areas: areas ?? [],
    mapaCajas: mapaCajas ?? [],
    inventario: inventario ?? [],
    reservas: reservas ?? [],
    equivalencias: equivalencias ?? [],
    ventasArea: ventasArea ?? [],
    desfases: desfases ?? [],
  };
}

/**
 * Ventas registradas con existencia en 0. Si falla (p. ej. a inventory_ro le falta
 * el GRANT sobre movimientos_bodega) la app sigue funcionando, solo sin el aviso.
 */
async function traerDesfases({ desfaseDias = 90 } = {}) {
  try {
    const { recordsets } = await consultar(consultaDesfases({ dias: desfaseDias }));
    avisoSinPermisoDesfases = false;
    return recordsets[0] ?? [];
  } catch (e) {
    if (!avisoSinPermisoDesfases) {
      log.aviso('datos', 'no se pudieron leer los desfases (¿falta el GRANT sobre movimientos_bodega?)', e);
      avisoSinPermisoDesfases = true;
    }
    return null;
  }
}

/**
 * Lote pesado: última venta de todo el historial, catálogo de NovaCaja, ventas
 * largas (60/90/180) y ventas por día. `completo` agrega las fases por código
 * alterno/GTIN/PLU (4 s extra, 4 códigos más) y el catálogo COMPLETO (60 mil
 * filas, para el buscador): se usa al arrancar y cada varias horas, no en cada
 * refresco.
 *
 * Los recordsets vienen por POSICIÓN (ver el comentario de loteHistorial):
 * 0 historial · 1 catálogo · 2 tiempos · 3 ventas largas · 4 ventas por día ·
 * 5 catálogo completo (solo con completo).
 * @returns {Promise<{ms: number, historial: any[], catalogo: any[], tiempos: any[],
 *   ventasAreaLargo: any[], ventasDia: any[], catalogoCompleto: any[]|null}>}
 */
export async function traerHistorial({ completo = false, duplicadosDias = 120, ventasDiaDias = 90 } = {}) {
  const { recordsets, ms } = await consultar(loteHistorial({ completo, duplicadosDias, ventasDiaDias }));
  const [historial, catalogo, tiempos, ventasAreaLargo, ventasDia, catalogoCompleto] = recordsets;
  // Los tiempos por paso quedan en el log: son la medida de cuánto le cuesta esto
  // al punto de venta (#vlargo = 'ventas-largas', #dias = 'ventas-por-dia',
  // catálogo completo = 'catalogo-completo').
  log.info('datos', `lote historial ${ms} ms${completo ? ' (completo)' : ''}`, {
    codigos: historial?.length ?? 0, catalogo: catalogo?.length ?? 0,
    ventasLargas: ventasAreaLargo?.length ?? 0, ventasDia: ventasDia?.length ?? 0,
    catalogoCompleto: completo ? (catalogoCompleto?.length ?? 0) : 'no pedido',
    pasos: (tiempos ?? []).map(t => `${t.paso}:${t.ms}`).join(' '),
  });
  const ventasPorDia = (tiempos ?? []).find(t => t.paso === 'ventas-por-dia');
  if (ventasPorDia && Number(ventasPorDia.ms) > 4000 && ventasDiaDias > 30) {
    log.aviso('datos', `las ventas por día tardaron ${ventasPorDia.ms} ms: conviene poner VENTAS_DIA_DIAS=30 en el .env`);
  }
  return {
    ms,
    historial: historial ?? [],
    catalogo: catalogo ?? [],
    tiempos: tiempos ?? [],
    ventasAreaLargo: ventasAreaLargo ?? [],
    ventasDia: ventasDia ?? [],
    // null = no se pidió (el motor conserva el que ya tenía).
    catalogoCompleto: completo ? (catalogoCompleto ?? []) : null,
  };
}

/** Catálogo de unos pocos códigos nuevos (los que aparecieron entre refrescos). */
export async function traerCatalogoSuelto(codigos) {
  const lista = [...new Set(codigos.filter(Boolean))];
  if (!lista.length) return [];
  const encontrados = [];
  for (let i = 0; i < lista.length; i += 400) {
    const trozo = lista.slice(i, i + 400);
    const { sql, parametros } = consultaCatalogoSuelto(trozo);
    const { recordsets } = await consultar(sql, parametros);
    for (const fila of recordsets[0] ?? []) {
      if (fila.art_codigo) encontrados.push(fila);
    }
  }
  return encontrados;
}

// ── Movimientos de un producto (ficha) ─────────────────────────────────────────
//
// Se piden on demand al abrir la ficha, con caché de 60 s por código: abrir y
// cerrar la misma ficha diez veces no son diez escaneos de movimientos_bodega.
const CACHE_MOVIMIENTOS_MS = 60_000;
const CACHE_MOVIMIENTOS_TOPE = 500;
/** @type {Map<string, {cuando: number, filas: any[]}>} */
const cacheMovimientos = new Map();
// ¿El login de la caja todavía no tiene GRANT sobre `area` y `stock_despues`?
let sinColumnasMovimientos = false;
let avisoSinColumnasMovimientos = false;

const esErrorDeColumna = e => /permission|permiso|denied|deneg|invalid column|no v[aá]lido|no es v[aá]lido/i.test(e?.message ?? '')
  && /\barea\b|stock_despues/i.test(e?.message ?? '');

/**
 * Últimos 20 movimientos físicos de un producto (sin `notas`). Si el permiso sobre
 * `area`/`stock_despues` falta, se reintenta sin esas dos columnas y se avisa UNA
 * vez en el log; el resto de la ficha no se entera.
 * @param {string} codigo
 * @returns {Promise<any[]>}
 */
export async function traerMovimientosProducto(codigo) {
  const c = String(codigo ?? '').trim();
  if (!c) return [];
  const enCache = cacheMovimientos.get(c);
  if (enCache && Date.now() - enCache.cuando < CACHE_MOVIMIENTOS_MS) return enCache.filas;

  let filas;
  try {
    filas = await consultarMovimientos(c, sinColumnasMovimientos);
  } catch (e) {
    if (sinColumnasMovimientos || !esErrorDeColumna(e)) throw e;
    // Faltó el GRANT nuevo (crear-login-ro.sql, 2026-09-15): se pide sin esas columnas.
    sinColumnasMovimientos = true;
    if (!avisoSinColumnasMovimientos) {
      log.aviso('datos', 'sin permiso sobre movimientos_bodega.area/stock_despues: la ficha muestra los movimientos sin origen ni stock después (corre el GRANT de scripts/crear-login-ro.sql)', e);
      avisoSinColumnasMovimientos = true;
    }
    filas = await consultarMovimientos(c, true);
  }
  guardarEnCache(c, filas);
  return filas;
}

async function consultarMovimientos(codigo, sinArea) {
  const { sql, parametros } = consultaMovimientosProducto(codigo, { sinArea });
  const { recordsets } = await consultar(sql, parametros);
  return recordsets[0] ?? [];
}

function guardarEnCache(codigo, filas) {
  cacheMovimientos.set(codigo, { cuando: Date.now(), filas });
  // Que la caché no crezca sin tope: se tira lo más viejo.
  if (cacheMovimientos.size > CACHE_MOVIMIENTOS_TOPE) {
    const masViejo = cacheMovimientos.keys().next().value;
    cacheMovimientos.delete(masViejo);
  }
}

/** Solo para pruebas: vacía la caché y olvida el aviso de columnas. */
export function _limpiarCacheMovimientos() {
  cacheMovimientos.clear();
  sinColumnasMovimientos = false;
  avisoSinColumnasMovimientos = false;
}
