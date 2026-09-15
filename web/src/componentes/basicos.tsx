import React, { createContext, useContext, useMemo } from 'react';
import type { Area } from '../api';

/**
 * Navegación: un router chiquito, sin librerías. `ruta` trae la ruta CON la
 * consulta (p. ej. "/inventario?area=Casita%201"): así los filtros viven en la
 * URL y al volver atrás desde una ficha se conservan. `ir(destino, {reemplazar})`
 * no agrega historial cuando solo cambió un filtro.
 */
export const Navegacion = createContext<{
  ruta: string;
  ir: (destino: string, opciones?: { reemplazar?: boolean }) => void;
}>({ ruta: '/', ir: () => {} });
export const usarNavegacion = () => useContext(Navegacion);

/** Solo la parte antes del "?" de una ruta. */
export const rutaSinConsulta = (ruta: string) => ruta.split('?')[0];

/** Los parámetros (?q=…&area=…) de la ruta actual, ya decodificados. */
export function usarConsulta(): URLSearchParams {
  const { ruta } = usarNavegacion();
  const i = ruta.indexOf('?');
  const texto = i >= 0 ? ruta.slice(i + 1) : '';
  return useMemo(() => new URLSearchParams(texto), [texto]);
}

/** Colores de las áreas, como en el sistema de bodega. */
export const Areas = createContext<Area[]>([]);
export const usarAreas = () => useContext(Areas);

export function Icono({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {nombre}
    </span>
  );
}

export const numero = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('es-MX');

/** "5.4", "0.6": números con decimales fijos. */
export const decimal = (n: number | null | undefined, decimales = 1) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** "hace 143 días" / "hoy" / "ayer" / "nunca" a partir de los días que pasaron. */
export function textoHace(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return 'nunca';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${numero(dias)} días`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "22 ago" / "22 ago 14:30" (y con año si no es el de hoy) desde una fecha ISO.
 * Se lee del texto, sin convertir zonas: el servidor ya manda la hora de la
 * tienda (CDMX), sea con "-06:00" o como fecha "naive" con partes UTC. Así una
 * fecha "2026-08-22" nunca se convierte en "21 ago" por la zona del celular.
 */
export function fechaCorta(iso: string | null | undefined, opciones: { hora?: boolean } = {}): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const anio = Number(m[1]);
  const dia = Number(m[3]);
  const mes = MESES[Number(m[2]) - 1] ?? m[2];
  let texto = `${dia} ${mes}`;
  if (anio !== new Date().getFullYear()) texto += ` ${anio}`;
  if (opciones.hora && m[4]) texto += ` ${m[4]}:${m[5]}`;
  return texto;
}

/** Chip de color del área (Casita 1 azul, Bodega verde…). "—" cuando no está contado ahí. */
export function ChipArea({ area, piezas, apartadas = 0 }: { area: string; piezas: number | null; apartadas?: number }) {
  const areas = usarAreas();
  const color = areas.find(a => a.nombre === area)?.color ?? '#717973';
  const sinContar = piezas === null;
  return (
    <span
      className={`chip border ${sinContar ? 'opacity-60' : ''}`}
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14`, color: '#1c1c19' }}
      title={sinContar ? `${area}: no está contado aquí` : `${area}: ${numero(piezas)} piezas`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {area}
      <strong className="font-bold tabular-nums">{sinContar ? '—' : numero(piezas)}</strong>
      {apartadas > 0 && <span className="text-on-surface-variant">({numero(apartadas)} apartadas)</span>}
    </span>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

export function Vacio({ icono = 'inventory_2', titulo, detalle }: { icono?: string; titulo: string; detalle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-on-surface-variant">
      <Icono nombre={icono} className="text-4xl opacity-50" />
      <p className="font-medium text-on-surface">{titulo}</p>
      {detalle && <p className="max-w-xs text-sm">{detalle}</p>}
    </div>
  );
}

export function Aviso({ texto, tono = 'error' }: { texto: string; tono?: 'error' | 'aviso' }) {
  const estilos = tono === 'error'
    ? 'bg-error-container text-on-error-container'
    : 'bg-secondary-fixed text-on-secondary-fixed';
  return (
    <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${estilos}`}>
      <Icono nombre="warning" className="text-[18px]" />
      <span>{texto}</span>
    </div>
  );
}

/** Foto del producto (o un ícono si no hay). */
export function Foto({ url, nombre, tamano = 'h-16 w-16' }: { url: string | null; nombre: string; tamano?: string }) {
  if (!url) {
    return (
      <div className={`${tamano} flex shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant`}>
        <Icono nombre="inventory_2" className="text-[20px] opacity-60" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={nombre}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`${tamano} shrink-0 rounded-lg border border-outline-variant/50 bg-white object-contain`}
    />
  );
}

/** Botones en fila para elegir UNA opción (área, días, etc.). */
export function Opciones<T extends string | number>({
  valor, opciones, alElegir, className = '', etiqueta,
}: {
  valor: T;
  opciones: Array<{ valor: T; texto: string }>;
  alElegir: (v: T) => void;
  className?: string;
  /** Nombre del grupo para lectores de pantalla. */
  etiqueta?: string;
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto sin-barra ${className}`} role="group" aria-label={etiqueta}>
      {opciones.map(o => (
        <button
          key={String(o.valor)}
          type="button"
          onClick={() => alElegir(o.valor)}
          aria-pressed={valor === o.valor}
          className={`chip-boton ${valor === o.valor ? 'chip-presionado' : ''}`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/**
 * Chips para elegir VARIAS opciones a la vez (las condiciones del inventario).
 * Cada chip puede traer su propio color para cuando está presionado (el del badge).
 */
export function SelectorMultiple<T extends string>({
  valores, opciones, alCambiar, className = '', etiqueta,
}: {
  valores: T[];
  opciones: Array<{ valor: T; texto: string; colorActivo?: string }>;
  alCambiar: (v: T[]) => void;
  className?: string;
  etiqueta?: string;
}) {
  const alternar = (v: T) => alCambiar(valores.includes(v) ? valores.filter(x => x !== v) : [...valores, v]);
  return (
    <div className={`flex gap-2 overflow-x-auto sin-barra ${className}`} role="group" aria-label={etiqueta}>
      {opciones.map(o => {
        const activo = valores.includes(o.valor);
        const clase = !activo ? '' : o.colorActivo ? `border-transparent ${o.colorActivo}` : 'chip-presionado';
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => alternar(o.valor)}
            aria-pressed={activo}
            className={`chip-boton ${clase}`}
          >
            {activo && <Icono nombre="check" className="text-[16px]" />}
            {o.texto}
          </button>
        );
      })}
      {valores.length > 0 && (
        <button type="button" onClick={() => alCambiar([])} className="chip-boton">
          <Icono nombre="close" className="text-[16px]" />
          Quitar
        </button>
      )}
    </div>
  );
}

/** Interruptor de sí/no ("ver cocina", "incluir contados en 0"). */
export function Interruptor({ activo, alCambiar, texto }: { activo: boolean; alCambiar: (v: boolean) => void; texto: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => alCambiar(!activo)}
      className="toque inline-flex items-center gap-2 rounded-full px-1 text-sm text-on-surface"
    >
      <span className={`relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors ${activo ? 'bg-primary' : 'bg-outline-variant'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : ''}`} />
      </span>
      {texto}
    </button>
  );
}

/** Lista desplegable con la misma pinta que los chips. */
export function Selector<T extends string>({
  valor, opciones, alElegir, etiqueta, etiquetaOculta = false, id, className = '',
}: {
  valor: T;
  opciones: Array<{ valor: T; texto: string }>;
  alElegir: (v: T) => void;
  etiqueta: string;
  /** La etiqueta queda solo para lectores de pantalla (cuando no hay lugar). */
  etiquetaOculta?: boolean;
  id: string;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-on-surface-variant ${className}`} htmlFor={id}>
      <span className={etiquetaOculta ? 'sr-only' : 'shrink-0'}>{etiqueta}</span>
      <select id={id} value={valor} onChange={e => alElegir(e.target.value as T)} className="seleccion min-w-0 flex-1">
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}

/**
 * Tarjeta de resumen ("Urgentes 12"): número grande y título. Si tiene `alTocar`
 * es un botón que aplica un filtro y se ve presionada cuando ese filtro está activo.
 */
export function TarjetaResumen({
  titulo, valor, detalle, activa = false, alTocar, tono = 'normal', icono,
}: {
  titulo: string;
  valor: number | string;
  detalle?: string;
  activa?: boolean;
  alTocar?: () => void;
  tono?: 'normal' | 'alerta' | 'aviso' | 'negro';
  icono?: string;
}) {
  const colorNumero = {
    normal: 'text-primary',
    alerta: 'text-error',
    aviso: 'text-secondary',
    negro: 'text-on-surface',
  }[tono];
  const contenido = (
    <>
      <span className={`numero-grande block ${activa ? 'text-on-primary' : colorNumero}`}>
        {typeof valor === 'number' ? numero(valor) : valor}
      </span>
      <span className={`mt-1 flex items-center gap-1 text-sm font-medium leading-tight ${activa ? 'text-on-primary' : 'text-on-surface'}`}>
        {icono && <Icono nombre={icono} className="text-[16px] opacity-80" />}
        {titulo}
      </span>
      {detalle && <span className={`mt-0.5 block text-xs leading-tight ${activa ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>{detalle}</span>}
    </>
  );
  const clases = `toque w-full rounded-xl border p-3 text-left transition-colors ${
    activa ? 'border-primary bg-primary' : 'border-outline-variant/60 bg-surface-container-lowest'
  }`;
  if (!alTocar) return <div className={clases}>{contenido}</div>;
  return (
    <button type="button" onClick={alTocar} aria-pressed={activa} className={`${clases} active:bg-surface-container-low`}>
      {contenido}
    </button>
  );
}

/** Un dato con su título ("Cobertura · 5.4 días") para la ficha. */
export function Dato({
  titulo, valor, detalle, tono = 'normal',
}: {
  titulo: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: 'normal' | 'alerta' | 'bien';
}) {
  const color = { normal: 'text-on-surface', alerta: 'text-error', bien: 'text-primary' }[tono];
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <p className="etiqueta">{titulo}</p>
      <p className={`mt-1 text-xl font-bold leading-tight tabular-nums lg:text-2xl ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-on-surface-variant">{detalle}</p>}
    </div>
  );
}

/** "↑ 12 %" / "↓ 5 %" / "—" para las tendencias (null = no hay con qué comparar). */
export function Tendencia({ valor, className = '' }: { valor: number | null | undefined; className?: string }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return <span className={`text-on-surface-variant ${className}`} title="Sin periodo anterior con qué comparar">—</span>;
  }
  const sube = valor > 0;
  const igual = valor === 0;
  const color = igual ? 'text-on-surface-variant' : sube ? 'text-primary' : 'text-error';
  const icono = igual ? 'trending_flat' : sube ? 'trending_up' : 'trending_down';
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${color} ${className}`}>
      <Icono nombre={icono} className="text-[18px]" />
      {sube ? '+' : ''}{decimal(valor, Math.abs(valor) >= 100 ? 0 : 1)} %
    </span>
  );
}

/** Bloque con título en mayúsculas chiquitas. */
export function Seccion({ titulo, children, accion, className = '' }: {
  titulo: string; children: React.ReactNode; accion?: React.ReactNode; className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="etiqueta">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Botón "Volver" que regresa a la pantalla anterior (o al inicio si no hay). */
export function Volver({ texto = 'Volver' }: { texto?: string }) {
  const { ir } = usarNavegacion();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? window.history.back() : ir('/'))}
      className="toque inline-flex items-center gap-1 text-sm text-on-surface-variant"
    >
      <Icono nombre="arrow_back" className="text-[18px]" />
      {texto}
    </button>
  );
}

/** Aviso con botón para volver a intentar (error de red o del servidor). */
export function ErrorConReintento({ texto, reintentar }: { texto: string; reintentar: () => void }) {
  return (
    <div className="space-y-2">
      <Aviso texto={texto} />
      <button type="button" onClick={reintentar} className="boton-suave toque w-full py-3">Volver a intentar</button>
    </div>
  );
}
