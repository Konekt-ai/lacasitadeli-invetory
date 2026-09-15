import { useCallback, useEffect, useState } from 'react';

/**
 * "Mi lista (en este teléfono)": lo que el dueño quiere ir a mover o revisar,
 * guardado SOLO en localStorage de este navegador. El servidor no la ve ni la
 * guarda: por eso la etiqueta dice siempre "(en este teléfono)", para que nadie
 * crea que el de bodega la va a recibir (para eso está "Solicitar resurtido").
 */
export const ETIQUETA_MI_LISTA = 'Mi lista (en este teléfono)';

export type ArticuloMiLista = {
  codigo: string;
  nombre: string;
  area: string;          // hacia dónde va (sucursal)
  piezas: number;        // cuántas mover (0 si la acción es contar/revisar)
  accion?: string;       // texto de la acción sugerida, para leerlo en la lista impresa
  palomeado: boolean;
  agregado: string;      // ISO local
};

const LLAVE = 'invetory.miLista.v2';
const CLASE_IMPRESION = 'mi-lista-imprimible';
const ID_ESTILO = 'mi-lista-estilos-impresion';

export const llaveDe = (codigo: string, area: string) => `${codigo}|${area}`;

export function leerMiLista(): ArticuloMiLista[] {
  try {
    const crudo = JSON.parse(localStorage.getItem(LLAVE) || '[]');
    if (!Array.isArray(crudo)) return [];
    return crudo
      .filter(a => a && typeof a.codigo === 'string' && typeof a.area === 'string')
      .map(a => ({
        codigo: String(a.codigo), nombre: String(a.nombre ?? a.codigo), area: String(a.area),
        piezas: Math.max(0, Math.floor(Number(a.piezas) || 0)),
        accion: a.accion ? String(a.accion) : undefined,
        palomeado: !!a.palomeado, agregado: String(a.agregado ?? new Date().toISOString()),
      }));
  } catch {
    return [];   // modo privado o JSON roto: se empieza de cero
  }
}

function guardar(lista: ArticuloMiLista[]) {
  try { localStorage.setItem(LLAVE, JSON.stringify(lista)); } catch { /* modo privado: solo vive en memoria */ }
}

/** Agrega (o actualiza las piezas si ya estaba) y devuelve la lista nueva. */
export function agregarAMiLista(lista: ArticuloMiLista[], art: Omit<ArticuloMiLista, 'palomeado' | 'agregado'>): ArticuloMiLista[] {
  const llave = llaveDe(art.codigo, art.area);
  const existe = lista.some(a => llaveDe(a.codigo, a.area) === llave);
  const nueva = existe
    ? lista.map(a => (llaveDe(a.codigo, a.area) === llave ? { ...a, ...art, palomeado: false } : a))
    : [...lista, { ...art, palomeado: false, agregado: new Date().toISOString() }];
  guardar(nueva);
  return nueva;
}

export function quitarDeMiLista(lista: ArticuloMiLista[], codigo: string, area: string): ArticuloMiLista[] {
  const nueva = lista.filter(a => llaveDe(a.codigo, a.area) !== llaveDe(codigo, area));
  guardar(nueva);
  return nueva;
}

export function palomearEnMiLista(lista: ArticuloMiLista[], codigo: string, area: string): ArticuloMiLista[] {
  const nueva = lista.map(a => (llaveDe(a.codigo, a.area) === llaveDe(codigo, area) ? { ...a, palomeado: !a.palomeado } : a));
  guardar(nueva);
  return nueva;
}

export function limpiarMiLista(): ArticuloMiLista[] {
  guardar([]);
  return [];
}

export const estaEnMiLista = (lista: ArticuloMiLista[], codigo: string, area: string) =>
  lista.find(a => llaveDe(a.codigo, a.area) === llaveDe(codigo, area));

/**
 * Reglas @media print que dejan visible SOLO la sección con `claseImpresion()`.
 * Se meten por CSSOM (insertRule) y no como texto de un <style>: la CSP de la
 * app es `style-src 'self'` y bloquearía un <style> inline con contenido.
 */
function asegurarEstilosImpresion() {
  if (typeof document === 'undefined' || document.getElementById(ID_ESTILO)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_ESTILO;
  document.head.appendChild(estilo);
  const hoja = estilo.sheet;
  if (!hoja) return;
  const reglas = [
    `@media print { body * { visibility: hidden !important; } }`,
    `@media print { .${CLASE_IMPRESION}, .${CLASE_IMPRESION} * { visibility: visible !important; } }`,
    `@media print { .${CLASE_IMPRESION} { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 1rem !important; border: 0 !important; box-shadow: none !important; } }`,
    `@media print { .${CLASE_IMPRESION} .no-imprimir { display: none !important; } }`,
    `@media print { .${CLASE_IMPRESION} .solo-impresion { display: block !important; } }`,
  ];
  for (const r of reglas) {
    try { hoja.insertRule(r, hoja.cssRules.length); } catch { /* navegador raro: se imprime la página entera */ }
  }
}

/** Clase que debe llevar el contenedor de la lista para que sea lo único que salga impreso. */
export const claseImpresion = () => CLASE_IMPRESION;

/** Abre el diálogo de imprimir con solo la lista visible. */
export function imprimirMiLista() {
  asegurarEstilosImpresion();
  try { window.print(); } catch { /* algún WebView sin impresión */ }
}

/** Hook con la lista viva: cambia en esta pestaña y también si otra pestaña la edita. */
export function usarMiLista() {
  const [lista, setLista] = useState<ArticuloMiLista[]>(leerMiLista);

  useEffect(() => {
    const alCambiar = (e: StorageEvent) => { if (e.key === LLAVE || e.key === null) setLista(leerMiLista()); };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);

  const agregar = useCallback((art: Omit<ArticuloMiLista, 'palomeado' | 'agregado'>) => setLista(l => agregarAMiLista(l, art)), []);
  const quitar = useCallback((codigo: string, area: string) => setLista(l => quitarDeMiLista(l, codigo, area)), []);
  const palomear = useCallback((codigo: string, area: string) => setLista(l => palomearEnMiLista(l, codigo, area)), []);
  const limpiar = useCallback(() => setLista(limpiarMiLista()), []);
  const tiene = useCallback((codigo: string, area: string) => !!estaEnMiLista(lista, codigo, area), [lista]);

  return { lista, agregar, quitar, palomear, limpiar, tiene, imprimir: imprimirMiLista };
}
