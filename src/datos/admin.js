// Cliente HTTP del API del panel admin (lacasitadeli-admin, puerto 3002 en la caja).
//
// Es lo ÚNICO que esta app le pide a otro sistema. Se usa para dos cosas:
//   · saber si el admin está vivo (capacidades.solicitudes, cada 5 min);
//   · las solicitudes de resurtido (src/web/solicitudes.js, proxy con sesión).
//
// Reglas:
//   · siempre con tiempo límite (AbortController): si el admin se colgó, esta app
//     no se cuelga con él;
//   · nunca se lanza nada raro hacia arriba: o contesta {status, cuerpo} o lanza
//     AdminNoResponde, y quien llama decide (503 en el proxy, false en capacidades);
//   · lo que devuelve el admin pasa por limpiarDinero(): sus respuestas de
//     resurtido no traen dinero, pero esta app no muestra dinero ni por accidente.
import { config } from '../config.js';

export const MENSAJE_ADMIN_CAIDO = 'El sistema admin no responde. Inténtalo en un momento.';

/** El admin no contestó (apagado, colgado o sin red). */
export class AdminNoResponde extends Error {
  constructor(mensaje, causa) {
    super(mensaje || MENSAJE_ADMIN_CAIDO);
    this.name = 'AdminNoResponde';
    this.causa = causa ?? null;
  }
}

// Mismo criterio que la prueba de privacidad (pruebas/api.test.js).
const LLAVE_DE_DINERO = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$|pesos/i;

/** Quita, a cualquier profundidad, las llaves que huelan a dinero. */
export function limpiarDinero(valor) {
  if (Array.isArray(valor)) return valor.map(limpiarDinero);
  if (valor && typeof valor === 'object') {
    const limpio = {};
    for (const [k, v] of Object.entries(valor)) {
      if (LLAVE_DE_DINERO.test(k)) continue;
      limpio[k] = limpiarDinero(v);
    }
    return limpio;
  }
  return valor;
}

// Campos de fecha que manda el admin en las solicitudes (DATETIME de SQL Server).
const CAMPOS_FECHA = new Set(['creado', 'actualizado', 'hecha_en', 'cancelada_en', 'fecha', 'ultima_venta']);

/**
 * El admin manda sus DATETIME tal cual los entrega el driver mssql: un texto con
 * "Z" cuyas partes son la hora de PARED de la tienda ("2026-09-15T14:30:00.000Z"
 * = las 14:30 en CDMX). Un celular que lo formatee en su zona lo movería 6 horas.
 * Aquí se pasan a la forma de toda esta app: "2026-09-15T14:30:00-06:00".
 */
export function fechaAdminAIso(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T`
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}-06:00`;
}

/** Normaliza, a cualquier profundidad, los campos de fecha conocidos. */
export function normalizarFechasAdmin(valor) {
  if (Array.isArray(valor)) return valor.map(normalizarFechasAdmin);
  if (valor && typeof valor === 'object') {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) {
      salida[k] = CAMPOS_FECHA.has(k) && (typeof v === 'string' || v instanceof Date) ? fechaAdminAIso(v) : normalizarFechasAdmin(v);
    }
    return salida;
  }
  return valor;
}

/** URL completa en el admin ("/api/resurtido/pendientes" -> "http://127.0.0.1:3002/api/resurtido/pendientes"). */
export function urlAdmin(ruta) {
  return `${config.admin.api}${ruta.startsWith('/') ? '' : '/'}${ruta}`;
}

/**
 * Pide algo al admin. Devuelve el status y el cuerpo (JSON ya parseado, o
 * {error} si no era JSON). Lanza AdminNoResponde si no hubo respuesta a tiempo.
 * @param {string} ruta                 p. ej. '/api/resurtido/ubicaciones'
 * @param {{metodo?: 'GET'|'POST', cuerpo?: object, timeoutMs?: number}} [opciones]
 * @returns {Promise<{status: number, cuerpo: any}>}
 */
export async function pedirAlAdmin(ruta, { metodo = 'GET', cuerpo, timeoutMs } = {}) {
  const limite = Math.max(500, Number(timeoutMs) || config.admin.timeoutMs);
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), limite);
  try {
    const r = await fetch(urlAdmin(ruta), {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
    const texto = await r.text();
    let json;
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // El admin contestó algo que no es JSON (p. ej. un HTML de error de Express).
      json = { error: r.ok ? 'El sistema admin contestó algo que no se entiende.' : `El sistema admin contestó ${r.status}.` };
    }
    return { status: r.status, cuerpo: normalizarFechasAdmin(limpiarDinero(json)) };
  } catch (e) {
    throw new AdminNoResponde(MENSAJE_ADMIN_CAIDO, e);
  } finally {
    clearTimeout(reloj);
  }
}
