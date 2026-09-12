// Fotos de los productos: viven en el SQLite del panel admin
// (apps/api/lacasita.db, tabla product_overrides), 3,354 ligas de cdn.shopify.com.
//
// Ese archivo es del ADMIN y el admin le ESCRIBE (modo WAL). Reglas para no
// estorbarle:
//   · abrir readonly, sin pragmas (nada de journal_mode: lo abriría para escribir);
//   · una sola lectura corta (.all()), guardar en memoria y CERRAR;
//   · nunca dejar iteradores ni transacciones abiertas (frenan el checkpoint y el
//     archivo -wal crece sin parar);
//   · si falla, la app sigue funcionando sin fotos (nunca truena por esto).
import { config } from '../config.js';
import { log } from '../log.js';

let cache = new Map();
let cuando = 0;

/**
 * Devuelve un Map con las ligas de fotos: la llave puede ser el Art_Codigo o el
 * código de barras tal cual (el admin guarda una u otra según el producto).
 * @param {{forzar?: boolean}} [opciones]
 */
export async function obtenerFotos({ forzar = false } = {}) {
  const minutos = config.refresco.fotosMin;
  if (!forzar && cache.size && Date.now() - cuando < minutos * 60_000) return cache;

  let db = null;
  try {
    const { default: Database } = await import('better-sqlite3');
    db = new Database(config.rutas.sqliteFotos, { readonly: true, fileMustExist: true });
    const filas = db.prepare(
      `SELECT art_codigo, image_url FROM product_overrides
        WHERE image_url IS NOT NULL AND image_url <> ''`,
    ).all();
    const nuevo = new Map();
    for (const f of filas) {
      const url = String(f.image_url).trim();
      // Solo ligas https públicas: la CSP del navegador únicamente deja cdn.shopify.com.
      if (!url.startsWith('https://')) continue;
      nuevo.set(String(f.art_codigo).trim(), url);
    }
    cache = nuevo;
    cuando = Date.now();
    log.info('fotos', `${cache.size} fotos leídas del SQLite del admin`);
  } catch (e) {
    // Tras un taskkill del admin puede quedar un SQLITE_BUSY momentáneo: se reintenta
    // en el siguiente refresco y mientras tanto se usan las fotos que ya teníamos.
    log.aviso('fotos', 'no se pudieron leer las fotos (la app sigue sin ellas)', e);
    cuando = Date.now();
  } finally {
    try { db?.close(); } catch { /* nada */ }
  }
  return cache;
}

export function fotosEnMemoria() {
  return cache;
}
