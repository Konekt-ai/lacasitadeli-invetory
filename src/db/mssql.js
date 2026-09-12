// Conexión a SQL Server `compucaja` — SOLO LECTURA.
//
// Dos reglas de esta tienda:
//  · Las consultas van EN FILA, nunca en paralelo: la base es la del punto de venta
//    y cuatro consultas MAXDOP 1 al mismo tiempo le hacían picos de 25 s a la caja.
//  · Las tablas #temporales NO sobreviven entre peticiones (el pool hace
//    sp_reset_connection), así que cada lote va completo en un solo query().
import sql from 'mssql';
import { config } from '../config.js';
import { log } from '../log.js';

let pool = null;
let conectando = null;
/** Fila de espera: garantiza una consulta a la vez. */
let turno = Promise.resolve();

function armarConfig() {
  return {
    server: config.sql.server,
    database: config.sql.database,
    user: config.sql.user,
    password: config.sql.password,
    port: config.sql.port,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    pool: { max: 2, min: 0, idleTimeoutMillis: 60_000, acquireTimeoutMillis: 20_000 },
    connectionTimeout: 20_000,
    requestTimeout: config.sql.timeoutMs,
  };
}

export async function obtenerPool() {
  if (pool?.connected && !pool._destroyed) return pool;
  if (!conectando) {
    conectando = new sql.ConnectionPool(armarConfig()).connect()
      .then(p => {
        pool = p;
        p.on('error', e => log.error('sql', 'error del pool', e));
        return p;
      })
      .catch(e => { pool = null; throw e; })
      .finally(() => { conectando = null; });
  }
  return conectando;
}

/**
 * Corre un lote de SELECT. Espera su turno para no encimarse con otro.
 * @param {string} texto
 * @param {Record<string, any>} [parametros]
 * @returns {Promise<{recordsets: any[][], ms: number}>}
 */
export function consultar(texto, parametros = {}) {
  const mio = turno.then(async () => {
    const p = await obtenerPool();
    const req = p.request();
    req.timeout = config.sql.timeoutMs;
    for (const [k, v] of Object.entries(parametros)) req.input(k, v);
    const t0 = Date.now();
    const r = await req.query(texto);
    return { recordsets: r.recordsets ?? [], ms: Date.now() - t0 };
  });
  // El siguiente espera a este, pase lo que pase (pero sin heredar el error).
  turno = mio.then(() => {}, () => {});
  return mio;
}

export async function cerrar() {
  try { await pool?.close(); } catch { /* ya estaba cerrado */ }
  pool = null;
}

/** Para el diagnóstico: ¿responde la base? */
export async function probarConexion() {
  const r = await consultar('SELECT GETDATE() AS ahora, @@VERSION AS version');
  return r.recordsets[0]?.[0] ?? null;
}
