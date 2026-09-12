// Arma en memoria la foto completa del inventario a partir de los datos crudos.
// Es una función PURA (no toca la base ni el reloj si le pasas `ahora`), así que
// se puede probar entera con datos de mentiras.
//
// Entra lo que devuelve src/datos/fuente.js y sale el "snapshot" que usan todas
// las pantallas: productos con su clase, el resurtido por área y los totales.

import { ahoraNaive, diasEntre, naiveAIso } from './fechas.js';
import { esCocina } from './cocina.js';
import { buscarDuplicados } from './duplicados.js';
import { clasificar, resumirPorClase } from './clasificacion.js';
import { calcularResurtido } from './resurtido.js';
import { normalizar } from './texto.js';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Limpia nombres. Además de espacios de más, saca el dinero que algunos nombres
 * traen adentro: en la base real hay "SEGUNDA PIEZA GOMAS POR $40 PESOS LAS DOS" y
 * "Celery seed Morton $ bassett". Esta app no muestra dinero ni de casualidad.
 */
export const limpiarNombre = s => (s ?? '').toString()
  // Primero la frase completa ("POR $40 PESOS"), si no queda la palabra suelta.
  .replace(/\$?\s*\d+(?:[.,]\d+)?\s*pesos\b/gi, ' ')
  .replace(/\$\s*\d+(?:[.,]\d+)?/g, ' ')
  .replace(/\bpesos\b/gi, ' ')
  .replace(/\$/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Los departamentos de NovaCaja traen su estatus de impuestos en el nombre
 * ("ABARROTES CON IVA"). Eso no le dice nada a quien resurte y además es tema de
 * dinero: se muestra solo la parte útil.
 */
export const limpiarCategoria = s => limpiarNombre(s)
  .replace(/\b(con|sin|libres?|libre de)\s+(iva|ieps)\b/gi, ' ')
  .replace(/\b(grabadas?|gravadas?)\b/gi, ' ')
  .replace(/\b(iva|ieps)\b/gi, ' ')
  .replace(/\s*\/\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * @param {Object} datos
 * @param {Date}   [datos.ahora]
 * @param {Array}  datos.areas          [{nombre,color,activa,orden}]
 * @param {Array}  datos.mapaCajas      [{est_codigo,area}]
 * @param {Array}  datos.inventario     [{codigo,ubicacion,cantidad,ultima_entrada,ultima_salida,creado,nombre}]
 * @param {Array}  [datos.reservas]     [{codigo,ubicacion,apartado}]
 * @param {Array}  datos.historial      [{codigo,ultima,v120,v30,concepto}]
 * @param {Array}  [datos.ventasArea]   [{area,codigo,v7,v14,v30}]
 * @param {Array}  datos.catalogo       [{codigo,art_codigo,descripcion,categoria,marca}]
 * @param {Array}  [datos.equivalencias] [{codigo,codigo_base,unidades}]
 * @param {Map}    [datos.fotos]        código o art_codigo -> url
 * @param {Object} opciones             umbrales + reglas de cocina + áreas de respaldo
 */
export function armarSnapshot(datos, opciones = {}) {
  const ahora = datos.ahora ?? ahoraNaive();
  const o = {
    descontinuadoDias: 90, lentoDias: 30, nuevoDias: 30,
    coberturaUrgenteDias: 2, coberturaBajaDias: 7, diasSugeridos: 7,
    ventanaVentaDiariaDias: 14, duplicadosDias: 120,
    cocina: {}, areasRespaldo: ['Bodega'],
    ...opciones,
  };

  // ── Áreas ────────────────────────────────────────────────────────────────
  const areas = (datos.areas ?? [])
    .filter(a => a.activa === undefined || a.activa === true || a.activa === 1)
    .map(a => ({ nombre: a.nombre, color: a.color || '#717973', orden: num(a.orden) }))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  const areasVenta = [...new Set((datos.mapaCajas ?? []).map(m => m.area).filter(Boolean))]
    .sort((a, b) => {
      const ia = areas.findIndex(x => x.nombre === a);
      const ib = areas.findIndex(x => x.nombre === b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const areasRespaldo = o.areasRespaldo.filter(a => !areasVenta.includes(a));

  // ── Índice de productos ──────────────────────────────────────────────────
  /** @type {Map<string, any>} */
  const porCodigo = new Map();
  const traer = codigo => {
    const c = String(codigo ?? '').trim();
    if (!c) return null;
    let p = porCodigo.get(c);
    if (!p) {
      p = {
        codigo: c, artCodigo: null, nombre: '', categoria: null, marca: null, alta: false,
        foto: null, esCocina: false,
        piezas: 0, apartado: 0, areas: [],
        ultimaVenta: null, ultimaEntrada: null, ultimaSalida: null, primeraVez: null,
        vendidas: { d7: 0, d14: 0, d30: 0, d120: 0 },
        porArea: new Map(),
        clase: null, duplicado: null, nombreTC52: null, concepto: null,
      };
      porCodigo.set(c, p);
    }
    return p;
  };

  // 1) Stock contado con la TC52 (una fila por código+área)
  for (const fila of datos.inventario ?? []) {
    const p = traer(fila.codigo ?? fila.codigo_barras);
    if (!p) continue;
    const cantidad = num(fila.cantidad);
    const entrada = fila.ultima_entrada ? new Date(fila.ultima_entrada) : null;
    const salida = fila.ultima_salida ? new Date(fila.ultima_salida) : null;
    // `creado` = la primera vez que se contó ese producto en esa área. El menor de
    // todos dice desde cuándo la tienda lo conoce (ver nota en clasificacion.js).
    const creado = fila.creado ? new Date(fila.creado) : null;
    if (creado && (!p.primeraVez || creado < p.primeraVez)) p.primeraVez = creado;
    p.porArea.set(fila.ubicacion, {
      area: fila.ubicacion,
      cantidad,
      apartado: 0,
      ultimaEntrada: entrada,
      ultimaSalida: salida,
    });
    if (cantidad > 0) p.piezas += cantidad;
    if (entrada && (!p.ultimaEntrada || entrada > p.ultimaEntrada)) p.ultimaEntrada = entrada;
    if (salida && (!p.ultimaSalida || salida > p.ultimaSalida)) p.ultimaSalida = salida;
    if (!p.nombreTC52 && fila.nombre) p.nombreTC52 = limpiarNombre(fila.nombre);
  }

  // 2) Apartados de la página web (disponible = físico − apartado)
  for (const r of datos.reservas ?? []) {
    const p = porCodigo.get(String(r.codigo ?? r.codigo_barras ?? '').trim());
    if (!p) continue;
    const area = p.porArea.get(r.ubicacion);
    const apartado = num(r.apartado ?? r.cantidad);
    if (area) area.apartado += apartado;
    p.apartado += apartado;
  }

  // 3) Ventas: historial completo (última venta y piezas de la ventana)
  //    Solo interesan los códigos que la tienda tiene contados o que se vendieron
  //    en la ventana: el historial trae 39,099 códigos de 4.5 años y la mayoría se
  //    vendió una vez hace años, sin existencia hoy. Guardarlos todos infla la
  //    memoria y ensucia el buscador.
  for (const h of datos.historial ?? []) {
    const codigo = String(h.codigo ?? '').trim();
    if (!codigo) continue;
    if (!porCodigo.has(codigo) && !(num(h.v120) > 0)) continue;
    const p = traer(codigo);
    if (!p) continue;
    const ultima = h.ultima ? new Date(h.ultima) : null;
    if (ultima && (!p.ultimaVenta || ultima > p.ultimaVenta)) p.ultimaVenta = ultima;
    p.vendidas.d120 += num(h.v120);
    p.vendidas.d30 += num(h.v30);
    if (!p.concepto && h.concepto) p.concepto = limpiarNombre(h.concepto);
  }

  // 4) Ventas por área (join de 4 llaves: caja del ticket -> área)
  for (const v of datos.ventasArea ?? []) {
    const p = traer(v.codigo);
    if (!p) continue;
    const area = p.porArea.get(v.area) ?? { area: v.area, cantidad: null, apartado: 0, ultimaEntrada: null, ultimaSalida: null };
    if (!p.porArea.has(v.area)) p.porArea.set(v.area, area);
    area.v7 = num(area.v7) + num(v.v7);
    area.v14 = num(area.v14) + num(v.v14);
    area.v30 = num(area.v30) + num(v.v30);
    // El total de 30 días se arma sumando las áreas (todas las cajas están
    // mapeadas, así que la suma por área es el total real de la tienda).
    p.vendidas.d7 += num(v.v7);
    p.vendidas.d14 += num(v.v14);
    p.vendidas.d30 += num(v.v30);
  }

  // 5) Códigos de caja: lo que se vende con el código de la caja cuenta para el
  //    producto suelto (son 30 filas en la base real, pero explican "nunca vendido"
  //    de algún producto que sí se mueve).
  for (const eq of datos.equivalencias ?? []) {
    const desde = porCodigo.get(String(eq.codigo ?? '').trim());
    const hacia = porCodigo.get(String(eq.codigo_base ?? '').trim());
    if (!desde || !hacia || desde === hacia) continue;
    const u = Math.max(1, num(eq.unidades) || 1);
    if (desde.ultimaVenta && (!hacia.ultimaVenta || desde.ultimaVenta > hacia.ultimaVenta)) {
      hacia.ultimaVenta = desde.ultimaVenta;
      hacia.ventaHeredadaDe = desde.codigo;
    }
    hacia.vendidas.d7 += desde.vendidas.d7 * u;
    hacia.vendidas.d14 += desde.vendidas.d14 * u;
    hacia.vendidas.d30 += desde.vendidas.d30 * u;
    hacia.vendidas.d120 += desde.vendidas.d120 * u;
  }

  // 6) Catálogo de NovaCaja: nombre "oficial", categoría, marca y si está dado de alta
  for (const c of datos.catalogo ?? []) {
    const p = porCodigo.get(String(c.codigo ?? '').trim());
    if (!p) continue;
    p.alta = true;
    p.artCodigo = c.art_codigo ?? c.codigo;
    p.categoria = c.categoria ? limpiarCategoria(c.categoria) : null;
    p.marca = c.marca ? limpiarNombre(c.marca) : null;
    if (c.descripcion) p.nombre = limpiarNombre(c.descripcion);
  }

  // 7) Nombre final, foto y comida de cocina
  const fotos = datos.fotos instanceof Map ? datos.fotos : new Map();
  for (const p of porCodigo.values()) {
    if (!p.nombre) p.nombre = p.nombreTC52 || p.concepto || p.codigo;
    p.foto = fotos.get(p.artCodigo ?? '') ?? fotos.get(p.codigo) ?? null;
    p.esCocina = esCocina({ codigo: p.codigo, categoria: p.categoria, nombre: p.nombre }, o.cocina);
    // Lo que se vende pero NUNCA se ha contado en ninguna área casi siempre es
    // comida preparada o un código genérico (baguette `030`, paella `003`,
    // "REFRESCO IMPORTADO" `500008`). Las reglas de categoría no los agarran
    // porque NovaCaja los tiene en "ABARROTES", igual que 8,912 productos normales.
    p.nuncaContado = p.porArea.size === 0
      || [...p.porArea.values()].every(a => a.cantidad === null || a.cantidad === undefined);
    p.nombreNormalizado = normalizar(p.nombre);
  }

  // ── Duplicados: solo entre los que tienen piezas y NUNCA se vendieron ─────
  const productos = [...porCodigo.values()];
  const conPiezas = productos.filter(p => p.piezas > 0);
  const nuncaVendidos = conPiezas.filter(p => !p.ultimaVenta);
  const candidatos = productos
    .filter(p => p.vendidas.d120 > 0)
    .map(p => ({ codigo: p.codigo, nombre: p.nombre, piezasVendidas: p.vendidas.d120 }));
  const duplicados = buscarDuplicados(
    nuncaVendidos.map(p => ({ codigo: p.codigo, nombre: p.nombre })),
    candidatos,
  );
  for (const p of nuncaVendidos) {
    const d = duplicados.get(p.codigo);
    if (d) p.duplicado = d;
  }

  // ── Clasificación ────────────────────────────────────────────────────────
  for (const p of productos) {
    const r = clasificar(
      {
        codigo: p.codigo, alta: p.alta, ultimaVenta: p.ultimaVenta,
        ultimaEntrada: p.ultimaEntrada, primeraVez: p.primeraVez, duplicado: p.duplicado,
      },
      { ...o, ahora },
    );
    p.clase = r.clase;
    p.diasSinVenta = r.diasSinVenta;
    p.diasDesdeEntrada = r.diasDesdeEntrada;
    p.diasDesdePrimeraVez = r.diasDesdePrimeraVez;
    p.nuncaVendido = r.nuncaVendido;
    p.areas = [...p.porArea.values()]
      .map(a => ({
        area: a.area,
        cantidad: a.cantidad,
        apartado: a.apartado || 0,
        ultimaEntrada: a.ultimaEntrada ? naiveAIso(a.ultimaEntrada) : null,
        diasDesdeEntrada: a.ultimaEntrada ? diasEntre(a.ultimaEntrada, ahora) : null,
        v14: num(a.v14),
      }))
      .filter(a => a.cantidad !== null && a.cantidad !== undefined)
      .sort((x, y) => {
        const ix = areas.findIndex(a => a.nombre === x.area);
        const iy = areas.findIndex(a => a.nombre === y.area);
        return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
      });
  }

  // ── Resurtido por área de venta ──────────────────────────────────────────
  const resurtido = [];
  for (const p of productos) {
    for (const area of areasVenta) {
      const enArea = p.porArea.get(area);
      const vendidas = num(enArea?.v14);
      const contado = enArea && enArea.cantidad !== null && enArea.cantidad !== undefined;
      if (!vendidas && !contado) continue;          // ni se vende ahí ni está contado ahí
      if (!vendidas) continue;                       // está contado pero no se vende: no es resurtido
      const fila = calcularResurtido(
        {
          codigo: p.codigo,
          area,
          vendidasVentana: vendidas,
          stock: contado ? enArea.cantidad : null,
          apartado: enArea?.apartado ?? 0,
          respaldos: areasRespaldo.map(nombre => {
            const r = p.porArea.get(nombre);
            return { area: nombre, stock: r ? r.cantidad : null, apartado: r?.apartado ?? 0 };
          }),
        },
        {
          ventanaDias: o.ventanaVentaDiariaDias,
          urgenteDias: o.coberturaUrgenteDias,
          bajaDias: o.coberturaBajaDias,
          diasSugeridos: o.diasSugeridos,
        },
      );
      resurtido.push({
        codigo: p.codigo, nombre: p.nombre, area, esCocina: p.esCocina, foto: p.foto,
        // ¿nunca se ha contado en NINGUNA área? casi siempre es comida preparada o
        // un código genérico: se esconde por defecto para que la lista sirva.
        nuncaContado: p.nuncaContado,
        vendidas14: vendidas,
        ...fila,
      });
    }
  }

  // ── Totales para las tarjetas ────────────────────────────────────────────
  const porClase = resumirPorClase(conPiezas);
  const paradas = conPiezas.filter(p => p.clase === 'descontinuado' || p.clase === 'lento');
  const piezasPorArea = {};
  for (const p of conPiezas) {
    for (const a of p.areas) {
      if (!(a.cantidad > 0)) continue;
      const acc = piezasPorArea[a.area] ?? (piezasPorArea[a.area] = { area: a.area, productos: 0, piezas: 0, paradas: 0, piezasParadas: 0 });
      acc.productos += 1;
      acc.piezas += a.cantidad;
      if (p.clase === 'descontinuado' || p.clase === 'lento') {
        acc.paradas += 1;
        acc.piezasParadas += a.cantidad;
      }
    }
  }

  return {
    generado: naiveAIso(ahora),
    ahora,
    areas,
    areasVenta,
    areasRespaldo,
    productos,
    porCodigo,
    resurtido,
    resumen: {
      conPiezas: conPiezas.length,
      piezasTotales: conPiezas.reduce((s, p) => s + p.piezas, 0),
      piezasParadas: paradas.reduce((s, p) => s + p.piezas, 0),
      porClase,
      porArea: Object.values(piezasPorArea),
    },
  };
}
