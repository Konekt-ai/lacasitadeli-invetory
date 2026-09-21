// Arma en memoria la foto completa del inventario a partir de los datos crudos.
// Es una función PURA (no toca la base ni el reloj si le pasas `ahora`), así que
// se puede probar entera con datos de mentiras.
//
// Entra lo que devuelve src/datos/fuente.js (más overrides del admin, ventas
// largas, ventas por día y catálogo completo) y sale el "snapshot" que usan todas
// las pantallas: productos con sus condiciones, el resurtido por área, las alertas,
// lo precalculado de Movimiento y los totales (contrato v2, sección 2).
//
// Rendimiento: corre cada 5 min en la caja con ~18,000 productos y ~100,000 filas
// de ventas por día. Todo son pasadas lineales; lo único caro es buscarDuplicados
// (indexado, ver duplicados.js). Medido con datos sintéticos (18k productos, 100k
// filas de ventas por día, 60k de catálogo completo): 0.75–1.0 s en total.

import { ahoraNaive, diasEntre, naiveAIso } from './fechas.js';
import { esCocina } from './cocina.js';
import { buscarDuplicados } from './duplicados.js';
import { clasificar, resumirPorClase } from './clasificacion.js';
import { calcularResurtido } from './resurtido.js';
import { calcularCondiciones } from './condiciones.js';
import { calcularAlertas } from './alertas.js';
import { calcularMovimiento, indexarVentasDia } from './movimiento.js';
import { normalizar } from './texto.js';

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const SIN_CATEGORIA = 'Sin categoría';

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
  .replace(/\b(grabad[oa]s?|gravad[oa]s?)\b/gi, ' ')
  .replace(/\b(iva|ieps)\s*\d+(?:[.,]\d+)?\s*%?/gi, ' ')
  .replace(/\b(iva|ieps)\b/gi, ' ')
  .replace(/\s*\/\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim();

/** "ABARROTES" es la categoría de 56 mil de 60 mil artículos: no agrupa nada. */
export const esCategoriaGenerica = s => {
  const n = normalizar(s);
  return !n || n === 'ABARROTES';
};

/**
 * Categoría final y de dónde salió: la del dueño (Admin) → la de Shopify
 * ("Grupo - Subgrupo") → la de NovaCaja salvo ABARROTES → "Sin categoría".
 * @returns {{categoria: string, subcategoria: string|null, categoriaFuente: 'admin'|'shopify'|'caja'|'ninguna'}}
 */
export function resolverCategoria({ propia, tipoShopify, caja }) {
  if (propia) return { categoria: propia, subcategoria: null, categoriaFuente: 'admin' };
  if (tipoShopify) {
    const [grupo, ...resto] = tipoShopify.split(' - ');
    const g = limpiarNombre(grupo);
    if (g) {
      const sub = limpiarNombre(resto.join(' - '));
      return { categoria: g, subcategoria: sub || null, categoriaFuente: 'shopify' };
    }
  }
  if (caja && !esCategoriaGenerica(caja)) return { categoria: caja, subcategoria: null, categoriaFuente: 'caja' };
  return { categoria: SIN_CATEGORIA, subcategoria: null, categoriaFuente: 'ninguna' };
}

/** Mediana de una lista de números (null si está vacía). */
export function mediana(valores) {
  const v = valores.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * @param {Object} datos
 * @param {Date}   [datos.ahora]
 * @param {Array}  datos.areas             [{nombre,color,activa,orden}]
 * @param {Array}  datos.mapaCajas         [{est_codigo,area}]
 * @param {Array}  datos.inventario        [{codigo,ubicacion,cantidad,ultima_entrada,ultima_salida,creado,nombre}]
 * @param {Array}  [datos.reservas]        [{codigo,ubicacion,apartado}]
 * @param {Array}  datos.historial         [{codigo,ultima,v120,v30,concepto}]
 * @param {Array}  [datos.ventasArea]      [{area,codigo,v7,v14,v30}]
 * @param {Array}  [datos.ventasAreaLargo] [{area,codigo,v60,v90,v180}]  (lote de cada 30 min; acepta el viejo ventasArea90 con v90)
 * @param {Array}  [datos.ventasDia]       [{area,dia,codigo,piezas}] de 90 días (lote de cada 30 min)
 * @param {Array}  [datos.desfases]        [{codigo,area,piezas,desde,ultima}] vendido con existencia en 0
 * @param {Array}  datos.catalogo          [{codigo,art_codigo,descripcion,categoria,marca}]
 * @param {Array}  [datos.catalogoCompleto] [{art_codigo,descripcion,categoria,marca}] TODA VArticulosUnificados (solo buscador)
 * @param {Array}  [datos.equivalencias]   [{codigo,codigo_base,unidades}]
 * @param {Map}    [datos.overrides]       art_codigo o código -> {foto,categoria,descontinuado,descontinuadoDesde}
 * @param {Map}    [datos.fotos]           (compatibilidad) código o art_codigo -> url
 * @param {Map}    [datos.tiposShopify]    código o art_codigo -> {tipo, titulo} (opcional)
 * @param {Object} opciones                umbrales + reglas de cocina + áreas de respaldo
 */
export function armarSnapshot(datos, opciones = {}) {
  const ahora = datos.ahora ?? ahoraNaive();
  const o = {
    descontinuadoDias: 90, lentoDias: 30, nuevoDias: 30,
    coberturaUrgenteDias: 2, coberturaBajaDias: 7, diasSugeridos: 7,
    ventanaVentaDiariaDias: 14, duplicadosDias: 120,
    sobrestockDias: 120, sobrestockMin: 24, topMasVendidos: 50,
    tramosSinMovimiento: [30, 60, 90, 180], sinMovimientoAlertaDias: 180, entradasSinVentaDias: 30,
    cocina: {}, areasRespaldo: ['Bodega'],
    ...opciones,
  };
  // "lento" va de lentoDias a sinMovimientoDias (antes descontinuadoDias).
  o.sinMovimientoDias = o.sinMovimientoDias ?? o.descontinuadoDias;
  const ventana = Math.max(1, num(o.ventanaVentaDiariaDias) || 14);

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
  const ordenArea = new Map(areas.map((a, i) => [a.nombre, i]));
  const posicion = nombre => ordenArea.get(nombre) ?? 99;

  // ── Índice de productos ──────────────────────────────────────────────────
  /** @type {Map<string, any>} */
  const porCodigo = new Map();
  const nuevaArea = area => ({ area, cantidad: null, apartado: 0, ultimaEntrada: null, ultimaSalida: null });
  const traer = codigo => {
    const c = String(codigo ?? '').trim();
    if (!c) return null;
    let p = porCodigo.get(c);
    if (!p) {
      p = {
        codigo: c, artCodigo: null, nombre: '', marca: null, alta: false,
        categoria: null, categoriaCaja: null, categoriaPropia: null, subcategoria: null, categoriaFuente: 'ninguna',
        tipoShopify: null, tituloShopify: null,
        foto: null, esCocina: false,
        descontinuado: false, descontinuadoDesde: null,
        piezas: 0, apartado: 0, areas: [],
        ultimaVenta: null, ultimaEntrada: null, ultimaSalida: null, primeraVez: null,
        vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d120: 0, d180: 0 },
        porArea: new Map(),
        clase: null, duplicado: null, nombreTC52: null, concepto: null, desfase: null,
        masVendido: false, condiciones: [], prioridad: 'baja', alertas: [],
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
    let area = p.porArea.get(v.area);
    if (!area) p.porArea.set(v.area, (area = nuevaArea(v.area)));
    area.v7 = num(area.v7) + num(v.v7);
    area.v14 = num(area.v14) + num(v.v14);
    area.v30 = num(area.v30) + num(v.v30);
    // El total de 30 días se arma sumando las áreas (todas las cajas están
    // mapeadas, así que la suma por área es el total real de la tienda).
    p.vendidas.d7 += num(v.v7);
    p.vendidas.d14 += num(v.v14);
    p.vendidas.d30 += num(v.v30);
  }

  // 4b) Ventas largas (60/90/180 días) por área. Vienen del lote de cada 30 min
  //     (la consulta cuesta varias veces la de 30 días), así que se suman aparte.
  //     Se acepta el nombre viejo `ventasArea90` (solo v90): entonces d60 y d180
  //     quedan en 0 y las tendencias de 30 y 90 salen null (no se inventan).
  for (const v of datos.ventasAreaLargo ?? datos.ventasArea90 ?? []) {
    const p = traer(v.codigo);
    if (!p) continue;
    let area = p.porArea.get(v.area);
    if (!area) p.porArea.set(v.area, (area = nuevaArea(v.area)));
    area.v60 = num(area.v60) + num(v.v60);
    area.v90 = num(area.v90) + num(v.v90);
    area.v180 = num(area.v180) + num(v.v180);
    p.vendidas.d60 += num(v.v60);
    p.vendidas.d90 += num(v.v90);
    p.vendidas.d180 += num(v.v180);
  }

  // 4c) Inventario desfasado: lo que el sistema de bodega descontó cuando esa área
  //     ya estaba en 0 (ver consultaDesfases). Solo se marca si:
  //       · HOY sigue en 0: si ya tiene piezas, alguien lo corrigió y el aviso
  //         confundiría ("quedan 12 · desfasado");
  //       · y se SIGUE vendiendo en cero (alguna venta así dentro de la ventana de
  //         venta diaria). Una venta en cero de hace dos meses y nada desde
  //         entonces es un producto que de verdad se acabó, no un 0 falso.
  for (const d of datos.desfases ?? []) {
    const p = porCodigo.get(String(d.codigo ?? '').trim());
    const enArea = p?.porArea.get(d.area);
    const piezas = num(d.piezas);
    if (!enArea || enArea.cantidad === null || enArea.cantidad === undefined) continue;
    if (enArea.cantidad > 0 || !(piezas > 0)) continue;
    const desde = d.desde ? new Date(d.desde) : null;
    const ultima = d.ultima ? new Date(d.ultima) : null;
    if (!ultima || diasEntre(ultima, ahora) > o.ventanaVentaDiariaDias) continue;
    enArea.desfase = { piezas, desde, ultima };
    const total = p.desfase ?? (p.desfase = { piezas: 0, desde: null, ultima: null, areas: [] });
    total.piezas += piezas;
    total.areas.push(d.area);
    if (desde && (!total.desde || desde < total.desde)) total.desde = desde;
    if (ultima && (!total.ultima || ultima > total.ultima)) total.ultima = ultima;
  }

  // 5) Códigos de caja: lo que se vende con el código de la caja cuenta para el
  //    producto suelto (son 30 filas en la base real, pero explican "nunca vendido"
  //    de algún producto que sí se mueve).
  const equivalencias = new Map();
  for (const eq of datos.equivalencias ?? []) {
    const codigo = String(eq.codigo ?? '').trim();
    const base = String(eq.codigo_base ?? '').trim();
    const u = Math.max(1, num(eq.unidades) || 1);
    if (codigo && base && codigo !== base) equivalencias.set(codigo, { base, unidades: u });
    const desde = porCodigo.get(codigo);
    const hacia = porCodigo.get(base);
    if (!desde || !hacia || desde === hacia) continue;
    if (desde.ultimaVenta && (!hacia.ultimaVenta || desde.ultimaVenta > hacia.ultimaVenta)) {
      hacia.ultimaVenta = desde.ultimaVenta;
      hacia.ventaHeredadaDe = desde.codigo;
    }
    for (const k of ['d7', 'd14', 'd30', 'd60', 'd90', 'd120', 'd180']) hacia.vendidas[k] += desde.vendidas[k] * u;
    // También POR ÁREA: el resurtido solo mira porArea[].v14, así que sin esto un
    // producto que se vende con su código de caja seguía saliendo como si no se
    // vendiera en el anaquel.
    for (const [area, enArea] of desde.porArea) {
      if (!num(enArea.v7) && !num(enArea.v14) && !num(enArea.v30) && !num(enArea.v60) && !num(enArea.v90) && !num(enArea.v180)) continue;
      let destino = hacia.porArea.get(area);
      if (!destino) hacia.porArea.set(area, (destino = nuevaArea(area)));
      for (const k of ['v7', 'v14', 'v30', 'v60', 'v90', 'v180']) destino[k] = num(destino[k]) + num(enArea[k]) * u;
    }
  }

  // 6) Catálogo de NovaCaja: nombre "oficial", categoría de caja, marca y si está dado de alta
  const memoCategoria = new Map();
  const categoriaLimpia = s => {
    if (!s) return null;
    let v = memoCategoria.get(s);
    if (v === undefined) memoCategoria.set(s, (v = limpiarCategoria(s) || null));
    return v;
  };
  for (const c of datos.catalogo ?? []) {
    const p = porCodigo.get(String(c.codigo ?? '').trim());
    if (!p) continue;
    p.alta = true;
    p.artCodigo = c.art_codigo ?? c.codigo;
    p.categoriaCaja = categoriaLimpia(c.categoria);
    p.marca = c.marca ? limpiarNombre(c.marca) : null;
    if (c.descripcion) p.nombre = limpiarNombre(c.descripcion);
  }

  // 7) Overrides del admin (foto, categoría propia, descontinuado), Shopify,
  //    nombre final, categoría final y comida de cocina.
  const overrides = datos.overrides instanceof Map ? datos.overrides : new Map();
  const fotos = datos.fotos instanceof Map ? datos.fotos : new Map();
  const tiposShopify = datos.tiposShopify instanceof Map ? datos.tiposShopify : new Map();
  const buscar = (mapa, p) => (p.artCodigo ? mapa.get(String(p.artCodigo)) : undefined) ?? mapa.get(p.codigo);
  for (const p of porCodigo.values()) {
    if (!p.nombre) p.nombre = p.nombreTC52 || p.concepto || p.codigo;
    const ov = overrides.size ? buscar(overrides, p) : undefined;
    if (ov) {
      p.foto = ov.foto ?? null;
      p.categoriaPropia = ov.categoria ? categoriaLimpia(ov.categoria) : null;
      // El ÚNICO "Descontinuado": lo que el dueño marca en el Admin.
      p.descontinuado = !!ov.descontinuado;
      p.descontinuadoDesde = ov.descontinuado && ov.descontinuadoDesde ? new Date(ov.descontinuadoDesde) : null;
    }
    if (!p.foto && fotos.size) p.foto = buscar(fotos, p) ?? null;
    const ts = tiposShopify.size ? buscar(tiposShopify, p) : undefined;
    if (ts) {
      p.tipoShopify = ts.tipo ? limpiarNombre(ts.tipo) || null : null;
      p.tituloShopify = ts.titulo ? limpiarNombre(ts.titulo) || null : null;
    }
    Object.assign(p, resolverCategoria({ propia: p.categoriaPropia, tipoShopify: p.tipoShopify, caja: p.categoriaCaja }));
    // La regla de cocina mira la categoría de la CAJA (así están escritas las reglas).
    p.esCocina = esCocina({ codigo: p.codigo, categoria: p.categoriaCaja, nombre: p.nombre }, o.cocina);
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

  // ── Más vendidos: top N por piezas de 30 días, sin cocina ni códigos genéricos ─
  const topN = Math.max(0, num(o.topMasVendidos));
  if (topN > 0) {
    const vendedores = productos
      .filter(p => !p.esCocina && !p.nuncaContado && p.vendidas.d30 > 0)
      .sort((a, b) => b.vendidas.d30 - a.vendidas.d30 || a.codigo.localeCompare(b.codigo));
    for (const p of vendedores.slice(0, topN)) p.masVendido = true;
  }

  // ── Clasificación (clase v1) + condiciones v2 ────────────────────────────
  const opcionesCondiciones = { ...o, ahora, areasVenta };
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

    const c = calcularCondiciones(p, opcionesCondiciones);
    p.condiciones = c.condiciones;
    p.faltaEn = c.faltaEn;
    p.hayEn = c.hayEn;
    p.prioridad = c.prioridad;
    p.tramoSinMovimiento = c.tramoSinMovimiento;
    p.diasSinMovimiento = c.diasSinMovimiento;
    p.rotacion = c.rotacion;
    p.tendencia = c.tendencia;
    p.ventaDiaria = c.ventaDiaria;
    p.coberturaDias = c.coberturaDias;
    p.coberturaTiendaDias = c.coberturaTiendaDias;
    // Números por área: venta diaria, disponible y cobertura (solo áreas de venta
    // tienen cobertura; Bodega no vende, ahí solo hay disponible).
    const porAreaCalc = new Map(c.areas.map(a => [a.area, a]));
    for (const a of p.porArea.values()) {
      const calc = porAreaCalc.get(a.area);
      const contado = a.cantidad !== null && a.cantidad !== undefined;
      a.v7 = num(a.v7); a.v14 = num(a.v14); a.v30 = num(a.v30);
      a.v60 = num(a.v60); a.v90 = num(a.v90); a.v180 = num(a.v180);
      a.ventaDiaria = calc ? calc.ventaDiaria : Math.round((a.v14 / ventana) * 100) / 100;
      a.disponible = contado ? a.cantidad - num(a.apartado) : null;
      a.cobertura = calc ? calc.cobertura : null;
      a.desfasada = calc ? calc.desfasada : false;
    }

    p.areas = [...p.porArea.values()]
      .map(a => ({
        area: a.area,
        cantidad: a.cantidad,
        apartado: a.apartado || 0,
        disponible: a.disponible,
        // La fecha va dos veces a propósito: el texto ISO para el celular y el
        // Date crudo para quien tenga que volver a hacer cuentas. Volver a parsear
        // el ISO con -06:00 y leerle las partes UTC corría la fecha un día para
        // todo lo que entró después de las 18:00 (la tienda recibe de tarde).
        ultimaEntrada: a.ultimaEntrada ? naiveAIso(a.ultimaEntrada) : null,
        entradaDate: a.ultimaEntrada ?? null,
        diasDesdeEntrada: a.ultimaEntrada ? diasEntre(a.ultimaEntrada, ahora) : null,
        v7: a.v7, v14: a.v14, v30: a.v30, v60: a.v60, v90: a.v90, v180: a.v180,
        ventaDiaria: a.ventaDiaria,
        cobertura: a.cobertura,
        desfase: a.desfase ?? null,
      }))
      .filter(a => a.cantidad !== null && a.cantidad !== undefined)
      .sort((x, y) => posicion(x.area) - posicion(y.area));
  }

  // ── Resurtido por área de venta ──────────────────────────────────────────
  const resurtido = [];
  for (const p of productos) {
    // Un descontinuado no se resurte: el dueño ya decidió que no se compra más.
    if (p.descontinuado) continue;
    for (const area of areasVenta) {
      const enArea = p.porArea.get(area);
      const vendidas = num(enArea?.v14);
      const contado = enArea && enArea.cantidad !== null && enArea.cantidad !== undefined;
      // Puede salir NEGATIVO si en la ventana hubo más devoluciones que ventas.
      // Eso no es "se vende", y con un guardia de falsy (-3 es truthy) se colaba a
      // la lista de urgentes con una venta diaria en negativo.
      if (!(vendidas > 0)) continue;
      const fila = calcularResurtido(
        {
          codigo: p.codigo,
          area,
          vendidasVentana: vendidas,
          stock: contado ? enArea.cantidad : null,
          apartado: enArea?.apartado ?? 0,
          desfase: enArea?.desfase ?? null,
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
          ahora,
        },
      );
      resurtido.push({
        codigo: p.codigo, nombre: p.nombre, area, esCocina: p.esCocina, foto: p.foto,
        categoria: p.categoria, prioridad: p.prioridad, descontinuado: p.descontinuado,
        // ¿nunca se ha contado en NINGUNA área? casi siempre es comida preparada o
        // un código genérico: se esconde por defecto para que la lista sirva.
        nuncaContado: p.nuncaContado,
        vendidas14: vendidas,
        desfase: enArea?.desfase ?? null,
        // "hay 40": lo disponible en el respaldo (null = Bodega no lo tiene contado).
        enBodega: fila.respaldo ? fila.respaldo.disponible : null,
        ...fila,
      });
    }
  }

  // ── Ventas por día (90 días) → índice para los mapas de calor ────────────
  const ventasDiaIndice = indexarVentasDia(datos.ventasDia ?? [], { porCodigo, equivalencias });

  // ── Catálogo completo de NovaCaja (solo para el buscador) ────────────────
  const catalogoCompleto = new Map();
  for (const c of datos.catalogoCompleto ?? []) {
    const artCodigo = String(c.art_codigo ?? c.Art_Codigo ?? c.codigo ?? '').trim();
    if (!artCodigo || catalogoCompleto.has(artCodigo)) continue;
    // Nombres y categorías limpiados IGUAL que el catálogo normal (limpiarNombre /
    // limpiarCategoria), para que el buscador no enseñe "$" ni "CON IVA".
    const nombre = limpiarNombre(c.descripcion ?? c.Art_Descripcion ?? '') || artCodigo;
    const caja = categoriaLimpia(c.categoria ?? c.Org_Descripcion ?? null);
    const marcaCruda = c.marca ?? c.Mar_Nombre ?? null;
    const ov = overrides.size ? overrides.get(artCodigo) : undefined;
    const propia = ov?.categoria ? categoriaLimpia(ov.categoria) : null;
    catalogoCompleto.set(artCodigo, {
      codigo: artCodigo,
      nombre,
      nombreNormalizado: normalizar(nombre),
      categoria: resolverCategoria({ propia, tipoShopify: null, caja }).categoria,
      marca: marcaCruda ? limpiarNombre(marcaCruda) || null : null,
      foto: ov?.foto ?? null,
    });
  }

  // ── Totales para las tarjetas ────────────────────────────────────────────
  const porClase = resumirPorClase(conPiezas);
  const parado = p => p.clase === 'sin_movimiento' || p.clase === 'lento';
  const paradas = conPiezas.filter(parado);
  const piezasPorArea = {};
  for (const p of conPiezas) {
    for (const a of p.areas) {
      if (!(a.cantidad > 0)) continue;
      const acc = piezasPorArea[a.area] ?? (piezasPorArea[a.area] = { area: a.area, productos: 0, piezas: 0, paradas: 0, piezasParadas: 0 });
      acc.productos += 1;
      acc.piezas += a.cantidad;
      if (parado(p)) {
        acc.paradas += 1;
        acc.piezasParadas += a.cantidad;
      }
    }
  }

  // Categorías (para el filtro): cuántos productos con piezas y cuántas piezas.
  const porCategoria = new Map();
  for (const p of conPiezas) {
    const acc = porCategoria.get(p.categoria) ?? { nombre: p.categoria, productos: 0, piezas: 0 };
    acc.productos += 1;
    acc.piezas += p.piezas;
    porCategoria.set(p.categoria, acc);
  }
  const categorias = [...porCategoria.values()]
    .sort((a, b) => b.productos - a.productos || a.nombre.localeCompare(b.nombre, 'es'));

  // Cobertura por sucursal: mediana de la cobertura de lo que se vende ahí (sin
  // cocina ni códigos genéricos, que no tienen conteo) y cuántos van urgentes.
  const visible = p => !p.esCocina && !p.nuncaContado;
  const coberturaSucursal = areasVenta.map(area => {
    const coberturas = [];
    let productosQueVenden = 0;
    let urgentes = 0;
    for (const p of productos) {
      if (!visible(p)) continue;
      const a = p.porArea.get(area);
      if (!a || !(a.v14 > 0)) continue;
      productosQueVenden += 1;
      if (a.cobertura !== null && a.cobertura !== undefined) coberturas.push(a.cobertura);
      if (a.desfasada || (a.cobertura !== null && a.cobertura !== undefined && a.cobertura < o.coberturaUrgenteDias)) urgentes += 1;
    }
    const m = mediana(coberturas);
    return { area, medianaDias: m === null ? null : Math.round(m * 10) / 10, productosQueVenden, urgentes };
  });

  const snap = {
    generado: naiveAIso(ahora),
    ahora,
    areas,
    areasVenta,
    areasRespaldo,
    productos,
    porCodigo,
    resurtido,
    ventasDiaIndice,
    catalogoCompleto,
    categorias,
    coberturaSucursal,
    hayTiposShopify: tiposShopify.size > 0,
    resumen: {
      conPiezas: conPiezas.length,
      piezasTotales: conPiezas.reduce((s, p) => s + p.piezas, 0),
      piezasParadas: paradas.reduce((s, p) => s + p.piezas, 0),
      porClase,
      porArea: Object.values(piezasPorArea),
    },
  };

  // ── Alertas ──────────────────────────────────────────────────────────────
  snap.alertas = calcularAlertas(snap, {
    ahora,
    sinMovimientoAlertaDias: o.sinMovimientoAlertaDias,
    entradasSinVentaDias: o.entradasSinVentaDias,
    refrigerado: o.refrigerado,
  });
  const alertasPorCodigo = new Map();
  for (const a of snap.alertas) {
    let lista = alertasPorCodigo.get(a.codigo);
    if (!lista) alertasPorCodigo.set(a.codigo, (lista = []));
    lista.push(a.tipo);
  }
  for (const p of productos) p.alertas = alertasPorCodigo.get(p.codigo) ?? [];

  // ── Resumen del día (las tarjetas de Inventario; cuadran con sus filtros) ──
  const resumenDia = {
    urgentes: 0, piezasAMover: 0, agotados: 0, sinStock: 0, bajoStock: 0, sobrestock: 0,
    sinMovimiento90: 0, descontinuados: 0, alertas: snap.alertas.length,
    alertasUrgentes: snap.alertas.filter(a => a.prioridad === 'alta').length,
    conPiezas: conPiezas.length, piezas: snap.resumen.piezasTotales,
  };
  for (const p of productos) {
    if (!visible(p)) continue;
    const c = p.condiciones;
    if (p.prioridad === 'alta') resumenDia.urgentes += 1;
    if (c.includes('agotado')) resumenDia.agotados += 1;
    if (c.includes('sin_stock')) resumenDia.sinStock += 1;
    if (c.includes('bajo_stock')) resumenDia.bajoStock += 1;
    if (c.includes('sobrestock')) resumenDia.sobrestock += 1;
    if (p.piezas > 0 && p.tramoSinMovimiento >= 90) resumenDia.sinMovimiento90 += 1;
    if (p.piezas > 0 && p.descontinuado) resumenDia.descontinuados += 1;
  }
  for (const r of resurtido) {
    if (r.esCocina || r.nuncaContado) continue;
    resumenDia.piezasAMover += num(r.accion?.surtirDeRespaldo);
  }
  snap.resumenDia = resumenDia;

  // ── Movimiento: lo precalculado con los filtros por defecto ─────────────
  snap.movimiento = calcularMovimiento(snap, { dias: 30, area: '', incluirCocina: false });

  return snap;
}
