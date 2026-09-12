import React, { createContext, useContext } from 'react';
import type { Area } from '../api';

/** Navegación: un router chiquito, sin librerías. */
export const Navegacion = createContext<{ ruta: string; ir: (destino: string) => void }>({
  ruta: '/', ir: () => {},
});
export const usarNavegacion = () => useContext(Navegacion);

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

/** Chip de color del área (Casita 1 azul, Bodega verde…). */
export function ChipArea({ area, piezas, apartadas = 0 }: { area: string; piezas: number | null; apartadas?: number }) {
  const areas = usarAreas();
  const color = areas.find(a => a.nombre === area)?.color ?? '#717973';
  return (
    <span className="chip border" style={{ borderColor: `${color}55`, backgroundColor: `${color}14`, color: '#1c1c19' }}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {area}
      <strong className="font-bold">{piezas === null ? '—' : numero(piezas)}</strong>
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

/** Foto del producto (o su inicial si no hay). */
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

/** Botones en fila para elegir una opción (área, días, etc.). */
export function Opciones<T extends string | number>({
  valor, opciones, alElegir, className = '',
}: {
  valor: T;
  opciones: Array<{ valor: T; texto: string }>;
  alElegir: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 overflow-x-auto sin-barra ${className}`}>
      {opciones.map(o => (
        <button
          key={String(o.valor)}
          type="button"
          onClick={() => alElegir(o.valor)}
          aria-pressed={valor === o.valor}
          className={`chip shrink-0 border px-3 py-1.5 ${
            valor === o.valor
              ? 'border-primary bg-primary text-on-primary'
              : 'border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
