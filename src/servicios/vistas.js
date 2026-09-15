// Las vistas: filtran y ordenan lo que ya está en memoria. Nada de SQL aquí.
//
// Todo lo que sale de estas funciones va tal cual al celular, así que:
//   · ni una llave ni un texto de dinero (no hay precio, costo, importe, margen,
//     cajero, cliente ni proveedor como dato);
//   · fechas en ISO con -06:00 y además ya digeridas ("hace 143 días");
//   · "Descontinuado" SOLO es p.descontinuado (lo marcó el dueño en el Admin).
//
// Son las cuatro pantallas de la v2 (Inventario · Resurtir · Movimiento · Alertas)
// más el buscador y la ficha (contrato v2, sección 4).
import { contarAlertas, GRUPOS_ALERTA } from '../calculos/alertas.js';
import { ETIQUETAS } from '../calculos/clasificacion.js';
import { CONDICIONES, PRIORIDADES } from '../calculos/condiciones.js';
import { fechaCorta, haceCuanto, horaCorta, naiveAIso } from '../calculos/fechas.js';
import { calcularMovimiento, PERIODOS } from '../calculos/movimiento.js';
import { ordenarResurtido } from '../calculos/resurtido.js';
import { normalizar } from '../calculos/texto.js';

export const POR_PAGINA = 60;
export const POR_PAGINA_TOPE = 200;
export const ORDENES_INVENTARIO = ['piezas', 'dias', 'cobertura', 'nombre', 'rotacion', 'venta'];
export const HORIZONTES = ['hoy', '3', '7'];
export const FILTROS_ALERTAS = ['todas', 'urgentes', ...GRUPOS_ALERTA];

const redondear = v => Math.round((Number(v) || 0) * 100) / 100;
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const siNo = v => v === true || v === 1 || v === '1' || v === 'true' || v === 'si';
const texto = v => String(v ?? '').trim();

// ── Producto ───────────────────────────────────────────────────────────────────

/**
 * "Inventario desfasado": el sistema dice 0 en un área y ahí se sigue vendiendo.
 * @param {{piezas: number, desde: Date|null, areas: string[]}|null} d
 */
function textoDesfase(d, ahora) {
  if (!d || !(d.piezas > 0)) return null;
  const donde = d.areas.join(' y ');
  const desde = d.desde ? ` desde el ${fechaCorta(d.desde, ahora)}` : '';
  return {
    piezas: redondear(d.piezas),
    areas: d.areas,
    desdeTexto: d.desde ? fechaCorta(d.desde, ahora) : null,
    texto: `En ${donde} el sistema dice 0, pero se han vendido ${redondear(d.piezas)} piezas${desde}. Hay que contarlo con la TC52.`,
  };
}

/**
 * Producto listo para el celular (ProductoJson del contrato). Con `detalle` se
 * agregan los campos de la ficha.
 * @param {object} p              producto del snapshot
 * @param {{detalle?: boolean, ahora?: Date}} [opciones]  ahora = snap.ahora (para "hace N días")
 */
export function productoJson(p, { detalle = false, ahora } = {}) {
  const salida = {
    codigo: p.codigo,
    artCodigo: p.artCodigo ?? null,
    nombre: p.nombre,
    categoria: p.categoria || 'Sin categoría',
    subcategoria: p.subcategoria ?? null,
    categoriaFuente: p.categoriaFuente ?? 'ninguna',
    marca: p.marca || null,
    foto: p.foto || null,
    alta: !!p.alta,
    esCocina: !!p.esCocina,
    descontinuado: !!p.descontinuado,
    descontinuadoDesde: p.descontinuadoDesde ? naiveAIso(p.descontinuadoDesde) : null,
    piezas: redondear(p.piezas),
    apartadas: redondear(p.apartado),
    areas: (p.areas ?? []).map(a => ({
      area: a.area,
      piezas: a.cantidad,
      apartadas: redondear(a.apartado),
      ultimaEntrada: a.ultimaEntrada,
      // Se usa la fecha CRUDA (entradaDate), no el ISO ya armado: volver a parsear
      // el texto con -06:00 y leerle las partes UTC corría un día las entradas de
      // después de las 18:00.
      entradaTexto: a.entradaDate ? fechaCorta(a.entradaDate, ahora) : null,
      vendidas14: redondear(a.v14),
      cobertura: a.cobertura ?? null,
      desfase: a.desfase ? redondear(a.desfase.piezas) : 0,
    })),
    clase: p.clase,
    etiqueta: ETIQUETAS[p.clase] ?? p.clase,
    condiciones: [...(p.condiciones ?? [])],
    prioridad: p.prioridad ?? 'baja',
    ventaDiaria: redondear(p.ventaDiaria),
    coberturaDias: p.coberturaDias ?? null,
    rotacion: redondear(p.rotacion),
    tendencia: {
      d7: p.tendencia?.d7 ?? null,
      d30: p.tendencia?.d30 ?? null,
      d90: p.tendencia?.d90 ?? null,
    },
    ultimaVenta: p.ultimaVenta ? naiveAIso(p.ultimaVenta) : null,
    diasSinVenta: p.diasSinVenta ?? null,
    diasSinMovimiento: p.diasSinMovimiento ?? null,
    tramoSinMovimiento: p.tramoSinMovimiento ?? 0,
    ventaTexto: p.ultimaVenta ? `Última venta: ${haceCuanto(p.ultimaVenta, ahora)}` : 'Nunca se ha vendido',
    ultimaEntrada: p.ultimaEntrada ? naiveAIso(p.ultimaEntrada) : null,
    entradaTexto: p.ultimaEntrada ? `Última entrada: ${fechaCorta(p.ultimaEntrada, ahora)}` : null,
    vendidas: {
      d7: redondear(p.vendidas?.d7), d30: redondear(p.vendidas?.d30),
      d90: redondear(p.vendidas?.d90), d120: redondear(p.vendidas?.d120),
    },
    desfase: textoDesfase(p.desfase, ahora),
    duplicado: p.duplicado
      ? {
        codigo: p.duplicado.codigo,
        nombre: p.duplicado.nombre,
        piezas: redondear(p.duplicado.piezasVendidas),
        texto: `Se vende como ${p.duplicado.codigo} ${p.duplicado.nombre}`,
      }
      : null,
    enCatalogoSolo: false,
  };
  if (detalle) {
    salida.vendidas.d14 = redondear(p.vendidas?.d14);
    salida.vendidas.d60 = redondear(p.vendidas?.d60);
    salida.vendidas.d180 = redondear(p.vendidas?.d180);
    salida.primeraVez = p.primeraVez ? naiveAIso(p.primeraVez) : null;
    salida.diasDesdeEntrada = p.diasDesdeEntrada ?? null;
    salida.ventaHeredadaDe = p.ventaHeredadaDe ?? null;
    salida.alertas = [...(p.alertas ?? [])];
  }
  return salida;
}

/**
 * Producto que SOLO existe en el catálogo de NovaCaja (ni contado ni vendido en
 * 120 días): ProductoJson mínimo para el buscador y la ficha.
 * @param {{codigo: string, nombre: string, categoria: string, marca: string|null, foto: string|null}} c
 */
export function productoDeCatalogo(c) {
  return {
    codigo: c.codigo,
    artCodigo: c.codigo,
    nombre: c.nombre,
    categoria: c.categoria || 'Sin categoría',
    subcategoria: null,
    categoriaFuente: c.categoria && c.categoria !== 'Sin categoría' ? 'caja' : 'ninguna',
    marca: c.marca || null,
    foto: c.foto || null,
    alta: true,
    esCocina: false,
    descontinuado: false,
    descontinuadoDesde: null,
    piezas: 0,
    apartadas: 0,
    areas: [],
    clase: 'catalogo',
    etiqueta: 'En catálogo de caja, sin existencia contada',
    condiciones: [],
    prioridad: 'baja',
    ventaDiaria: 0,
    coberturaDias: null,
    rotacion: 0,
    tendencia: { d7: null, d30: null, d90: null },
    ultimaVenta: null,
    diasSinVenta: null,
    diasSinMovimiento: null,
    tramoSinMovimiento: 0,
    ventaTexto: 'Sin ventas en los últimos 120 días',
    ultimaEntrada: null,
    entradaTexto: null,
    vendidas: { d7: 0, d30: 0, d90: 0, d120: 0 },
    desfase: null,
    duplicado: null,
    enCatalogoSolo: true,
  };
}

// ── Encabezado ─────────────────────────────────────────────────────────────────

/**
 * Encabezado: cuándo se actualizó, áreas, resumen del día, cobertura por sucursal,
 * categorías, capacidades y umbrales.
 * @param {object|null} snap
 * @param {{calculando?: boolean}|null} motor
 * @param {string|null} usuario
 * @param {{capacidades?: object, umbrales?: object}} [extra]
 */
export function vistaEstado(snap, motor, usuario, { capacidades = {}, umbrales = {} } = {}) {
  const r = snap?.resumenDia;
  return {
    listo: !!snap,
    calculando: !!motor?.calculando,
    usuario: usuario ?? null,
    generado: snap?.generado ?? null,
    actualizado: snap ? horaCorta(snap.ahora) : null,
    areas: (snap?.areas ?? []).map(a => ({ nombre: a.nombre, color: a.color })),
    areasVenta: snap?.areasVenta ?? [],
    areasRespaldo: snap?.areasRespaldo ?? [],
    resumen: snap
      ? {
        conPiezas: snap.resumen.conPiezas,
        piezas: snap.resumen.piezasTotales,
        piezasParadas: snap.resumen.piezasParadas,
      }
      : null,
    resumenDia: r
      ? {
        urgentes: r.urgentes, piezasAMover: r.piezasAMover, sinStock: r.sinStock, bajoStock: r.bajoStock,
        sobrestock: r.sobrestock, sinMovimiento90: r.sinMovimiento90, descontinuados: r.descontinuados,
        alertas: r.alertas, alertasUrgentes: r.alertasUrgentes ?? 0,
      }
      : null,
    coberturaSucursal: (snap?.coberturaSucursal ?? []).map(c => ({
      area: c.area, medianaDias: c.medianaDias, productosQueVenden: c.productosQueVenden, urgentes: c.urgentes,
    })),
    categorias: (snap?.categorias ?? []).map(c => ({ nombre: c.nombre, productos: c.productos })),
    capacidades: {
      solicitudes: !!capacidades.solicitudes,
      fotos: !!capacidades.fotos,
      overrides: !!capacidades.overrides,
      shopify: !!capacidades.shopify,
    },
    umbrales: {
      lentoDias: num(umbrales.lentoDias) || 30,
      nuevoDias: num(umbrales.nuevoDias) || 30,
      coberturaUrgenteDias: umbrales.coberturaUrgenteDias ?? 2,
      coberturaBajaDias: umbrales.coberturaBajaDias ?? 7,
      diasSugeridos: umbrales.diasSugeridos ?? 7,
      ventanaVentaDiariaDias: num(umbrales.ventanaVentaDiariaDias) || 14,
      sobrestockDias: umbrales.sobrestockDias ?? 120,
      sobrestockMin: umbrales.sobrestockMin ?? 24,
      topMasVendidos: umbrales.topMasVendidos ?? 50,
      sinMovimientoDias: umbrales.sinMovimientoDias ?? umbrales.descontinuadoDias ?? 90,
    },
  };
}

// ── Inventario ─────────────────────────────────────────────────────────────────

/** "a,b,c" o ['a','b'] -> solo ids de condición válidos, sin repetir. */
export function leerCondiciones(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor ?? '').split(',');
  const validas = new Set(CONDICIONES);
  return [...new Set(lista.map(texto).filter(c => validas.has(c)))];
}

const piezasEnArea = (p, area) => (area ? num(p.porArea.get(area)?.cantidad) : num(p.piezas));

/**
 * Inventario completo con filtros, orden y paginación de 60.
 *
 *   · condiciones: se cumplen TODAS las que vengan;
 *   · soloConPiezas (1 por defecto): con 0 entran los contados en 0 y los
 *     vendidos sin conteo;
 *   · cocina (0 por defecto): esconde la comida hecha en casa. Lo "vendido sin
 *     conteo" que no es cocina (p. ej. un código que se cobra y nadie ha contado)
 *     SÍ se ve con soloConPiezas=0: para eso existe ese interruptor.
 * @param {object} snap
 * @param {{area?: string, condiciones?: string|string[], prioridad?: string, categoria?: string,
 *          orden?: string, q?: string, pagina?: number|string, porPagina?: number|string,
 *          soloConPiezas?: any, cocina?: any}} [filtros]
 */
export function vistaInventario(snap, filtros = {}) {
  const area = texto(filtros.area);
  const condiciones = leerCondiciones(filtros.condiciones);
  const prioridad = PRIORIDADES.includes(filtros.prioridad) ? filtros.prioridad : '';
  const categoria = texto(filtros.categoria);
  const categoriaN = normalizar(categoria);
  const orden = ORDENES_INVENTARIO.includes(filtros.orden) ? filtros.orden : 'piezas';
  const q = texto(filtros.q);
  const qN = normalizar(q);
  const pagina = Math.max(1, Math.floor(Number(filtros.pagina)) || 1);
  const porPagina = Math.min(Math.max(Math.floor(Number(filtros.porPagina)) || POR_PAGINA, 1), POR_PAGINA_TOPE);
  const soloConPiezas = filtros.soloConPiezas === undefined || filtros.soloConPiezas === '' ? true : siNo(filtros.soloConPiezas);
  const cocina = siNo(filtros.cocina);

  let lista = snap.productos;
  if (!cocina) lista = lista.filter(p => !p.esCocina);
  if (soloConPiezas) lista = lista.filter(p => p.piezas > 0);
  if (area) {
    lista = lista.filter(p => {
      const a = p.porArea.get(area);
      if (!a) return false;
      return soloConPiezas ? num(a.cantidad) > 0 : true;
    });
  }
  if (condiciones.length) lista = lista.filter(p => condiciones.every(c => p.condiciones.includes(c)));
  if (prioridad) lista = lista.filter(p => p.prioridad === prioridad);
  if (categoriaN) lista = lista.filter(p => normalizar(p.categoria) === categoriaN);
  if (qN) lista = lista.filter(p => p.nombreNormalizado.includes(qN) || p.codigo.includes(q));

  // El desempate por código NO es un lujo: hay miles de productos con 1 o 2 piezas
  // y sin ventas, o sea empatados en los demás criterios. Sin un último criterio
  // fijo el orden acaba siendo el que devolvió SQL (que con NOLOCK cambia entre
  // refrescos) y, como la lista se pagina, al pedir la página 2 después de un
  // refresco se repetían productos y otros no salían nunca.
  const coberturaDe = p => (area ? p.porArea.get(area)?.cobertura : p.coberturaDias);
  const ventaDe = p => (area ? num(p.porArea.get(area)?.ventaDiaria) : num(p.ventaDiaria));
  const grande = Number.MAX_SAFE_INTEGER;
  const comparadores = {
    piezas: (a, b) => piezasEnArea(b, area) - piezasEnArea(a, area),
    // Más días parado primero; sin dato al final.
    dias: (a, b) => (b.diasSinMovimiento ?? -1) - (a.diasSinMovimiento ?? -1),
    // Menos cobertura primero (lo más urgente); sin cobertura al final.
    cobertura: (a, b) => (coberturaDe(a) ?? grande) - (coberturaDe(b) ?? grande),
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
    rotacion: (a, b) => num(b.rotacion) - num(a.rotacion),
    venta: (a, b) => ventaDe(b) - ventaDe(a),
  };
  const principal = comparadores[orden];
  lista = [...lista].sort((a, b) => principal(a, b)
    || piezasEnArea(b, area) - piezasEnArea(a, area)
    || a.codigo.localeCompare(b.codigo));

  const cuantos = lista.length;
  const desde = (pagina - 1) * porPagina;
  return {
    filtros: { area, condiciones, prioridad, categoria, orden, q, soloConPiezas, cocina },
    cuantos,
    piezas: redondear(lista.reduce((s, p) => s + piezasEnArea(p, area), 0)),
    pagina,
    porPagina,
    hayMas: desde + porPagina < cuantos,
    productos: lista.slice(desde, desde + porPagina).map(p => productoJson(p, { ahora: snap.ahora })),
  };
}

// ── Buscador ───────────────────────────────────────────────────────────────────

/** Puntos de un candidato {codigo, nombreNormalizado} contra lo buscado (0 = no pega). */
function puntosDe(candidato, crudo, textoN, palabras) {
  if (candidato.codigo === crudo) return 100;
  if (crudo.length >= 3 && candidato.codigo.includes(crudo)) return 60;
  if (candidato.nombreNormalizado.startsWith(textoN)) return 50;
  if (palabras.every(w => candidato.nombreNormalizado.includes(w))) return 30;
  return 0;
}

// Art_Codigo de todo lo que ya está en el snapshot, por snapshot (se arma una vez).
const artCodigosPorSnap = new WeakMap();
function artCodigosDe(snap) {
  let set = artCodigosPorSnap.get(snap);
  if (!set) {
    set = new Set();
    for (const p of snap.productos) if (p.artCodigo) set.add(String(p.artCodigo));
    artCodigosPorSnap.set(snap, set);
  }
  return set;
}

/**
 * Buscador global: por código o por nombre sobre el snapshot y, si hay menos de
 * `limite` resultados, sobre el catálogo COMPLETO de NovaCaja (esos salen como
 * "en catálogo de caja, sin existencia contada").
 */
export function vistaBuscar(snap, { q = '', limite = 40 } = {}) {
  const crudo = texto(q);
  const textoN = normalizar(crudo);
  const tope = Math.min(Math.max(Number(limite) || 40, 1), 200);
  if (textoN.length < 2) return { q: crudo, cuantos: 0, productos: [], deCatalogo: 0 };

  const palabras = textoN.split(' ').filter(Boolean);
  const resultados = [];
  for (const p of snap.productos) {
    const puntos = puntosDe(p, crudo, textoN, palabras);
    if (!puntos) continue;
    // Primero lo que hay en la tienda.
    resultados.push({ p, puntos: puntos + (p.piezas > 0 ? 10 : 0) });
  }
  resultados.sort((a, b) => b.puntos - a.puntos || b.p.piezas - a.p.piezas || a.p.codigo.localeCompare(b.p.codigo));
  const productos = resultados.slice(0, tope).map(r => productoJson(r.p, { ahora: snap.ahora }));

  // Si no se llenó con lo que hay en la tienda, se cae al catálogo de la caja.
  let deCatalogo = 0;
  let cuantosCatalogo = 0;
  if (productos.length < tope && snap.catalogoCompleto?.size) {
    const yaEstan = artCodigosDe(snap);
    const extra = [];
    for (const c of snap.catalogoCompleto.values()) {
      if (snap.porCodigo.has(c.codigo) || yaEstan.has(c.codigo)) continue;
      const puntos = puntosDe(c, crudo, textoN, palabras);
      if (puntos) extra.push({ c, puntos });
    }
    cuantosCatalogo = extra.length;
    extra.sort((a, b) => b.puntos - a.puntos || a.c.nombre.localeCompare(b.c.nombre, 'es') || a.c.codigo.localeCompare(b.c.codigo));
    for (const r of extra.slice(0, tope - productos.length)) {
      productos.push(productoDeCatalogo(r.c));
      deCatalogo += 1;
    }
  }
  return { q: crudo, cuantos: resultados.length + cuantosCatalogo, productos, deCatalogo };
}

// ── Ficha ──────────────────────────────────────────────────────────────────────

const MOTIVOS = {
  venta: 'venta en caja',
  venta_web: 'pedido de la página',
  retiro: 'retiro',
  vencimiento: 'vencimiento',
  dano: 'daño',
  cocina: 'para cocina',
  robo: 'robo',
  otro: 'otro motivo',
};
const motivoTexto = m => (m ? (MOTIVOS[m] ?? String(m).replace(/_/g, ' ')) : null);

/**
 * Una fila de movimientos_bodega, explicada. `area` es el DESTINO (la columna
 * `ubicacion`) y `areaOrigen` el origen de un traslado (la columna `area`).
 * @param {{fecha: any, tipo: string, motivo: string|null, cantidad: number, ubicacion: string,
 *          area: string|null, stock_antes: number|null, stock_despues: number|null}} f
 * @param {Date} ahora
 */
export function movimientoJson(f, ahora) {
  const fecha = f.fecha ? new Date(f.fecha) : null;
  const tipo = texto(f.tipo).toLowerCase() || 'movimiento';
  const motivo = texto(f.motivo).toLowerCase() || null;
  const cantidad = redondear(f.cantidad);
  const area = texto(f.ubicacion) || null;
  const areaOrigen = texto(f.area) || null;
  const stockAntes = f.stock_antes === null || f.stock_antes === undefined ? null : redondear(f.stock_antes);
  const stockDespues = f.stock_despues === null || f.stock_despues === undefined ? null : redondear(f.stock_despues);
  const en = area ? ` en ${area}` : '';
  const de = area ? ` de ${area}` : '';
  const porMotivo = motivo ? ` por ${motivoTexto(motivo)}` : '';
  let textoMov;
  if (tipo === 'traslado') {
    textoMov = areaOrigen
      ? `Traslado de ${cantidad} de ${areaOrigen} a ${area ?? '?'}`
      : `Traslado de ${cantidad} a ${area ?? '?'}`;
  } else if (tipo === 'entrada') {
    textoMov = `Entrada de ${cantidad}${en}${porMotivo}`;
  } else if (tipo === 'salida') {
    textoMov = `Salida de ${cantidad}${de}${porMotivo}`;
  } else if (tipo === 'merma') {
    textoMov = `Merma de ${cantidad}${en}${porMotivo}`;
  } else if (tipo === 'ajuste') {
    textoMov = stockAntes !== null && stockDespues !== null
      ? `Ajuste${en}: de ${stockAntes} a ${stockDespues}`
      : `Ajuste de ${cantidad}${en}`;
  } else {
    textoMov = `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} de ${cantidad}${en}${porMotivo}`;
  }
  return {
    fecha: fecha ? naiveAIso(fecha) : null,
    fechaTexto: fecha ? `${fechaCorta(fecha, ahora)} ${horaCorta(fecha)}` : null,
    tipo,
    motivo: motivoTexto(motivo),
    cantidad,
    area,
    areaOrigen,
    stockAntes,
    stockDespues,
    texto: textoMov,
  };
}

/**
 * Una solicitud del admin, con solo los campos del contrato. Las fechas ya vienen
 * en ISO con -06:00 (las normaliza src/datos/admin.js).
 */
export function solicitudJson(s) {
  if (!s || typeof s !== 'object') return null;
  const n = v => (v === null || v === undefined ? null : Number(v));
  return {
    id: n(s.id),
    codigo_barras: texto(s.codigo_barras),
    nombre_mostrar: texto(s.nombre_mostrar) || texto(s.nombre) || texto(s.codigo_barras),
    de_ubicacion: texto(s.de_ubicacion),
    a_ubicacion: texto(s.a_ubicacion),
    cantidad: num(s.cantidad),
    cantidad_hecha: n(s.cantidad_hecha),
    estado: texto(s.estado),
    prioridad: num(s.prioridad),
    origen: texto(s.origen),
    nota: s.nota ? texto(s.nota) : null,
    solicitado_por: s.solicitado_por ? texto(s.solicitado_por) : null,
    hecha_por: s.hecha_por ? texto(s.hecha_por) : null,
    movimiento_id: n(s.movimiento_id),
    stock_origen: num(s.stock_origen),
    stock_destino: n(s.stock_destino),
    creado: s.creado ?? null,
    hecha_en: s.hecha_en ?? null,
    cancelada_en: s.cancelada_en ?? null,
    motivo_cancelacion: s.motivo_cancelacion ? texto(s.motivo_cancelacion) : null,
    ...(Array.isArray(s.eventos)
      ? {
        eventos: s.eventos.map(e => ({
          id: n(e.id), fecha: e.fecha ?? null, tipo: texto(e.tipo),
          de: e.de ?? null, a: e.a ?? null, usuario: e.usuario ?? null, detalle: e.detalle ?? null,
        })),
      }
      : {}),
  };
}

/**
 * Ficha de un producto. `movimientos` (movimientos_bodega) y `solicitudes` (del
 * admin) los trae la ruta; aquí solo se explican.
 * @param {object} snap
 * @param {string} codigo
 * @param {{movimientos?: any[], solicitudes?: any[]}} [extra]
 */
export function vistaProducto(snap, codigo, { movimientos = [], solicitudes = [] } = {}) {
  const c = texto(codigo);
  const p = snap.porCodigo.get(c);
  const ahora = snap.ahora;
  let base;
  if (p) {
    base = productoJson(p, { detalle: true, ahora });
    // Todas las áreas activas, aunque el producto no esté contado ahí: "sin contar"
    // no es lo mismo que cero, y esa diferencia es justo la que confunde en la tienda.
    base.areasTodas = snap.areas.map(a => {
      const enArea = p.porArea.get(a.nombre);
      return {
        area: a.nombre,
        color: a.color,
        contado: !!enArea && enArea.cantidad !== null && enArea.cantidad !== undefined,
        piezas: enArea?.cantidad ?? null,
        apartadas: redondear(enArea?.apartado),
        ultimaEntrada: enArea?.ultimaEntrada ? naiveAIso(enArea.ultimaEntrada) : null,
        entradaTexto: enArea?.ultimaEntrada ? fechaCorta(enArea.ultimaEntrada, ahora) : null,
        vendidas14: redondear(enArea?.v14),
        cobertura: enArea?.cobertura ?? null,
        desfase: enArea?.desfase ? redondear(enArea.desfase.piezas) : 0,
        desfaseDesde: enArea?.desfase?.desde ? fechaCorta(enArea.desfase.desde, ahora) : null,
      };
    });
    base.resurtido = snap.resurtido
      .filter(r => r.codigo === p.codigo)
      .map(r => ({
        area: r.area, estado: r.estado, vendeAlDia: r.ventaDiaria,
        coberturaDias: r.coberturaDias, sugerido: r.sugerido,
        accion: r.accion.texto, accionNota: r.accion.nota, accionTipo: r.accion.tipo,
      }));
  } else {
    // Solo en el catálogo de la caja (el buscador lo encontró ahí).
    const enCatalogo = snap.catalogoCompleto?.get(c);
    if (!enCatalogo) return null;
    base = productoDeCatalogo(enCatalogo);
    base.vendidas = { ...base.vendidas, d14: 0, d60: 0, d180: 0 };
    base.primeraVez = null;
    base.diasDesdeEntrada = null;
    base.ventaHeredadaDe = null;
    base.alertas = [];
    base.areasTodas = snap.areas.map(a => ({
      area: a.nombre, color: a.color, contado: false, piezas: null, apartadas: 0,
      ultimaEntrada: null, entradaTexto: null, vendidas14: 0, cobertura: null, desfase: 0, desfaseDesde: null,
    }));
    base.resurtido = [];
  }
  base.movimientos = (movimientos ?? []).slice(0, 20).map(f => movimientoJson(f, ahora));
  base.solicitudes = (solicitudes ?? []).slice(0, 10).map(solicitudJson).filter(Boolean);
  return base;
}

// ── Resurtir ───────────────────────────────────────────────────────────────────

/** Prioridad de UNA fila (área) de resurtido, no del producto entero. */
const prioridadDeFila = f => {
  if (f.estado === 'urgente' || f.estado === 'desfasado') return 'alta';
  if (f.estado === 'bajo') return 'media';
  return 'baja';
};

/**
 * Qué mover, desde dónde, hacia dónde y cuántas piezas (sección 4 del contrato).
 *
 * `pendientes` son las solicitudes pendientes que contestó el admin (para marcar
 * "Solicitado · pendiente en TC52") y `conteo` su {pendiente, hecha, cancelada};
 * si el admin no contestó vienen null y `historial` sale null.
 * @param {object} snap
 * @param {{horizonte?: string, condicion?: string, area?: string, categoria?: string, prioridad?: string,
 *          cocina?: any, sinConteo?: any, q?: string, tope?: number|string}} [filtros]
 * @param {{pendientes?: any[]|null, conteo?: object|null, coberturaBajaDias?: number}} [extra]
 */
export function vistaResurtir(snap, filtros = {}, { pendientes = null, conteo = null, coberturaBajaDias = 7 } = {}) {
  const horizonte = HORIZONTES.includes(String(filtros.horizonte)) ? String(filtros.horizonte) : '7';
  const condicion = ['sin_stock', 'bajo_stock'].includes(filtros.condicion) ? filtros.condicion : '';
  const area = texto(filtros.area);
  const categoria = texto(filtros.categoria);
  const categoriaN = normalizar(categoria);
  const prioridad = filtros.prioridad === 'alta' ? 'alta' : '';
  const cocina = siNo(filtros.cocina);
  const sinConteo = siNo(filtros.sinConteo);
  const q = texto(filtros.q);
  const qN = normalizar(q);
  // Tope: en Casita 1 hay ~550 urgentes. Mandarlos todos son cientos de kilobytes
  // por el túnel y otras tantas tarjetas en el celular, cuando nadie va a surtir
  // más de unas decenas de una sentada. Van los más urgentes primero y la
  // pantalla dice cuántos quedaron fuera.
  const tope = Math.min(Math.max(Math.floor(Number(filtros.tope)) || 150, 1), 500);
  const dias = horizonte === 'hoy' ? null : Number(horizonte);

  // Base: lo que se vende en un área de venta, sin cocina (salvo que se pida) y
  // con los filtros de "dónde/qué" (área, categoría, texto). Las tarjetas se
  // cuentan sobre esta base, para que cuadren con lo que se está viendo.
  let base = snap.resurtido;
  if (!cocina) base = base.filter(r => !r.esCocina);
  if (area) base = base.filter(r => r.area === area);
  if (categoriaN) base = base.filter(r => normalizar(r.categoria) === categoriaN);
  if (qN) base = base.filter(r => normalizar(r.nombre).includes(qN) || r.codigo.includes(q));

  const porArea = new Map();
  const tarjetas = { urgentes: 0, piezasAMover: 0, transferencias: 0, sinRespaldo: 0, sucursalMasUrgente: null, desfasados: 0, sinConteo: 0 };
  for (const r of base) {
    if (r.estado === 'urgente') {
      tarjetas.urgentes += 1;
      porArea.set(r.area, (porArea.get(r.area) ?? 0) + 1);
    }
    if (r.estado === 'desfasado') tarjetas.desfasados += 1;
    if (r.estado === 'sin_conteo') tarjetas.sinConteo += 1;
    tarjetas.piezasAMover += num(r.accion?.surtirDeRespaldo);
    if (r.accion?.tipo === 'surtir' || r.accion?.tipo === 'surtir_parcial') tarjetas.transferencias += 1;
    if (r.accion?.tipo === 'pedir' || r.accion?.tipo === 'revisar_respaldo') tarjetas.sinRespaldo += 1;
  }
  tarjetas.piezasAMover = redondear(tarjetas.piezasAMover);
  let maximo = 0;
  for (const [nombre, n] of porArea) if (n > maximo) { maximo = n; tarjetas.sucursalMasUrgente = nombre; }

  // Lista: por horizonte (hoy = urgentes; 3/7 = cobertura menor a esos días), más
  // los desfasados (siempre: su acción es contar) y, si se pide, los sin conteo.
  let filas = base.filter(r => {
    if (r.estado === 'desfasado') return true;
    if (r.estado === 'sin_conteo') return sinConteo;
    if (r.estado === 'urgente') return true;
    if (dias === null) return false;
    return r.coberturaDias !== null && r.coberturaDias !== undefined && r.coberturaDias < dias;
  });
  if (condicion === 'sin_stock') {
    filas = filas.filter(r => r.estado === 'urgente' && r.disponible !== null && r.disponible <= 0);
  } else if (condicion === 'bajo_stock') {
    filas = filas.filter(r => r.disponible !== null && r.disponible > 0
      && r.coberturaDias !== null && r.coberturaDias < coberturaBajaDias);
  }
  if (prioridad) filas = filas.filter(r => prioridadDeFila(r) === 'alta');
  filas = ordenarResurtido(filas);

  // Solicitudes pendientes del admin, por producto+destino.
  const pendientePor = new Map();
  for (const s of pendientes ?? []) {
    const llave = `${texto(s.codigo_barras)}|${texto(s.a_ubicacion)}`;
    if (!pendientePor.has(llave)) {
      pendientePor.set(llave, {
        id: Number(s.id), estado: texto(s.estado) || 'pendiente', cantidad: num(s.cantidad), creado: s.creado ?? null,
      });
    }
  }

  const armar = f => {
    const p = snap.porCodigo.get(f.codigo);
    return {
      codigo: f.codigo,
      nombre: f.nombre,
      foto: f.foto ?? null,
      categoria: f.categoria || 'Sin categoría',
      area: f.area,
      estado: f.estado,
      prioridad: prioridadDeFila(f),
      piezasArea: f.disponible,
      apartadas: redondear(p?.porArea.get(f.area)?.apartado),
      vendeAlDia: f.ventaDiaria,
      vendidas14: redondear(f.vendidas14),
      coberturaDias: f.coberturaDias,
      enBodega: f.enBodega ?? null,
      sugerido: f.sugerido,
      accion: f.accion.texto,
      accionNota: f.accion.nota,
      accionTipo: f.accion.tipo,
      esCocina: !!f.esCocina,
      descontinuado: !!f.descontinuado,
      solicitud: pendientePor.get(`${f.codigo}|${f.area}`) ?? null,
    };
  };

  return {
    filtros: { horizonte, condicion, area, categoria, prioridad, cocina, sinConteo, q, tope },
    areasVenta: snap.areasVenta,
    tarjetas,
    cuantos: filas.length,
    filas: filas.slice(0, tope).map(armar),
    historial: conteo
      ? { pendientes: num(conteo.pendiente), hechas: num(conteo.hecha), canceladas: num(conteo.cancelada) }
      : null,
  };
}

// ── Movimiento ─────────────────────────────────────────────────────────────────

// Caché por snapshot y filtros: calcularMovimiento recorre los 18 mil productos y
// el índice de ventas por día (~170 ms las 4 combinaciones). Con el snapshot como
// llave se olvida solo cuando llega una foto nueva.
const movimientoPorSnap = new WeakMap();

/**
 * @param {object} snap
 * @param {{dias?: number|string, area?: string, cocina?: any}} [filtros]
 */
export function vistaMovimiento(snap, filtros = {}) {
  const dias = PERIODOS.includes(Number(filtros.dias)) ? Number(filtros.dias) : 30;
  const area = texto(filtros.area);
  const incluirCocina = siNo(filtros.cocina);
  if (dias === 30 && !area && !incluirCocina && snap.movimiento) return snap.movimiento;
  let cache = movimientoPorSnap.get(snap);
  if (!cache) movimientoPorSnap.set(snap, (cache = new Map()));
  const llave = `${dias}|${area}|${incluirCocina ? 1 : 0}`;
  let salida = cache.get(llave);
  if (!salida) {
    salida = calcularMovimiento(snap, { dias, area, incluirCocina });
    cache.set(llave, salida);
  }
  return salida;
}

// ── Alertas ────────────────────────────────────────────────────────────────────

/**
 * Alertas con filtro (todas · urgentes · códigos · caja · catálogo · inventario) y
 * cruzadas con las descartadas del SQLite propio. Las descartadas no salen salvo
 * con `descartadas=1` (entonces salen todas, marcadas).
 * @param {object} snap
 * @param {{filtro?: string, descartadas?: any}} [filtros]
 * @param {{descartadas?: Map<string, {usuario: string, cuando: string}>}} [extra]
 */
export function vistaAlertas(snap, filtros = {}, { descartadas = new Map() } = {}) {
  const filtro = FILTROS_ALERTAS.includes(filtros.filtro) ? filtros.filtro : 'todas';
  const verDescartadas = siNo(filtros.descartadas);
  const todas = snap.alertas ?? [];
  const activas = [];
  let cuantasDescartadas = 0;
  const marcaDe = a => {
    const d = descartadas.get(a.id);
    return d ? { usuario: d.usuario, cuando: d.cuando } : null;
  };
  for (const a of todas) {
    if (marcaDe(a)) cuantasDescartadas += 1;
    else activas.push(a);
  }
  const conteo = { ...contarAlertas(activas), descartadas: cuantasDescartadas };
  const fuente = verDescartadas ? todas : activas;
  const lista = fuente.filter(a => {
    if (filtro === 'todas') return true;
    if (filtro === 'urgentes') return a.prioridad === 'alta';
    return a.grupo === filtro;
  });
  // Primero lo que urge y, a igual prioridad, lo que tiene más piezas paradas.
  // Medido en la tienda: "todas" son miles de alertas (6 MB por el túnel), así que
  // se mandan las `limite` más importantes y `cuantos` dice cuántas hay en total.
  const PESO = { alta: 0, media: 1, baja: 2 };
  lista.sort((a, b) => (PESO[a.prioridad] ?? 3) - (PESO[b.prioridad] ?? 3)
    || num(b.piezas) - num(a.piezas)
    || String(a.id).localeCompare(String(b.id)));
  const limite = Math.min(Math.max(Math.floor(Number(filtros.limite)) || 300, 1), 1000);
  return {
    filtros: { filtro, descartadas: verDescartadas, limite },
    conteo,
    cuantos: lista.length,
    alertas: lista.slice(0, limite).map(a => ({
      id: a.id,
      tipo: a.tipo,
      grupo: a.grupo,
      prioridad: a.prioridad,
      codigo: a.codigo,
      nombre: a.nombre,
      foto: a.foto ?? null,
      piezas: redondear(a.piezas),
      titulo: a.titulo,
      texto: a.texto,
      descartada: marcaDe(a),
    })),
  };
}
