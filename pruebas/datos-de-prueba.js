// Datos de mentiras para las pruebas, calcados de casos REALES de la tienda
// (medidos el 2026-09-11). Las fechas se arman relativas a "hoy" para que las
// pruebas no caduquen.
export const AHORA = new Date(Date.UTC(2026, 8, 11, 14, 30, 0)); // 11-sep-2026 14:30 CDMX (viernes)

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
 *  126490  "ATARBUCKS" recién contado, se vende como 01264904          -> duplicado + nuevo
 *  012000809996 Pepsi Wild Cherry, nunca vendido, viejo               -> sin movimiento 90+
 *               y ADEMÁS marcado por el dueño en el Admin              -> descontinuado (overrides)
 *  111111111111 recién contado por primera vez, sin venta             -> nuevo
 *  222222222222 vendió hace 45 días                                    -> lento
 *  333333333333 vende a diario y casi no queda en Casita 1            -> activo + urgente + más vendido
 *  444444444444 no existe en NovaCaja                                  -> sin alta
 *  555555555555 contado en 0 en Casita 2 y se sigue vendiendo         -> desfasado
 *  666666666666 queso contado en Casita 1 (refrigerado en anaquel)    -> ubicación incorrecta + bajo stock
 *  888888888888 mermelada: 210 piezas y vende 1 cada 2 semanas        -> sobrestock crítico
 *  999000000000 pumpkin pie mix: 371 piezas, nunca vendido, 342 días  -> sin movimiento 180+ (estancado)
 *  0       ALIMENTOS LA CASITA (cocina, se vende y no está contado)
 */
export const INVENTARIO = [
  { codigo: '098733', ubicacion: 'Casita 2', cantidad: 506, ultima_entrada: haceDias(49), ultima_salida: null, creado: haceDias(77), nombre: 'Kinder Joy Stranger Things' },
  { codigo: '098733', ubicacion: 'Bodega', cantidad: 1, ultima_entrada: haceDias(74), ultima_salida: null, creado: haceDias(74), nombre: 'Kinder Joy Stranger Things' },
  { codigo: '126490', ubicacion: 'Casita 1', cantidad: 12, ultima_entrada: haceDias(10), ultima_salida: null, creado: haceDias(10), nombre: 'ATARBUCKS FRAPPUCCINO MOCHA 281ML' },
  { codigo: '012000809996', ubicacion: 'Bodega', cantidad: 313, ultima_entrada: haceDias(29), ultima_salida: haceDias(29), creado: haceDias(95), nombre: 'PEPSI WILD CHERRY' },
  { codigo: '012000809996', ubicacion: 'Casita 1', cantidad: 35, ultima_entrada: haceDias(29), ultima_salida: haceDias(29), creado: haceDias(93), nombre: 'PEPSI WILD CHERRY' },
  { codigo: '111111111111', ubicacion: 'Casita 1', cantidad: 24, ultima_entrada: haceDias(5), ultima_salida: null, creado: haceDias(5), nombre: 'GALLETA NUEVA' },
  { codigo: '222222222222', ubicacion: 'Casita 1', cantidad: 10, ultima_entrada: haceDias(60), ultima_salida: haceDias(45), creado: haceDias(200), nombre: 'TE DE MANZANILLA' },
  { codigo: '333333333333', ubicacion: 'Casita 1', cantidad: 3, ultima_entrada: haceDias(2), ultima_salida: haceDias(1), creado: haceDias(300), nombre: 'CHOCOLATE QUE VUELA' },
  { codigo: '333333333333', ubicacion: 'Bodega', cantidad: 40, ultima_entrada: haceDias(2), ultima_salida: haceDias(2), creado: haceDias(300), nombre: 'CHOCOLATE QUE VUELA' },
  { codigo: '444444444444', ubicacion: 'Casita 1', cantidad: 18, ultima_entrada: haceDias(40), ultima_salida: null, creado: haceDias(40), nombre: 'Salsa importada sin alta' },
  { codigo: '555555555555', ubicacion: 'Casita 2', cantidad: 0, ultima_entrada: haceDias(10), ultima_salida: haceDias(1), creado: haceDias(120), nombre: 'AGUA MINERAL' },
  { codigo: '666666666666', ubicacion: 'Casita 1', cantidad: 6, ultima_entrada: haceDias(3), ultima_salida: haceDias(1), creado: haceDias(150), nombre: 'QUESO MANCHEGO 200G' },
  { codigo: '888888888888', ubicacion: 'Bodega', cantidad: 200, ultima_entrada: haceDias(80), ultima_salida: haceDias(20), creado: haceDias(400), nombre: 'MERMELADA IMPORTADA' },
  { codigo: '888888888888', ubicacion: 'Casita 1', cantidad: 10, ultima_entrada: haceDias(20), ultima_salida: haceDias(8), creado: haceDias(400), nombre: 'MERMELADA IMPORTADA' },
  { codigo: '999000000000', ubicacion: 'Bodega', cantidad: 371, ultima_entrada: haceDias(342), ultima_salida: null, creado: haceDias(342), nombre: 'PUMPKIN PIE MIX' },
];

export const HISTORIAL = [
  { codigo: '00987339', ultima: haceDias(7), v120: 587 },
  { codigo: '01264904', ultima: haceDias(1), v120: 143 },
  { codigo: '222222222222', ultima: haceDias(45), v120: 3 },
  { codigo: '333333333333', ultima: haceDias(0), v120: 300 },
  { codigo: '555555555555', ultima: haceDias(2), v120: 60 },
  { codigo: '666666666666', ultima: haceDias(1), v120: 40 },
  { codigo: '888888888888', ultima: haceDias(8), v120: 8 },
  { codigo: '0', ultima: haceDias(0), v120: 12000 },
];

export const VENTAS_AREA = [
  { area: 'Casita 1', codigo: '333333333333', v7: 35, v14: 70, v30: 150 },
  { area: 'Casita 2', codigo: '555555555555', v7: 14, v14: 28, v30: 60 },
  { area: 'Casita 1', codigo: '0', v7: 900, v14: 1800, v30: 4041 },
  { area: 'Casita 1', codigo: '00987339', v7: 30, v14: 60, v30: 120 },
  { area: 'Casita 1', codigo: '666666666666', v7: 7, v14: 14, v30: 30 },
  { area: 'Casita 1', codigo: '888888888888', v7: 0, v14: 1, v30: 2 },
];

// Del lote de cada 30 min: ventas largas por área. El té (222…) vendió hace 45
// días: sale en 60/90, no en 30. El agua (555…) no vendió nada entre 90 y 180
// días atrás: su tendencia de 90 no se puede calcular (anterior = 0 -> null).
export const VENTAS_AREA_LARGO = [
  { area: 'Casita 1', codigo: '333333333333', v60: 250, v90: 420, v180: 600 },
  { area: 'Casita 2', codigo: '555555555555', v60: 100, v90: 170, v180: 170 },
  { area: 'Casita 1', codigo: '222222222222', v60: 3, v90: 3, v180: 3 },
  { area: 'Casita 1', codigo: '0', v60: 8000, v90: 12000, v180: 24000 },
  { area: 'Casita 1', codigo: '00987339', v60: 240, v90: 360, v180: 700 },
  { area: 'Casita 1', codigo: '666666666666', v60: 60, v90: 90, v180: 180 },
  { area: 'Casita 1', codigo: '888888888888', v60: 4, v90: 6, v180: 12 },
];

// Forma vieja (v1, solo v90): se conserva para probar que armarSnapshot la acepta.
export const VENTAS_AREA_90 = VENTAS_AREA_LARGO.map(({ area, codigo, v90 }) => ({ area, codigo, v90 }));

/**
 * Ventas por día de los últimos 21 días (del lote de cada 30 min), con el fin de
 * semana fuerte: el chocolate vende 3 entre semana y 12 sábado/domingo. El día
 * viene a veces como Date (así lo entrega mssql para una columna `date`) y a
 * veces como texto 'YYYY-MM-DD', para probar las dos formas.
 */
export const VENTAS_DIA = (() => {
  const filas = [];
  const p2 = n => String(n).padStart(2, '0');
  for (let atras = 0; atras < 21; atras++) {
    const dia = new Date(Date.UTC(AHORA.getUTCFullYear(), AHORA.getUTCMonth(), AHORA.getUTCDate() - atras));
    const texto = `${dia.getUTCFullYear()}-${p2(dia.getUTCMonth() + 1)}-${p2(dia.getUTCDate())}`;
    const finDeSemana = dia.getUTCDay() === 0 || dia.getUTCDay() === 6;
    filas.push({ area: 'Casita 1', dia, codigo: '333333333333', piezas: finDeSemana ? 12 : 3 });
    filas.push({ area: 'Casita 2', dia, codigo: '555555555555', piezas: finDeSemana ? 5 : 2 });
    filas.push({ area: 'Casita 1', dia, codigo: '00987339', piezas: 4 });
    filas.push({ area: 'Casita 1', dia: texto, codigo: '666666666666', piezas: 1 });
    filas.push({ area: 'Casita 1', dia: texto, codigo: '0', piezas: 100 });
  }
  return filas;
})();

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
  { codigo: '126490', art_codigo: '126490', descripcion: 'ATARBUCKS FRAPPUCCINO MOCHA 281ML', categoria: 'ABARROTES', marca: null },
  { codigo: '01264904', art_codigo: '01264904', descripcion: 'STARBUCKS FRAPUCCINO MOCHA 281ML', categoria: 'ABARROTES', marca: null },
  { codigo: '012000809996', art_codigo: '012000809996', descripcion: 'PEPSI WILD CHERRY', categoria: 'ABARROTES', marca: 'PEPSI' },
  { codigo: '111111111111', art_codigo: '111111111111', descripcion: 'GALLETA NUEVA', categoria: 'GALLETAS Y PAN DULCE', marca: null },
  { codigo: '222222222222', art_codigo: '222222222222', descripcion: 'TE DE MANZANILLA', categoria: 'TÉS E INFUSIONES SIN IVA', marca: null },
  { codigo: '333333333333', art_codigo: '333333333333', descripcion: 'CHOCOLATE QUE VUELA', categoria: 'CHOCOLATES', marca: null },
  { codigo: '555555555555', art_codigo: '555555555555', descripcion: 'AGUA MINERAL', categoria: 'ABARROTES CON IVA', marca: null },
  { codigo: '666666666666', art_codigo: '666666666666', descripcion: 'QUESO MANCHEGO 200G', categoria: 'QUESOS Y LACTEOS', marca: null },
  { codigo: '888888888888', art_codigo: '888888888888', descripcion: 'MERMELADA IMPORTADA', categoria: 'MERMELADAS Y MIELES CON IVA', marca: null },
  { codigo: '999000000000', art_codigo: '999000000000', descripcion: 'PUMPKIN PIE MIX', categoria: 'REPOSTERIA', marca: null },
  { codigo: '0', art_codigo: '0', descripcion: 'ALIMENTOS LA CASITA', categoria: 'ABARROTES', marca: null },
];

/**
 * TODA la vista VArticulosUnificados (solo para el buscador): lo mismo que el
 * catálogo más productos que no están contados ni se han vendido, como la
 * mostaza Dijon, que solo existe en la caja.
 */
export const CATALOGO_COMPLETO = [
  ...CATALOGO.map(({ art_codigo, descripcion, categoria, marca }) => ({ art_codigo, descripcion, categoria, marca })),
  { art_codigo: '777777777777', descripcion: 'MOSTAZA DIJON', categoria: 'ABARROTES', marca: 'MAILLE' },
];

/**
 * product_overrides del SQLite del admin (src/db/overrides.js):
 *  · la Pepsi la marcó el dueño como DESCONTINUADA hace 20 días (y tiene foto);
 *  · al té le puso una categoría propia (manda sobre la de NovaCaja).
 */
export const OVERRIDES = new Map([
  ['012000809996', {
    foto: 'https://cdn.shopify.com/s/files/1/0553/5626/0531/products/pepsi_wild_cherry.jpg',
    categoria: null,
    descontinuado: true,
    descontinuadoDesde: haceDias(20),
  }],
  ['222222222222', { foto: null, categoria: 'Tés', descontinuado: false, descontinuadoDesde: null }],
]);

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
    ventasAreaLargo: VENTAS_AREA_LARGO,
    ventasDia: VENTAS_DIA,
    desfases: DESFASES,
    catalogo: CATALOGO,
    catalogoCompleto: CATALOGO_COMPLETO,
    overrides: OVERRIDES,
    equivalencias: [],
    fotos: new Map(),
    ...extra,
  };
}
