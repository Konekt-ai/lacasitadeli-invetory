import React from 'react';
import type { Producto } from '../api';
import { BadgePrioridad, Badges } from './Badge';
import { ChipArea, Foto, Icono, decimal, fechaCorta, numero, textoHace, usarAreas, usarNavegacion } from './basicos';

/**
 * Tarjeta de producto (Inventario y Buscar): foto, nombre, código, categoría,
 * piezas por área con los chips de color ("—" donde no está contado), total de
 * piezas en grande, pzas/día, última venta, última entrada, rotación, badges de
 * condición (máximo 4) y prioridad. Toda la tarjeta abre la ficha.
 *
 * Con `area` el número grande es el de esa área (la lista está filtrada por ella).
 */
export function TarjetaProducto({ p, area, nota }: { p: Producto; area?: string; nota?: React.ReactNode }) {
  const { ir } = usarNavegacion();
  const areasTienda = usarAreas();

  // Chips: todas las áreas de la tienda en su orden y, si el producto trae
  // alguna que no esté en la lista (p. ej. "Sin área"), también.
  const nombres = areasTienda.map(a => a.nombre);
  for (const a of p.areas) if (!nombres.includes(a.area)) nombres.push(a.area);
  const enArea = area ? p.areas.find(a => a.area === area) : undefined;
  const piezasGrandes = area ? (enArea?.piezas ?? null) : p.piezas;

  return (
    <button
      type="button"
      onClick={() => ir(`/producto/${encodeURIComponent(p.codigo)}`)}
      className={`tarjeta toque w-full p-3 text-left active:bg-surface-container-low ${p.descontinuado ? 'border-on-surface/50' : ''}`}
    >
      <span className="flex gap-3">
        <Foto url={p.foto} nombre={p.nombre} tamano="h-20 w-20" />
        <span className="block min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 font-medium leading-tight">{p.nombre}</span>
            <span className="shrink-0 text-right">
              <span className="numero-grande block">{piezasGrandes === null ? '—' : numero(piezasGrandes)}</span>
              <span className="etiqueta block">{area ? `en ${area}` : 'piezas'}</span>
            </span>
          </span>
          <span className="mt-0.5 block font-label text-xs text-on-surface-variant">
            {p.codigo} · {p.categoria}{p.esCocina ? ' · Cocina' : ''}
          </span>
        </span>
      </span>

      {p.enCatalogoSolo ? (
        <span className="mt-2 flex items-center gap-1.5 rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface-variant">
          <Icono nombre="info" className="text-[16px]" />
          En catálogo de caja, sin existencia contada
        </span>
      ) : (
        <>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {nombres.map(n => {
              const a = p.areas.find(x => x.area === n);
              return <ChipArea key={n} area={n} piezas={a?.piezas ?? null} apartadas={a?.apartadas ?? 0} />;
            })}
          </span>
          <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-on-surface-variant">
            <Linea icono="speed" texto={`${decimal(p.ventaDiaria, 1)} pzas/día`} />
            <Linea icono="sell" texto={`Última venta: ${textoHace(p.diasSinVenta)}`} />
            <Linea icono="local_shipping" texto={`Última entrada: ${p.ultimaEntrada ? fechaCorta(p.ultimaEntrada) : '—'}`} />
            <Linea icono="autorenew" texto={`Rotación ${decimal(p.rotacion, 2)}`} />
          </span>
        </>
      )}

      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badges condiciones={p.condiciones} max={4} />
        <BadgePrioridad prioridad={p.prioridad} />
      </span>

      {p.descontinuado && (
        <span className="mt-2 block text-sm font-medium text-on-surface">
          Descontinuado{p.descontinuadoDesde ? ` desde el ${fechaCorta(p.descontinuadoDesde)}` : ''} (lo marcó el Admin)
        </span>
      )}

      {p.duplicado && (
        <span className="mt-2 block rounded-lg bg-[#ffedd5] px-2.5 py-1.5 text-sm text-[#9a3412]">
          {p.duplicado.texto} <span className="opacity-80">({numero(p.duplicado.piezas)} piezas vendidas)</span>
        </span>
      )}

      {!p.alta && !p.enCatalogoSolo && (
        <span className="mt-2 block rounded-lg bg-surface-container px-2.5 py-1.5 text-sm text-on-surface-variant">
          La caja no conoce este código: no se puede cobrar bien.
        </span>
      )}

      {nota}
    </button>
  );
}

function Linea({ icono, texto }: { icono: string; texto: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Icono nombre={icono} className="shrink-0 text-[16px] opacity-70" />
      <span className="truncate">{texto}</span>
    </span>
  );
}
