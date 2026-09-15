// Alertas: incidencias técnicas/operativas explicadas en lenguaje sencillo
// (sección 6 del contrato v2). Una alerta por tipo y producto; id = "tipo:codigo".
//
// Todo es texto de OPERACIÓN (contar, dar de alta, revisar dónde está): aquí no
// entra ni una palabra de dinero. Las acciones reales las pone el frontend ("Ver
// producto" y "Descartar"); esta capa solo dice qué pasa y qué conviene hacer.
//
// Función pura sobre el snapshot ya armado (armar.js): usa `condiciones`,
// `categoria`, `porArea`, `tramoSinMovimiento`, etc. de cada producto.

import { diasEntre, fechaCorta } from './fechas.js';
import { normalizar, parecido } from './texto.js';

export const GRUPOS_ALERTA = ['codigos', 'caja', 'catalogo', 'inventario'];

export const TIPOS_ALERTA = {
  duplicado: { grupo: 'codigos', titulo: 'Posible código duplicado' },
  sin_alta: { grupo: 'caja', titulo: 'No está dado de alta en caja' },
  sin_categoria: { grupo: 'catalogo', titulo: 'Producto sin categoría' },
  ubicacion_incorrecta: { grupo: 'inventario', titulo: 'Posible ubicación incorrecta' },
  entradas_sin_ventas: { grupo: 'inventario', titulo: 'Entradas sin ventas' },
  sobrestock_critico: { grupo: 'inventario', titulo: 'Sobrestock crítico' },
  estancado: { grupo: 'inventario', titulo: 'Estancado demasiado tiempo' },
  desfasado: { grupo: 'inventario', titulo: 'Inventario desfasado' },
  nombre_inconsistente: { grupo: 'catalogo', titulo: 'Nombre inconsistente' },
};

export const OPCIONES_ALERTAS = {
  sinMovimientoAlertaDias: 180,   // "estancado" a partir de este tramo
  entradasSinVentaDias: 30,       // llegó hace ≥ N días y no ha vendido nada desde entonces
  sobrestockCriticoDias: 180,     // sobrestock con cobertura de más de N días
  sinAltaUrgentePiezas: 10,       // sin alta con ≥ N piezas = prioridad alta
  parecidoNombreMin: 0.3,         // caja vs página: menos que esto es "nombre inconsistente"
  refrigerado: {
    categorias: ['QUESOS Y LACTEOS', 'CARNES', 'LACTEOS', 'CONGELADOS'],
    palabras: ['REFRIGERAD', 'FROZEN', 'CONGELAD'],
    areasSospechosas: ['Bodega', 'Casita 1', 'Casita 2'],
  },
};

const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const redondear = v => Math.round(num(v) * 100) / 100;

function mezclarOpciones(opciones = {}) {
  return {
    ...OPCIONES_ALERTAS,
    ...opciones,
    refrigerado: { ...OPCIONES_ALERTAS.refrigerado, ...(opciones.refrigerado ?? {}) },
  };
}

/** ¿Parece producto refrigerado? Por categoría de la caja o por palabras del nombre/tipo. */
export function pareceRefrigerado(p, refrigerado = OPCIONES_ALERTAS.refrigerado) {
  const categorias = new Set((refrigerado.categorias ?? []).map(c => normalizar(c)));
  const categoriaCaja = normalizar(p.categoriaCaja);
  if (categoriaCaja && categorias.has(categoriaCaja)) return true;
  const texto = `${normalizar(p.nombre)} ${normalizar(p.tipoShopify)} ${normalizar(p.categoriaPropia)}`;
  for (const palabra of refrigerado.palabras ?? []) {
    const w = normalizar(palabra);
    if (w && texto.includes(w)) return true;
  }
  return false;
}

/**
 * Alertas de UN producto (lista, puede ser vacía). Se usa desde calcularAlertas y
 * también sirve para probar cada regla por separado.
 * @param {object} p        producto del snapshot
 * @param {object} [opciones] OPCIONES_ALERTAS + {ahora}
 */
export function alertasDeProducto(p, opciones = {}) {
  const o = mezclarOpciones(opciones);
  const ahora = o.ahora;
  const c = new Set(p.condiciones ?? []);
  const piezas = num(p.piezas);
  const lista = [];
  const agregar = (tipo, prioridad, texto) => {
    lista.push({
      id: `${tipo}:${p.codigo}`,
      tipo,
      grupo: TIPOS_ALERTA[tipo].grupo,
      prioridad,
      codigo: p.codigo,
      nombre: p.nombre,
      foto: p.foto ?? null,
      piezas: redondear(piezas),
      titulo: TIPOS_ALERTA[tipo].titulo,
      texto,
    });
  };

  // Códigos: nunca vendido con su código pero hay otro casi igual que sí vende.
  if (c.has('duplicado_probable') && p.duplicado) {
    agregar('duplicado', 'alta',
      `Se vende como ${p.duplicado.codigo} ${p.duplicado.nombre}. Revisa si son el mismo producto y corrige el código en la TC52.`);
  }

  // Caja: contado con la TC52 pero NovaCaja no conoce el código. Sin piezas no
  // estorba a nadie (no hay nada que cobrar mal).
  if (c.has('sin_alta') && piezas > 0) {
    agregar('sin_alta', piezas >= o.sinAltaUrgentePiezas ? 'alta' : 'media',
      `Hay ${redondear(piezas)} piezas contadas, pero la caja no conoce este código: no se puede cobrar bien. Dalo de alta en NovaCaja (Admin → Inventario → Dar de alta).`);
  }

  // Catálogo: sin categoría útil (ABARROTES no cuenta). Lo "sin alta" ya tiene su
  // alerta y ni siquiera tiene categoría de caja: no se le suma esta.
  if (p.alta && !p.esCocina && piezas > 0 && p.categoria === 'Sin categoría') {
    agregar('sin_categoria', 'baja',
      'Sin categoría no entra en los análisis por categoría. Asígnale una en el Admin.');
  }

  // Inventario: producto refrigerado contado en un área que no es el refrigerador.
  if (piezas > 0 && pareceRefrigerado(p, o.refrigerado)) {
    const sospechosas = new Set(o.refrigerado.areasSospechosas ?? []);
    const donde = [];
    for (const a of p.porArea instanceof Map ? p.porArea.values() : []) {
      if (sospechosas.has(a.area) && num(a.cantidad) > 0) donde.push(a.area);
    }
    if (donde.length) {
      agregar('ubicacion_incorrecta', 'media',
        `Parece producto refrigerado y está contado en ${donde.join(' y ')}. Verifica dónde está físicamente.`);
    }
  }

  // Inventario: llegó hace rato y desde entonces no se ha vendido ni una.
  if (piezas > 0 && p.ultimaEntrada) {
    const hace = diasEntre(p.ultimaEntrada, ahora);
    const sinVentaDesde = !p.ultimaVenta || p.ultimaVenta.getTime() <= p.ultimaEntrada.getTime();
    if (hace !== null && hace >= o.entradasSinVentaDias && sinVentaDesde) {
      agregar('entradas_sin_ventas', 'media',
        `Llegó el ${fechaCorta(p.ultimaEntrada, ahora)} y no se ha vendido ni una pieza. ¿Está exhibido? ¿Se vende con otro código?`);
    }
  }

  // Inventario: hay de más para más de medio año.
  if (c.has('sobrestock') && p.coberturaTiendaDias !== null && p.coberturaTiendaDias !== undefined
      && p.coberturaTiendaDias > o.sobrestockCriticoDias) {
    agregar('sobrestock_critico', 'media',
      'Con lo que se vende, este stock alcanza para más de 6 meses. Conviene no comprar más.');
  }

  // Inventario: estancado, y el dueño todavía no lo marca como descontinuado.
  if (piezas > 0 && !p.descontinuado && num(p.tramoSinMovimiento) >= o.sinMovimientoAlertaDias) {
    agregar('estancado', 'baja',
      `Sin movimiento en ${o.sinMovimientoAlertaDias}+ días. Decidan si se descontinúa (se marca en el Admin) o se promociona.`);
  }

  // Inventario: el sistema dice 0 en un área y ahí se sigue vendiendo.
  if (c.has('desfasado') && p.desfase && num(p.desfase.piezas) > 0) {
    const donde = (p.desfase.areas ?? []).join(' y ');
    const desde = p.desfase.desde ? ` desde el ${fechaCorta(p.desfase.desde, ahora)}` : '';
    agregar('desfasado', 'alta',
      `En ${donde} el sistema dice 0, pero se han vendido ${redondear(p.desfase.piezas)} piezas${desde}. Hay que contarlo con la TC52.`);
  }

  // Catálogo: el nombre de la caja y el título de la página no se parecen en nada.
  // Solo cuando SÍ hay título de Shopify; si no viene, no se inventa nada.
  if (p.alta && p.tituloShopify && p.nombre) {
    const sim = parecido(normalizar(p.nombre), normalizar(p.tituloShopify));
    if (sim < o.parecidoNombreMin) {
      agregar('nombre_inconsistente', 'baja',
        `En caja dice ${p.nombre} y en la página dice ${p.tituloShopify}. Revisa que sea el mismo producto.`);
    }
  }

  return lista;
}

/**
 * Todas las alertas del snapshot, ordenadas: primero las urgentes (prioridad alta),
 * luego por piezas y por código para que el orden sea siempre el mismo.
 * @param {{productos: object[], ahora?: Date}} snap
 * @param {object} [opciones]
 */
export function calcularAlertas(snap, opciones = {}) {
  const o = { ...opciones, ahora: opciones.ahora ?? snap?.ahora };
  const todas = [];
  for (const p of snap?.productos ?? []) {
    for (const a of alertasDeProducto(p, o)) todas.push(a);
  }
  todas.sort((a, b) => (PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad])
    || (b.piezas - a.piezas)
    || a.codigo.localeCompare(b.codigo)
    || a.tipo.localeCompare(b.tipo));
  return todas;
}

/** Conteo para el encabezado del módulo (sin las descartadas: eso lo pone la ruta). */
export function contarAlertas(alertas) {
  const conteo = { todas: 0, urgentes: 0, codigos: 0, caja: 0, catalogo: 0, inventario: 0 };
  for (const a of alertas ?? []) {
    conteo.todas += 1;
    if (a.prioridad === 'alta') conteo.urgentes += 1;
    if (conteo[a.grupo] !== undefined) conteo[a.grupo] += 1;
  }
  return conteo;
}
