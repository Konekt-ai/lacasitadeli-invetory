// Trae los datos crudos de `compucaja` y los deja con nombres de casa.
// Aquí NO se decide nada: las reglas viven en src/calculos/.
import { consultar } from '../db/mssql.js';
import { log } from '../log.js';
import { consultaCatalogoSuelto, consultaDesfases, loteHistorial, loteRapido } from './consultas.js';

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
 * Lote pesado: última venta de todo el historial y catálogo de NovaCaja.
 * `completo` agrega las fases por código alterno/GTIN/PLU (4 s extra, 4 códigos
 * más): se usa al arrancar y cada varias horas, no en cada refresco.
 */
export async function traerHistorial({ completo = false, duplicadosDias = 120 } = {}) {
  const { recordsets, ms } = await consultar(loteHistorial({ completo, duplicadosDias }));
  const [historial, catalogo, tiempos, ventas90] = recordsets;
  log.info('datos', `lote historial ${ms} ms${completo ? ' (completo)' : ''}`, {
    codigos: historial?.length ?? 0, catalogo: catalogo?.length ?? 0,
    pasos: (tiempos ?? []).map(t => `${t.paso}:${t.ms}`).join(' '),
  });
  return {
    ms, historial: historial ?? [], catalogo: catalogo ?? [], tiempos: tiempos ?? [], ventas90: ventas90 ?? [],
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
