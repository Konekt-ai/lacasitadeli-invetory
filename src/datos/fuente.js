// Trae los datos crudos de `compucaja` y los deja con nombres de casa.
// Aquí NO se decide nada: las reglas viven en src/calculos/.
import { consultar } from '../db/mssql.js';
import { log } from '../log.js';
import { consultaCatalogoSuelto, loteHistorial, loteRapido } from './consultas.js';

/** Lote rápido: stock, apartados, áreas, mapa de cajas y ventas por área. */
export async function traerRapido(opciones = {}) {
  const { recordsets, ms } = await consultar(loteRapido(opciones));
  const [areas, mapaCajas, inventario, reservas, equivalencias, ventasArea, reloj] = recordsets;
  log.info('datos', `lote rápido ${ms} ms`, {
    inventario: inventario?.length ?? 0, ventasArea: ventasArea?.length ?? 0,
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
  };
}

/**
 * Lote pesado: última venta de todo el historial y catálogo de NovaCaja.
 * `completo` agrega las fases por código alterno/GTIN/PLU (4 s extra, 4 códigos
 * más): se usa al arrancar y cada varias horas, no en cada refresco.
 */
export async function traerHistorial({ completo = false, duplicadosDias = 120 } = {}) {
  const { recordsets, ms } = await consultar(loteHistorial({ completo, duplicadosDias }));
  const [historial, catalogo, tiempos] = recordsets;
  log.info('datos', `lote historial ${ms} ms${completo ? ' (completo)' : ''}`, {
    codigos: historial?.length ?? 0, catalogo: catalogo?.length ?? 0,
    pasos: (tiempos ?? []).map(t => `${t.paso}:${t.ms}`).join(' '),
  });
  return { ms, historial: historial ?? [], catalogo: catalogo ?? [], tiempos: tiempos ?? [] };
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
