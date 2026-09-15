// Lo que el dueño decide desde el Admin sobre cada producto: vive en el SQLite del
// panel admin (apps/api/lacasita.db, tabla product_overrides):
//   · image_url            foto (3,354 ligas de cdn.shopify.com)
//   · categoria            categoría propia (manda sobre la de NovaCaja)
//   · descontinuado        0/1: ES el único "Descontinuado" que existe. Lo demás que
//                          lleve tiempo sin venderse es "Sin movimiento N+ días".
//   · descontinuado_desde  cuándo lo marcó (texto ISO en UTC, como todo el SQLite del admin)
//
// Ese archivo es del ADMIN y el admin le ESCRIBE (modo WAL). Reglas para no
// estorbarle (las mismas que ya tenía fotos.js):
//   · abrir readonly, sin pragmas (nada de journal_mode: lo abriría para escribir);
//   · una sola lectura corta (.all()), guardar en memoria y CERRAR;
//   · nunca dejar iteradores ni transacciones abiertas (frenan el checkpoint y el
//     archivo -wal crece sin parar);
//   · si falla, la app sigue funcionando sin fotos ni estatus (nunca truena por esto).
//
// Si el admin de la caja es viejo y todavía no tiene la columna `descontinuado`,
// se leen solo fotos y categoría y se avisa UNA vez en el log.
import { config } from '../config.js';
import { log } from '../log.js';

/** @typedef {{foto: string|null, categoria: string|null, descontinuado: boolean, descontinuadoDesde: Date|null}} Override */

/** @type {Map<string, Override>} */
let cache = new Map();
let cuando = 0;
let conEstatus = true;      // ¿el SQLite trae la columna descontinuado?
let avisoSinEstatus = false;
let ultimoError = null;

const CON_ESTATUS = `SELECT art_codigo, image_url, categoria, descontinuado, descontinuado_desde
  FROM product_overrides`;
const SIN_ESTATUS = `SELECT art_codigo, image_url, categoria, NULL AS descontinuado, NULL AS descontinuado_desde
  FROM product_overrides`;

/**
 * El SQLite del admin guarda las fechas en UTC ('2026-09-01T10:00:00.000Z' o
 * '2026-09-01 10:00:00' de datetime('now')). Aquí todo se compara como "naive
 * CDMX" (partes UTC = hora de pared de México), así que se le restan 6 horas.
 * @param {unknown} valor
 * @returns {Date|null}
 */
export function fechaSqliteANaive(valor) {
  if (!valor) return null;
  let texto = String(valor).trim();
  if (!texto) return null;
  // 'YYYY-MM-DD HH:MM:SS' (sin zona) es UTC: se le pone la Z para que no lo lea
  // como hora local de la máquina.
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(texto)) {
    texto = `${texto.replace(' ', 'T')}${texto.length === 10 ? 'T00:00:00' : ''}Z`;
  }
  const ms = Date.parse(texto);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 6 * 3_600_000);
}

/**
 * Devuelve un Map llave = `art_codigo` tal cual (suele ser el Art_Codigo, a veces el
 * código escaneado: quien lo use debe buscar por los dos).
 * @param {{forzar?: boolean}} [opciones]
 * @returns {Promise<Map<string, Override>>}
 */
export async function obtenerOverrides({ forzar = false } = {}) {
  const minutos = config.refresco.fotosMin;
  if (!forzar && cache.size && Date.now() - cuando < minutos * 60_000) return cache;

  let db = null;
  try {
    const { default: Database } = await import('better-sqlite3');
    db = new Database(config.rutas.sqliteFotos, { readonly: true, fileMustExist: true });
    let filas;
    if (conEstatus) {
      try {
        filas = db.prepare(CON_ESTATUS).all();
      } catch (e) {
        if (!/no such column/i.test(e?.message ?? '')) throw e;
        conEstatus = false;
        if (!avisoSinEstatus) {
          log.aviso('overrides', 'el SQLite del admin no tiene la columna descontinuado (admin viejo): se leen solo fotos y categoría');
          avisoSinEstatus = true;
        }
        filas = db.prepare(SIN_ESTATUS).all();
      }
    } else {
      filas = db.prepare(SIN_ESTATUS).all();
    }
    const nuevo = new Map();
    let fotos = 0;
    let descontinuados = 0;
    for (const f of filas) {
      const llave = String(f.art_codigo ?? '').trim();
      if (!llave) continue;
      const url = String(f.image_url ?? '').trim();
      // Solo ligas https públicas: la CSP del navegador únicamente deja cdn.shopify.com.
      const foto = url.startsWith('https://') ? url : null;
      const categoria = String(f.categoria ?? '').trim() || null;
      const descontinuado = Number(f.descontinuado) === 1;
      if (!foto && !categoria && !descontinuado) continue;
      if (foto) fotos += 1;
      if (descontinuado) descontinuados += 1;
      nuevo.set(llave, {
        foto,
        categoria,
        descontinuado,
        descontinuadoDesde: descontinuado ? fechaSqliteANaive(f.descontinuado_desde) : null,
      });
    }
    cache = nuevo;
    cuando = Date.now();
    ultimoError = null;
    log.info('overrides', `${nuevo.size} productos leídos del SQLite del admin`, {
      fotos, descontinuados, conEstatus,
    });
  } catch (e) {
    // Tras un taskkill del admin puede quedar un SQLITE_BUSY momentáneo: se reintenta
    // en el siguiente refresco y mientras tanto se usa lo que ya teníamos.
    log.aviso('overrides', 'no se pudo leer el SQLite del admin (la app sigue sin fotos ni estatus)', e);
    ultimoError = e?.message ?? String(e);
    cuando = Date.now();
  } finally {
    try { db?.close(); } catch { /* nada */ }
  }
  return cache;
}

/** Lo último que se leyó, sin tocar el disco. */
export function overridesEnMemoria() {
  return cache;
}

/** Para `capacidades` del encabezado: ¿hay fotos? ¿hay estatus de descontinuado? */
export function capacidadesOverrides() {
  let fotos = false;
  for (const o of cache.values()) {
    if (o.foto) { fotos = true; break; }
  }
  return { fotos, overrides: cache.size > 0 && conEstatus, error: ultimoError };
}

/** Solo para pruebas: mete un Map ya armado sin leer el disco. */
export function _ponerOverridesDePrueba(mapa) {
  cache = mapa instanceof Map ? mapa : new Map();
  cuando = Date.now();
}
