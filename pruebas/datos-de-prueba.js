// Datos de mentiras para las pruebas, calcados de casos REALES de la tienda
// (medidos el 2026-09-11). Las fechas se arman relativas a "hoy" para que las
// pruebas no caduquen.
export const AHORA = new Date(Date.UTC(2026, 8, 11, 14, 30, 0)); // 11-sep-2026 14:30 CDMX

export const haceDias = dias => new Date(AHORA.getTime() - dias * 86_400_000);

export const AREAS = [
  { nombre: 'Bodega', color: '#1D9E75', activa: true, orden: 1 },
  { nombre: 'Casita 1', color: '#3B82F6', activa: true, orden: 2 },
  { nombre: 'Casita 2', color: '#8B5CF6', activa: true, orden: 3 },
  { nombre: 'Cocina', color: '#E07B39', activa: true, orden: 5 },
  { nombre: 'Bogeda', color: '#7e22ce', activa: false, orden: 7 }, // inactiva de verdad
];

export const MAPA_CAJAS = [
  { est_codigo: '17', area: 'Casita 1' },
  { est_codigo: '21', area: 'Casita 1' },
  { est_codigo: '7', area: 'Casita 2' },
];

/**
 * Un inventario chico con un caso de cada cosa:
 *  098733  Kinder Joy contado, nunca vendido, se vende como 00987339  -> duplicado
 *  012000809996 Pepsi Wild Cherry, nunca vendido, viejo               -> descontinuado
 *  111111111111 recién contado por primera vez, sin venta             -> nuevo
 *  222222222222 vendió hace 45 días                                    -> lento
 *  333333333333 vende a diario y casi no queda en Casita 1            -> activo + urgente
 *  444444444444 no existe en NovaCaja                                  -> sin alta
 *  0       ALIMENTOS LA CASITA (cocina, se vende y no está contado)
 */
export const INVENTARIO = [
  { codigo: '098733', ubicacion: 'Casita 2', cantidad: 506, ultima_entrada: haceDias(49), ultima_salida: null, creado: haceDias(77), nombre: 'Kinder Joy Stranger Things' },
  { codigo: '098733', ubicacion: 'Bodega', cantidad: 1, ultima_entrada: haceDias(74), ultima_salida: null, creado: haceDias(74), nombre: 'Kinder Joy Stranger Things' },
  { codigo: '012000809996', ubicacion: 'Bodega', cantidad: 313, ultima_entrada: haceDias(29), ultima_salida: haceDias(29), creado: haceDias(95), nombre: 'PEPSI WILD CHERRY' },
  { codigo: '012000809996', ubicacion: 'Casita 1', cantidad: 35, ultima_entrada: haceDias(29), ultima_salida: haceDias(29), creado: haceDias(93), nombre: 'PEPSI WILD CHERRY' },
  { codigo: '111111111111', ubicacion: 'Casita 1', cantidad: 24, ultima_entrada: haceDias(5), ultima_salida: null, creado: haceDias(5), nombre: 'GALLETA NUEVA' },
  { codigo: '222222222222', ubicacion: 'Casita 1', cantidad: 10, ultima_entrada: haceDias(60), ultima_salida: haceDias(45), creado: haceDias(200), nombre: 'TE DE MANZANILLA' },
  { codigo: '333333333333', ubicacion: 'Casita 1', cantidad: 3, ultima_entrada: haceDias(2), ultima_salida: haceDias(1), creado: haceDias(300), nombre: 'CHOCOLATE QUE VUELA' },
  { codigo: '333333333333', ubicacion: 'Bodega', cantidad: 40, ultima_entrada: haceDias(2), ultima_salida: haceDias(2), creado: haceDias(300), nombre: 'CHOCOLATE QUE VUELA' },
  { codigo: '444444444444', ubicacion: 'Casita 1', cantidad: 18, ultima_entrada: haceDias(40), ultima_salida: null, creado: haceDias(40), nombre: 'Salsa importada sin alta' },
  { codigo: '555555555555', ubicacion: 'Casita 2', cantidad: 0, ultima_entrada: haceDias(10), ultima_salida: haceDias(1), creado: haceDias(120), nombre: 'AGUA MINERAL' },
];

export const HISTORIAL = [
  { codigo: '00987339', ultima: haceDias(7), v120: 587 },
  { codigo: '01264904', ultima: haceDias(1), v120: 143 },
  { codigo: '222222222222', ultima: haceDias(45), v120: 3 },
  { codigo: '333333333333', ultima: haceDias(0), v120: 300 },
  { codigo: '555555555555', ultima: haceDias(2), v120: 60 },
  { codigo: '0', ultima: haceDias(0), v120: 12000 },
];

export const VENTAS_AREA = [
  { area: 'Casita 1', codigo: '333333333333', v7: 35, v14: 70, v30: 150 },
  { area: 'Casita 2', codigo: '555555555555', v7: 14, v14: 28, v30: 60 },
  { area: 'Casita 1', codigo: '0', v7: 900, v14: 1800, v30: 4041 },
  { area: 'Casita 1', codigo: '00987339', v7: 30, v14: 60, v30: 120 },
];

// Del lote de cada 30 min. El té (222…) vendió hace 45 días: sale en 90, no en 30.
export const VENTAS_AREA_90 = [
  { area: 'Casita 1', codigo: '333333333333', v90: 420 },
  { area: 'Casita 2', codigo: '555555555555', v90: 170 },
  { area: 'Casita 1', codigo: '222222222222', v90: 3 },
  { area: 'Casita 1', codigo: '0', v90: 12000 },
];

/**
 * Ventas registradas con la existencia en 0 (movimientos_bodega), como los
 * GHIRARDELLI de Casita 1 el 2026-09-12:
 *  555555555555 Agua en Casita 2: contado en 0 y se sigue vendiendo -> desfasado
 *  333333333333 Chocolate en Casita 1: tuvo ventas en cero pero HOY tiene 3 piezas
 *               (ya lo corrigieron) -> NO desfasado
 */
export const DESFASES = [
  { codigo: '555555555555', area: 'Casita 2', piezas: 20, desde: haceDias(9), ultima: haceDias(1) },
  { codigo: '333333333333', area: 'Casita 1', piezas: 5, desde: haceDias(20), ultima: haceDias(15) },
];

export const CATALOGO = [
  { codigo: '098733', art_codigo: '098733', descripcion: 'Kinder Joy Stranger Things', categoria: 'ABARROTES', marca: null },
  { codigo: '00987339', art_codigo: '00987339', descripcion: 'KINDER JOY ', categoria: 'ABARROTES', marca: null },
  { codigo: '01264904', art_codigo: '01264904', descripcion: 'STARBUCKS FRAPUCCINO MOCHA 281ML', categoria: 'ABARROTES', marca: null },
  { codigo: '012000809996', art_codigo: '012000809996', descripcion: 'PEPSI WILD CHERRY', categoria: 'ABARROTES', marca: 'PEPSI' },
  { codigo: '111111111111', art_codigo: '111111111111', descripcion: 'GALLETA NUEVA', categoria: 'GALLETAS Y PAN DULCE', marca: null },
  { codigo: '222222222222', art_codigo: '222222222222', descripcion: 'TE DE MANZANILLA', categoria: 'TÉS E INFUSIONES SIN IVA', marca: null },
  { codigo: '333333333333', art_codigo: '333333333333', descripcion: 'CHOCOLATE QUE VUELA', categoria: 'CHOCOLATES', marca: null },
  { codigo: '555555555555', art_codigo: '555555555555', descripcion: 'AGUA MINERAL', categoria: 'ABARROTES CON IVA', marca: null },
  { codigo: '0', art_codigo: '0', descripcion: 'ALIMENTOS LA CASITA', categoria: 'ABARROTES', marca: null },
];

export const RESERVAS = [
  { codigo: '333333333333', ubicacion: 'Bodega', apartado: 8 },
];

export const COCINA = {
  categorias: ['ESPECIALES LA CASITA', 'PASTELES Y POSTRES', 'CHAROLAS BAGUETTES Y CARNES', 'RESTAURANT', 'INSUMOS DE COCINA NO VENTA', 'TERRAZA'],
  codigos: ['0', '0505', '650082', '1000'],
  sufijos: [' LC'],
};

export const OPCIONES = {
  descontinuadoDias: 90, lentoDias: 30, nuevoDias: 30,
  coberturaUrgenteDias: 2, coberturaBajaDias: 7, diasSugeridos: 7,
  ventanaVentaDiariaDias: 14, duplicadosDias: 120,
  cocina: COCINA, areasRespaldo: ['Bodega'],
};

export function datosCompletos(extra = {}) {
  return {
    ahora: AHORA,
    areas: AREAS,
    mapaCajas: MAPA_CAJAS,
    inventario: INVENTARIO,
    reservas: RESERVAS,
    historial: HISTORIAL,
    ventasArea: VENTAS_AREA,
    ventasArea90: VENTAS_AREA_90,
    desfases: DESFASES,
    catalogo: CATALOGO,
    equivalencias: [],
    fotos: new Map(),
    ...extra,
  };
}
