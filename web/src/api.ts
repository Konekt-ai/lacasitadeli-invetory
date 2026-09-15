// Todo lo que la página le pide al servidor. Es el CONTRATO con el backend
// (docs/CONTRATO-v2.md, sección 4): si algo cambia aquí, cambia allá.
//
// Escrituras que existen (y ninguna más): entrar, salir, crear una solicitud de
// resurtido (la ejecuta bodega con la TC52) y descartar una alerta.

export type Area = { nombre: string; color: string };

/** Ids de las condiciones (badges). Un producto puede tener varias. */
export type Condicion =
  | 'sin_stock' | 'bajo_stock' | 'sobrestock' | 'mas_vendidos' | 'lento'
  | 'sin_movimiento_30' | 'sin_movimiento_60' | 'sin_movimiento_90' | 'sin_movimiento_180'
  | 'nuevo_sin_venta' | 'descontinuado' | 'duplicado_probable' | 'sin_alta' | 'desfasado';

export type Prioridad = 'alta' | 'media' | 'baja';

export type ProductoArea = {
  area: string;
  piezas: number | null;        // null = nunca contado ahí
  apartadas: number;
  ultimaEntrada: string | null;
  entradaTexto: string | null;
  vendidas14: number;
  cobertura: number | null;     // días; null si no se vende ahí o no está contado
  desfase: number;              // piezas vendidas ahí con el sistema en 0
};

/** El sistema dice 0 en un área y ahí se sigue vendiendo: hay que contarlo. */
export type Desfase = { piezas: number; areas: string[]; desdeTexto: string | null; texto: string };

export type Producto = {
  codigo: string;
  artCodigo: string | null;
  nombre: string;
  categoria: string;            // final ("Sin categoría" si no hay)
  subcategoria: string | null;
  categoriaFuente: 'admin' | 'shopify' | 'caja' | 'ninguna';
  marca: string | null;
  foto: string | null;
  alta: boolean;
  esCocina: boolean;
  descontinuado: boolean;
  descontinuadoDesde: string | null;
  piezas: number;
  apartadas: number;
  areas: ProductoArea[];
  clase: string;
  etiqueta: string;
  condiciones: Condicion[];
  prioridad: Prioridad;
  ventaDiaria: number;
  coberturaDias: number | null;
  rotacion: number;
  tendencia: { d7: number | null; d30: number | null; d90: number | null };
  ultimaVenta: string | null;
  diasSinVenta: number | null;
  diasSinMovimiento: number | null;
  tramoSinMovimiento: 0 | 30 | 60 | 90 | 180;
  ventaTexto: string;
  ultimaEntrada: string | null;
  entradaTexto: string | null;
  vendidas: { d7: number; d30: number; d90: number; d120: number; d14?: number; d60?: number; d180?: number };
  desfase: Desfase | null;
  duplicado: { codigo: string; nombre: string; piezas: number; texto: string } | null;
  enCatalogoSolo: boolean;      // solo existe en el catálogo de la caja (sin conteo ni ventas recientes)
};

export type Movimiento = {
  fecha: string; fechaTexto: string; tipo: string; motivo: string | null;
  cantidad: number; area: string; areaOrigen: string | null;
  stockAntes: number | null; stockDespues: number | null; texto: string;
};

export type Solicitud = {
  id: number; codigo_barras: string; nombre_mostrar: string;
  de_ubicacion: string; a_ubicacion: string; cantidad: number; cantidad_hecha: number | null;
  estado: 'pendiente' | 'hecha' | 'cancelada'; prioridad: number; origen: string; nota: string | null;
  solicitado_por: string | null; hecha_por: string | null; movimiento_id: number | null;
  stock_origen: number; stock_destino: number | null;
  creado: string; hecha_en: string | null; cancelada_en: string | null; motivo_cancelacion: string | null;
  eventos?: Array<{ id: number; fecha: string; tipo: string; de: string | null; a: string | null; usuario: string | null; detalle: string | null }>;
};

export type ProductoDetalle = Producto & {
  primeraVez: string | null;
  areasTodas: Array<{
    area: string; color: string; contado: boolean; piezas: number | null;
    apartadas: number; ultimaEntrada: string | null; entradaTexto: string | null; vendidas14: number;
    cobertura: number | null; desfase: number; desfaseDesde: string | null;
  }>;
  resurtido: Array<{
    area: string; estado: string; vendeAlDia: number; coberturaDias: number | null;
    sugerido: number; accion: string; accionNota: string | null; accionTipo: string;
  }>;
  movimientos: Movimiento[];
  solicitudes: Solicitud[];
};

export type Umbrales = {
  lentoDias: number; nuevoDias: number; coberturaUrgenteDias: number; coberturaBajaDias: number;
  diasSugeridos: number; ventanaVentaDiariaDias: number; sobrestockDias: number; sobrestockMin: number;
  topMasVendidos: number;
};

export type ResumenDia = {
  urgentes: number; piezasAMover: number; sinStock: number; bajoStock: number; sobrestock: number;
  sinMovimiento90: number; descontinuados: number; alertas: number;
};

export type CoberturaSucursal = { area: string; medianaDias: number | null; productosQueVenden: number; urgentes: number };

export type Estado = {
  listo: boolean; calculando: boolean; usuario: string | null;
  generado: string | null;   // ISO con -06:00 del momento en que se tomaron los datos
  actualizado: string | null;
  areas: Area[]; areasVenta: string[]; areasRespaldo: string[];
  resumen: { conPiezas: number; piezas: number; piezasParadas: number } | null;
  resumenDia: ResumenDia | null;
  coberturaSucursal: CoberturaSucursal[];
  categorias: Array<{ nombre: string; productos: number }>;
  capacidades: { solicitudes: boolean; fotos: boolean; overrides: boolean; shopify: boolean };
  umbrales: Umbrales;
};

export type OrdenInventario = 'piezas' | 'dias' | 'cobertura' | 'nombre' | 'rotacion' | 'venta';

export type FiltrosInventario = {
  area?: string; condiciones?: Condicion[]; prioridad?: Prioridad | ''; categoria?: string;
  orden?: OrdenInventario; q?: string; pagina?: number; porPagina?: number;
  soloConPiezas?: boolean; cocina?: boolean;
};

export type RespuestaInventario = {
  filtros: Record<string, unknown>;
  cuantos: number; piezas: number; pagina: number; porPagina: number; hayMas: boolean;
  productos: Producto[];
};

export type EstadoResurtido = 'urgente' | 'desfasado' | 'bajo' | 'ok' | 'sin_conteo';
export type AccionTipo = 'surtir' | 'surtir_parcial' | 'pedir' | 'revisar_respaldo' | 'contar' | 'ninguna';

export type FilaResurtido = {
  codigo: string; nombre: string; foto: string | null; categoria: string; area: string;
  estado: EstadoResurtido; prioridad: Prioridad;
  piezasArea: number | null; apartadas: number; vendeAlDia: number; vendidas14: number;
  coberturaDias: number | null; enBodega: number | null; sugerido: number;
  accion: string; accionNota: string | null; accionTipo: AccionTipo;
  esCocina: boolean; descontinuado: boolean;
  solicitud: { id: number; estado: string; cantidad: number; creado: string } | null;
};

export type FiltrosResurtir = {
  horizonte?: 'hoy' | '3' | '7'; condicion?: 'sin_stock' | 'bajo_stock' | ''; area?: string;
  categoria?: string; prioridad?: 'alta' | ''; cocina?: boolean; sinConteo?: boolean; q?: string; tope?: number;
};

export type RespuestaResurtir = {
  filtros: Record<string, unknown>; areasVenta: string[];
  tarjetas: {
    urgentes: number; piezasAMover: number; transferencias: number; sinRespaldo: number;
    sucursalMasUrgente: string | null; desfasados: number; sinConteo: number;
  };
  cuantos: number;
  filas: FilaResurtido[];
  historial: { pendientes: number; hechas: number; canceladas: number } | null;
};

export type Kpi = { piezas: number; anterior: number | null; cambio: number | null };

export type RespuestaMovimiento = {
  filtros: { dias: 7 | 30 | 90; area: string; incluirCocina: boolean };
  kpis: { d7: Kpi; d30: Kpi; d90: Kpi };
  top: Array<{ codigo: string; nombre: string; foto: string | null; categoria: string; piezas: number; piezasEnTienda: number | null; tendencia: number | null }>;
  categorias: Array<{ nombre: string; piezas: number; porcentaje: number }>;
  sucursales: Array<{ area: string; piezas: number; porcentaje: number }>;
  aceleran: Array<{ codigo: string; nombre: string; piezas: number; anterior: number; cambio: number }>;
  bajan: Array<{ codigo: string; nombre: string; piezas: number; anterior: number; cambio: number }>;
  calor: {
    dias: string[];
    categoriaDia: Array<{ nombre: string; valores: number[] }>;
    sucursalDia: Array<{ nombre: string; valores: number[] }>;
    fechas: Array<{ fecha: string; dia: string; piezas: number }>;
    nota: string | null;
  };
  ranking: Array<{ codigo: string; nombre: string; categoria: string; piezas: number; pzasDia: number; rotacion: number; diasSinMovimiento: number | null; piezasEnTienda: number | null }>;
};

export type GrupoAlerta = 'codigos' | 'caja' | 'catalogo' | 'inventario';
export type FiltroAlertas = 'todas' | 'urgentes' | GrupoAlerta;

export type Alerta = {
  id: string; tipo: string; grupo: GrupoAlerta; prioridad: Prioridad;
  codigo: string; nombre: string; foto: string | null; piezas: number;
  titulo: string; texto: string;
  descartada: { usuario: string; cuando: string } | null;
};

export type RespuestaAlertas = {
  conteo: { todas: number; urgentes: number; codigos: number; caja: number; catalogo: number; inventario: number; descartadas: number };
  alertas: Alerta[];
};

export type Sugerencia = {
  stock_origen: number; stock_destino: number | null; apartado_destino: number; disponible_destino: number | null;
  venta_diaria: number; cobertura_dias: number | null; sugerido: number; sugerido_sin_tope: number;
  ultima_venta: string | null; unidades_por_caja?: number;
};

export class SinSesion extends Error {}
/** El servidor todavía está armando la foto del inventario (503). */
export class Calculando extends Error {}
/** El admin ya tiene una solicitud pendiente igual (409). */
export class SolicitudDuplicada extends Error {
  existente: Solicitud | null;
  constructor(mensaje: string, existente: Solicitud | null) { super(mensaje); this.existente = existente; }
}

/** Aviso para que la App mande al login sin que cada pantalla tenga que saberlo. */
function avisarSinSesion() {
  try { window.dispatchEvent(new CustomEvent('invetory:sin-sesion')); } catch { /* nada */ }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  } catch {
    // Sin internet, el túnel caído o el celular en el elevador.
    throw new Error('No se pudo conectar. Revisa tu internet y vuelve a intentar.');
  }
  if (r.status === 401) { avisarSinSesion(); throw new SinSesion('Necesitas entrar'); }
  const cuerpo = await r.json().catch(() => ({}));
  // OJO: el 503 "calculando" NO se puede devolver como si fueran datos buenos.
  if (r.status === 503 && (cuerpo as any).calculando) throw new Calculando((cuerpo as any).mensaje || 'Estamos juntando la información del inventario.');
  if (r.status === 409) throw new SolicitudDuplicada((cuerpo as any).error || 'Ya hay una solicitud pendiente', (cuerpo as any).existente ?? null);
  if (!r.ok) throw new Error((cuerpo as any).error || 'No se pudo consultar');
  return cuerpo as T;
}

const q = (params: Record<string, string | number | boolean | string[] | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(',')); continue; }
    p.set(k, v === true ? '1' : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

const json = (cuerpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

export const api = {
  estado: (fresco = false) => pedir<Estado>(`/api/estado${q({ fresco })}`),

  entrar: async (usuario: string, contrasena: string) => {
    const r = await fetch('/api/login', { ...json({ usuario, contrasena }), credentials: 'same-origin' });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(cuerpo.error || 'No se pudo entrar');
    return cuerpo as { ok: true; usuario: string };
  },

  salir: () => fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }),

  // ── Inventario ──────────────────────────────────────────────────────────
  inventario: (f: FiltrosInventario) => pedir<RespuestaInventario>(`/api/inventario${q({
    area: f.area, condiciones: f.condiciones, prioridad: f.prioridad, categoria: f.categoria,
    orden: f.orden, q: f.q, pagina: f.pagina, porPagina: f.porPagina,
    soloConPiezas: f.soloConPiezas === false ? '0' : undefined,
    cocina: f.cocina,
  })}`),

  producto: (codigo: string) => pedir<{ producto: ProductoDetalle }>(`/api/producto/${encodeURIComponent(codigo)}`),

  buscar: (texto: string) => pedir<{ q: string; cuantos: number; deCatalogo: number; productos: Producto[] }>(`/api/buscar${q({ q: texto })}`),

  // ── Resurtir ────────────────────────────────────────────────────────────
  resurtir: (f: FiltrosResurtir) => pedir<RespuestaResurtir>(`/api/resurtir${q({
    horizonte: f.horizonte, condicion: f.condicion, area: f.area, categoria: f.categoria,
    prioridad: f.prioridad, cocina: f.cocina, sinConteo: f.sinConteo, q: f.q, tope: f.tope,
  })}`),

  // Solicitudes de resurtido: viven en el admin; esta app solo las crea y las lee.
  solicitudes: (f: { estado?: 'pendiente' | 'hecha' | 'cancelada' | 'todas'; codigo?: string; limit?: number }) =>
    pedir<{ solicitudes: Solicitud[]; conteo: { pendiente: number; hecha: number; cancelada: number } }>(`/api/solicitudes${q(f)}`),

  solicitud: (id: number) => pedir<Solicitud>(`/api/solicitudes/${id}`),

  ubicacionesSolicitud: () => pedir<{ todas: string[]; venta: string[]; respaldo: string[] }>('/api/solicitudes/ubicaciones'),

  sugerencia: (codigo: string, destino: string, origen = 'Bodega') =>
    pedir<Sugerencia>(`/api/solicitudes/sugerencia/${encodeURIComponent(codigo)}${q({ destino, origen })}`),

  /** La ÚNICA acción sobre el inventario: crea la tarea que ejecuta bodega con la TC52. */
  solicitarResurtido: (datos: { codigo_barras: string; a_ubicacion: string; de_ubicacion?: string; cantidad: number; nota?: string }) =>
    pedir<{ ok: true; id: number; solicitud: Solicitud; aviso: string | null }>('/api/solicitudes', json(datos)),

  // ── Movimiento ──────────────────────────────────────────────────────────
  movimiento: (f: { dias?: 7 | 30 | 90; area?: string; cocina?: boolean }) =>
    pedir<RespuestaMovimiento>(`/api/movimiento${q(f)}`),

  // ── Alertas ─────────────────────────────────────────────────────────────
  alertas: (f: { filtro?: FiltroAlertas; descartadas?: boolean }) =>
    pedir<RespuestaAlertas>(`/api/alertas${q(f)}`),

  descartarAlerta: (id: string, deshacer = false) =>
    pedir<{ ok: true; descartada: { usuario: string; cuando: string } | null }>(`/api/alertas/${encodeURIComponent(id)}/descartar`, json({ deshacer })),
};
