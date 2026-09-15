// ¿Por qué este producto tiene piezas paradas? (una sola "clase" por producto)
//
// Medido contra la base real el 2026-09-11: de 11,238 productos con piezas, 2,723
// nunca se han vendido en 4.5 años de historial. Pero "nunca vendido" casi nunca
// significa "no se vende":
//   · 2,010 no existen en NovaCaja  -> no se pueden cobrar con su código (se cobran
//     como genéricos). Eso es un problema de alta, no de movimiento.
//   · ~400 se venden con OTRO código mal capturado (Kinder Joy, Starbucks…).
//   · ~1,200 acaban de llegar (entrada de menos de 30 días).
// Lo que queda sí lleva mucho tiempo sin moverse (Pepsi Wild Cherry, Evian 1 L…),
// pero eso NO lo vuelve "descontinuado": Descontinuado solo es lo que el dueño
// marca en el Admin (product_overrides.descontinuado = 1, ver condiciones.js).
// Por eso la clase de antes 'descontinuado' ahora se llama 'sin_movimiento'.
//
// Se conserva por compatibilidad (la v2 usa `condiciones[]`, varios badges a la
// vez). El orden importa: se revisa en este orden y se queda en el PRIMER grupo
// que cumpla.

import { diasEntre } from './fechas.js';

export const CLASES = ['sin_alta', 'duplicado_probable', 'nuevo', 'sin_movimiento', 'lento', 'activo'];

export const ETIQUETAS = {
  sin_alta: 'Sin alta en caja',
  duplicado_probable: 'Posible código duplicado',
  nuevo: 'Nuevo, aún sin venta',
  sin_movimiento: 'Sin movimiento 90+ días',
  lento: 'Lento',
  activo: 'Activo',
};

/**
 * @typedef {Object} ProductoParaClasificar
 * @property {string}      codigo
 * @property {boolean}     alta          existe en NovaCaja (VArticulosUnificados)
 * @property {Date|null}   ultimaVenta   de TicketsPS (todo el historial)
 * @property {Date|null}   ultimaEntrada última entrada a cualquier área (incluye surtidos internos)
 * @property {Date|null}   primeraVez    primera vez que se contó el producto (menor `creado`)
 * @property {object|null} [duplicado]   resultado de buscarDuplicados()
 *
 * @typedef {Object} OpcionesClasificacion
 * @property {number} [sinMovimientoDias]  90 por defecto (antes `descontinuadoDias`; se acepta el nombre viejo)
 * @property {number} [descontinuadoDias]  nombre viejo de sinMovimientoDias
 * @property {number} lentoDias          30
 * @property {number} nuevoDias          30
 * @property {Date}   [ahora]            instante de referencia (naive CDMX)
 */

/**
 * Clasifica un producto CON PIEZAS.
 * @param {ProductoParaClasificar} p
 * @param {OpcionesClasificacion} opciones
 * @returns {{clase: string, diasSinVenta: number|null, diasDesdeEntrada: number|null, nuncaVendido: boolean}}
 */
export function clasificar(p, opciones) {
  const { lentoDias = 30, nuevoDias = 30, ahora } = opciones ?? {};
  const sinMovimientoDias = opciones?.sinMovimientoDias ?? opciones?.descontinuadoDias ?? 90;
  const diasSinVenta = p.ultimaVenta ? diasEntre(p.ultimaVenta, ahora) : null;
  const diasDesdeEntrada = p.ultimaEntrada ? diasEntre(p.ultimaEntrada, ahora) : null;
  const diasDesdePrimeraVez = p.primeraVez ? diasEntre(p.primeraVez, ahora) : null;
  const nuncaVendido = diasSinVenta === null;
  const base = { diasSinVenta, diasDesdeEntrada, diasDesdePrimeraVez, nuncaVendido };

  // 1. No está dado de alta en la caja: no se puede cobrar con su código.
  if (!p.alta) return { clase: 'sin_alta', ...base };

  // 2. Nunca se vendió con SU código, pero hay otro código casi igual que sí vende.
  if (nuncaVendido && p.duplicado) return { clase: 'duplicado_probable', ...base };

  // 3. Producto NUEVO en la tienda que todavía no se vende.
  //
  //    OJO (medido en la base real): NO se puede usar `ultima_entrada` para esto,
  //    aunque el prompt lo diga. Esa fecha también se mueve cuando surten del
  //    Bodega al anaquel: DR. PEPPER STRAWBERRIES CREAM salió de Bodega y "entró"
  //    a Casita 1 el mismo día (13-ago), y DUNCAN HINES —144 días sin venderse—
  //    aparecía como "nuevo" por un surtido interno de hace 14 días. Con eso se
  //    escondían justo los estancados que el dueño quiere ver.
  //
  //    La fecha buena es `creado`: la primera vez que ese producto se contó con la
  //    TC52 (el producto es nuevo en la tienda, no solo cambió de anaquel).
  const referenciaNuevo = diasDesdePrimeraVez ?? diasDesdeEntrada;
  if (nuncaVendido && referenciaNuevo !== null && referenciaNuevo < nuevoDias) {
    return { clase: 'nuevo', ...base };
  }

  // 4. Sin movimiento: nunca vendido o sin venta desde hace mucho.
  if (nuncaVendido || diasSinVenta >= sinMovimientoDias) return { clase: 'sin_movimiento', ...base };

  // 5. Lento: vendió, pero hace rato.
  if (diasSinVenta >= lentoDias) return { clase: 'lento', ...base };

  // 6. Se está vendiendo.
  return { clase: 'activo', ...base };
}

/** Cuenta productos y piezas por clase (para las tarjetas de arriba). */
export function resumirPorClase(productos) {
  const resumen = {};
  for (const clase of CLASES) resumen[clase] = { clase, etiqueta: ETIQUETAS[clase], productos: 0, piezas: 0 };
  for (const p of productos) {
    const r = resumen[p.clase];
    if (!r) continue;
    r.productos += 1;
    r.piezas += Number(p.piezas) || 0;
  }
  return resumen;
}
