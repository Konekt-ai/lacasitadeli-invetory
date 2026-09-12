import React from 'react';
import type { Producto } from '../api';
import { ChipArea, Foto, Icono, numero, usarNavegacion } from './basicos';

const COLOR_CLASE: Record<string, string> = {
  descontinuado: 'bg-error-container text-on-error-container',
  lento: 'bg-secondary-fixed text-on-secondary-fixed',
  duplicado_probable: 'bg-primary-fixed text-on-primary-fixed',
  sin_alta: 'bg-surface-variant text-on-surface-variant',
  nuevo: 'bg-surface-container-high text-on-surface-variant',
  activo: 'bg-primary-fixed text-on-primary-fixed',
};

export function TarjetaProducto({ p, area }: { p: Producto; area?: string }) {
  const { ir } = usarNavegacion();
  const piezasArea = area ? p.areas.find(a => a.area === area)?.piezas ?? 0 : p.piezas;

  return (
    <button
      type="button"
      onClick={() => ir(`/producto/${encodeURIComponent(p.codigo)}`)}
      className="tarjeta w-full p-3 text-left active:bg-surface-container-low"
    >
      <div className="flex gap-3">
        <Foto url={p.foto} nombre={p.nombre} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 font-medium leading-tight">{p.nombre}</p>
            <span className="shrink-0 text-right">
              <strong className="text-lg leading-none">{numero(piezasArea)}</strong>
              <span className="etiqueta block">piezas</span>
            </span>
          </div>

          <p className="mt-0.5 font-label text-xs text-on-surface-variant">{p.codigo}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`chip ${COLOR_CLASE[p.clase] ?? 'bg-surface-variant'}`}>{p.etiqueta}</span>
            {p.areas.filter(a => (a.piezas ?? 0) > 0).map(a => (
              <ChipArea key={a.area} area={a.area} piezas={a.piezas} apartadas={a.apartadas} />
            ))}
          </div>

          <div className="mt-2 space-y-0.5 text-sm text-on-surface-variant">
            <p className="flex items-center gap-1">
              <Icono nombre="sell" className="text-[16px] opacity-70" />
              {p.ventaTexto}
            </p>
            {p.entradaTexto && (
              <p className="flex items-center gap-1">
                <Icono nombre="local_shipping" className="text-[16px] opacity-70" />
                {p.entradaTexto}
              </p>
            )}
          </div>

          {p.duplicado && (
            <p className="mt-2 rounded-lg bg-primary-fixed/60 px-2.5 py-1.5 text-sm text-on-primary-fixed">
              {p.duplicado.texto} <span className="opacity-80">({numero(p.duplicado.piezas)} piezas vendidas)</span>
            </p>
          )}

          {p.clase === 'sin_alta' && (
            <p className="mt-2 rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface-variant">
              La caja no conoce este código: no se puede cobrar bien.
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
