// Qué hay que resurtir en el anaquel.
//
// Idea: lo que se vende en Casita 1 y Casita 2 (según la CAJA del ticket) contra
// lo que la TC52 tiene contado ahí. Si alcanza para menos de unos días, hay que
// surtirlo de Bodega; si tampoco hay en Bodega, hay que pedirlo.
//
// Cuidado con el caso "no está contado": que NO exista la fila en inventario_bodega
// NO es lo mismo que cero. Sin fila no sabemos cuánto hay, así que no se puede
// decir "urgente": lo que toca es contarlo con la TC52. (Medido: en Casita 1 hay
// 845 productos que se venden y nunca se contaron ahí — casi todos comida hecha.)

export const ESTADOS = ['urgente', 'bajo', 'ok', 'sin_conteo'];

/**
 * @typedef {Object} EntradaResurtido
 * @property {string}      codigo
 * @property {string}      area              área de venta (p. ej. "Casita 1")
 * @property {number}      vendidasVentana   piezas vendidas ahí en la ventana (14 días)
 * @property {number|null} stock             piezas contadas ahí; null = nunca se contó
 * @property {number}      [apartado]        piezas apartadas por pedidos de la web
 * @property {Array<{area: string, stock: number|null, apartado?: number}>} [respaldos]
 *
 * @typedef {Object} OpcionesResurtido
 * @property {number} ventanaDias        14
 * @property {number} urgenteDias        2
 * @property {number} bajaDias           7
 * @property {number} diasSugeridos      7
 */

const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * @param {EntradaResurtido} e
 * @param {Partial<OpcionesResurtido>} [opciones]
 */
export function calcularResurtido(e, opciones = {}) {
  const {
    ventanaDias = 14, urgenteDias = 2, bajaDias = 7, diasSugeridos = 7,
  } = opciones;

  const ventaDiaria = ventanaDias > 0 ? n(e.vendidasVentana) / ventanaDias : 0;
  const seVende = ventaDiaria > 0;
  const contado = e.stock !== null && e.stock !== undefined;
  const disponible = contado ? n(e.stock) - n(e.apartado) : null;

  // Respaldo (Bodega): el que más tenga disponible.
  let respaldo = null;
  for (const r of e.respaldos ?? []) {
    const disp = r.stock === null || r.stock === undefined ? null : n(r.stock) - n(r.apartado);
    const cand = { area: r.area, disponible: disp };
    if (!respaldo) respaldo = cand;
    else if ((disp ?? -1) > (respaldo.disponible ?? -1)) respaldo = cand;
  }

  const coberturaDias = seVende && contado ? disponible / ventaDiaria : null;
  // Si NO está contado no se puede sugerir cuánto falta: tratar "sin fila" como
  // cero es justo lo que este módulo evita. Antes decía "faltan 35" en el mismo
  // renglón que "no está contado: cuéntalo con la TC52" — dos órdenes contrarias.
  const sugerido = seVende && contado
    ? Math.max(0, Math.ceil(ventaDiaria * diasSugeridos - Math.max(disponible, 0)))
    : 0;

  let estado = 'ok';
  if (!contado) estado = 'sin_conteo';
  else if (seVende && (disponible <= 0 || coberturaDias < urgenteDias)) estado = 'urgente';
  else if (seVende && coberturaDias < bajaDias) estado = 'bajo';

  return {
    estado,
    seVende,
    ventaDiaria: Math.round(ventaDiaria * 100) / 100,
    disponible,
    coberturaDias: coberturaDias === null ? null : Math.round(coberturaDias * 10) / 10,
    sugerido,
    accion: armarAccion({ estado, sugerido, respaldo, area: e.area }),
  };
}

function armarAccion({ estado, sugerido, respaldo, area }) {
  if (estado === 'sin_conteo') {
    return {
      tipo: 'contar',
      texto: `No está contado en ${area}: cuéntalo con la TC52`,
      nota: null,
      surtirDeRespaldo: 0,
    };
  }
  if (sugerido <= 0) return { tipo: 'ninguna', texto: 'Está bien surtido', nota: null, surtirDeRespaldo: 0 };

  const areaRespaldo = respaldo?.area ?? 'Bodega';
  const hay = respaldo?.disponible;

  // Sin fila en Bodega = nunca se contó ahí. La acción útil sigue siendo pedirlo,
  // pero se avisa aparte por si alguien quiere ir a ver al fondo.
  if (hay === null || hay === undefined) {
    return {
      tipo: 'revisar_respaldo',
      texto: 'Pedir al proveedor',
      nota: `${areaRespaldo} no lo tiene contado: vale la pena revisar ahí`,
      surtirDeRespaldo: 0,
    };
  }
  if (hay <= 0) {
    return { tipo: 'pedir', texto: 'Pedir al proveedor', nota: `No hay en ${areaRespaldo}`, surtirDeRespaldo: 0 };
  }
  const surtir = Math.min(sugerido, hay);
  if (surtir < sugerido) {
    return {
      tipo: 'surtir_parcial',
      texto: `Surte ${surtir} de ${areaRespaldo} (hay ${hay})`,
      nota: `Faltan ${sugerido - surtir}: pídelos al proveedor`,
      surtirDeRespaldo: surtir,
    };
  }
  return {
    tipo: 'surtir',
    texto: `Surte ${surtir} de ${areaRespaldo} (hay ${hay})`,
    nota: null,
    surtirDeRespaldo: surtir,
  };
}

/** Orden para la lista: primero lo más urgente y lo que más se vende. */
export function ordenarResurtido(filas) {
  const peso = { urgente: 0, bajo: 1, sin_conteo: 2, ok: 3 };
  return [...filas].sort((a, b) =>
    (peso[a.estado] - peso[b.estado]) ||
    (b.ventaDiaria - a.ventaDiaria) ||
    String(a.nombre ?? a.codigo).localeCompare(String(b.nombre ?? b.codigo), 'es'));
}
