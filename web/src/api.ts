// Todo lo que la página le pide al servidor. Solo GET (y el entrar/salir).
export type Area = { nombre: string; color: string };

export type ProductoArea = {
  area: string; piezas: number | null; apartadas: number;
  ultimaEntrada: string | null; entradaTexto: string | null;
  desfase: number;  // piezas vendidas ahí con el sistema en 0
};

/** El sistema dice 0 en un área y ahí se sigue vendiendo: hay que contarlo. */
export type Desfase = { piezas: number; areas: string[]; desdeTexto: string | null; texto: string };

export type Producto = {
  codigo: string; nombre: string; categoria: string | null; marca: string | null;
  foto: string | null; alta: boolean; esCocina: boolean;
  piezas: number; apartadas: number; areas: ProductoArea[];
  clase: string; etiqueta: string;
  ultimaVenta: string | null; diasSinVenta: number | null; ventaTexto: string;
  ultimaEntrada: string | null; entradaTexto: string | null;
  vendidas: { d7: number; d30: number; d90: number; d120: number; d14?: number };
  desfase: Desfase | null;
  duplicado: { codigo: string; nombre: string; piezas: number; texto: string } | null;
  areasTodas?: Array<{
    area: string; color: string; contado: boolean; piezas: number | null;
    apartadas: number; ultimaEntrada: string | null; entradaTexto: string | null; vendidas14: number;
    desfase: number; desfaseDesde: string | null;
  }>;
  resurtido?: Array<{
    area: string; estado: string; vendeAlDia: number; coberturaDias: number | null;
    sugerido: number; accion: string; accionNota: string | null;
  }>;
};

export type Estado = {
  listo: boolean; calculando: boolean; usuario: string | null;
  generado: string | null;   // ISO con -06:00 del momento en que se tomaron los datos
  actualizado: string | null; areas: Area[]; areasVenta: string[]; areasRespaldo: string[];
  resumen: { conPiezas: number; piezas: number; piezasParadas: number } | null;
  umbrales: { descontinuadoDias: number; lentoDias: number; nuevoDias: number; diasSugeridos: number; ventanaVentaDiariaDias: number };
};

export type Tarjeta = { clase: string; titulo: string; detalle: string; productos: number; piezas: number; oculto?: boolean };

export type FilaResurtido = {
  codigo: string; nombre: string; foto: string | null; area: string; estado: string;
  piezasArea: number | null; apartadas: number; vendeAlDia: number; vendidas14: number;
  coberturaDias: number | null; sugerido: number;
  accion: string; accionNota: string | null; accionTipo: string;
  enRespaldo: Array<{ area: string; piezas: number | null }>; esCocina: boolean;
};

export class SinSesion extends Error {}
/** El servidor todavía está armando la foto del inventario (503). */
export class Calculando extends Error {}

/** Aviso para que la App mande al login sin que cada pantalla tenga que saberlo. */
function avisarSinSesion() {
  try { window.dispatchEvent(new CustomEvent('invetory:sin-sesion')); } catch { /* nada */ }
}

async function pedir<T>(ruta: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  } catch {
    // Sin internet, el túnel caído o el celular en el elevador.
    throw new Error('No se pudo conectar. Revisa tu internet y vuelve a intentar.');
  }
  if (r.status === 401) { avisarSinSesion(); throw new SinSesion('Necesitas entrar'); }
  const cuerpo = await r.json().catch(() => ({}));
  // OJO: el 503 NO se puede devolver como si fueran datos buenos. Antes se
  // regresaba {listo:false,...} sin las listas y la pantalla de resurtido tronaba
  // al leer datos.urgentes.length.
  if (r.status === 503) throw new Calculando((cuerpo as any).mensaje || 'Estamos juntando la información del inventario.');
  if (!r.ok) throw new Error((cuerpo as any).error || 'No se pudo consultar');
  return cuerpo as T;
}

const q = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === false) continue;
    p.set(k, v === true ? '1' : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  estado: (fresco = false) => pedir<Estado>(`/api/estado${q({ fresco })}`),

  entrar: async (usuario: string, contrasena: string) => {
    const r = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(cuerpo.error || 'No se pudo entrar');
    return cuerpo as { ok: true; usuario: string };
  },

  salir: () => fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }),

  sinVenta: (f: { clase?: string; area?: string; dias?: number; buscar?: string; orden?: string; pagina?: number }) =>
    pedir<{
      tarjetas: Tarjeta[]; cuantos: number; piezas: number; pagina: number; hayMas: boolean;
      productos: Producto[];
    }>(`/api/sin-venta${q(f)}`),

  resurtido: (f: { area?: string; cocina?: boolean; sinConteo?: boolean; buscar?: string }) =>
    pedir<{
      cuentas: { urgentes: number; desfasados: number; bajos: number; sinConteo: number };
      areasVenta: string[]; tope: number;
      urgentes: FilaResurtido[]; desfasados: FilaResurtido[]; bajos: FilaResurtido[]; sinConteo: FilaResurtido[];
    }>(`/api/resurtido${q(f)}`),

  masVendidos: (f: { dias?: number; area?: string; cocina?: boolean }) =>
    pedir<{
      cuantos: number; areasVenta: string[];
      productos: Array<{
        codigo: string; nombre: string; foto: string | null; piezas: number; clase: string;
        piezasEnTienda: number | null; esCocina: boolean; desfase: number; desfaseEn: string | null;
      }>;
    }>(`/api/mas-vendidos${q(f)}`),

  buscar: (texto: string) => pedir<{ q: string; cuantos: number; productos: Producto[] }>(`/api/buscar${q({ q: texto })}`),

  producto: (codigo: string) => pedir<{ producto: Producto }>(`/api/producto/${encodeURIComponent(codigo)}`),
};
