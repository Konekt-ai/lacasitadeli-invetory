import React from 'react';
import type { Condicion, Prioridad } from '../api';

/**
 * Badges de condición (docs/CONTRATO-v2.md, sección 3). Siempre con el texto
 * completo: el color ayuda, pero nunca es lo único que dice qué pasa.
 */
export const ETIQUETAS_CONDICION: Record<Condicion, string> = {
  agotado: 'Agotado',
  sin_stock: 'Falta en anaquel',
  bajo_stock: 'Bajo stock',
  sobrestock: 'Sobrestock',
  mas_vendidos: 'Más vendido',
  lento: 'Lento',
  sin_movimiento_30: 'Sin movimiento 30+ días',
  sin_movimiento_60: 'Sin movimiento 60+ días',
  sin_movimiento_90: 'Sin movimiento 90+ días',
  sin_movimiento_180: 'Sin movimiento 180+ días',
  nuevo_sin_venta: 'Nuevo, sin venta',
  descontinuado: 'Descontinuado',
  duplicado_probable: 'Posible código duplicado',
  sin_alta: 'Sin alta en caja',
  desfasado: 'Desfasado: cuéntalo',
};

export const COLORES_CONDICION: Record<Condicion, string> = {
  agotado: 'bg-error text-on-error',
  sin_stock: 'bg-error text-on-error',
  bajo_stock: 'bg-secondary-fixed text-on-secondary-fixed',
  sobrestock: 'bg-[#ede9fe] text-[#4c1d95]',
  mas_vendidos: 'bg-primary-fixed text-on-primary-fixed',
  lento: 'bg-surface-variant text-on-surface-variant',
  sin_movimiento_30: 'bg-surface-variant text-on-surface-variant',
  sin_movimiento_60: 'bg-surface-variant text-on-surface-variant',
  sin_movimiento_90: 'bg-surface-variant text-on-surface-variant',
  sin_movimiento_180: 'bg-surface-variant text-on-surface-variant',
  nuevo_sin_venta: 'bg-[#dbeafe] text-[#1e3a8a]',
  descontinuado: 'bg-[#1c1c19] text-white',
  duplicado_probable: 'bg-[#ffedd5] text-[#9a3412]',
  sin_alta: 'border border-error text-error bg-transparent',
  desfasado: 'border border-error text-error bg-transparent',
};

export const ETIQUETAS_PRIORIDAD: Record<Prioridad, string> = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' };
export const COLORES_PRIORIDAD: Record<Prioridad, string> = {
  alta: 'bg-error-container text-on-error-container',
  media: 'bg-secondary-fixed text-on-secondary-fixed',
  baja: 'bg-surface-container text-on-surface-variant',
};

/** Orden en que se pintan los badges: primero lo que exige acción. */
const ORDEN: Condicion[] = [
  'descontinuado', 'agotado', 'sin_stock', 'desfasado', 'bajo_stock', 'sin_alta', 'duplicado_probable',
  'sobrestock', 'mas_vendidos', 'nuevo_sin_venta', 'lento',
  'sin_movimiento_180', 'sin_movimiento_90', 'sin_movimiento_60', 'sin_movimiento_30',
];

export function ordenarCondiciones(lista: Condicion[]): Condicion[] {
  return [...lista].sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b));
}

export function Badge({ condicion, grande = false, texto }: { condicion: Condicion; grande?: boolean; texto?: string }) {
  return (
    <span className={`chip ${grande ? 'px-3 py-1.5 text-sm' : ''} ${COLORES_CONDICION[condicion] ?? 'bg-surface-variant'}`}>
      {texto ?? ETIQUETAS_CONDICION[condicion] ?? condicion}
    </span>
  );
}

/**
 * Texto de los badges que dependen del producto: "Falta en Casita 1" en vez del
 * genérico "Falta en anaquel". Así el badge solo ya dice DÓNDE.
 */
export function etiquetasDe(p: { faltaEn?: string[] }): Partial<Record<Condicion, string>> {
  const falta = p.faltaEn ?? [];
  if (!falta.length) return {};
  return { sin_stock: `Falta en ${falta.join(' y ')}`, agotado: `Agotado (0 en ${falta.join(' y ')})` };
}

export function Badges({
  condiciones, max = 4, grande = false, etiquetas = {},
}: {
  condiciones: Condicion[]; max?: number; grande?: boolean; etiquetas?: Partial<Record<Condicion, string>>;
}) {
  const lista = ordenarCondiciones(condiciones);
  const visibles = lista.slice(0, max);
  const resto = lista.length - visibles.length;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {visibles.map(c => <Badge key={c} condicion={c} grande={grande} texto={etiquetas[c]} />)}
      {resto > 0 && <span className="chip bg-surface-container text-on-surface-variant">+{resto}</span>}
    </span>
  );
}

export function BadgePrioridad({ prioridad }: { prioridad: Prioridad }) {
  return <span className={`chip ${COLORES_PRIORIDAD[prioridad]}`}>{ETIQUETAS_PRIORIDAD[prioridad]}</span>;
}
