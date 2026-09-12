import React, { useCallback, useState } from 'react';
import { api, type Estado } from '../api';
import { Aviso, Cargando, Foto, Icono, Opciones, Vacio, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';

export function MasVendidos({ estado }: { estado: Estado | null }) {
  const [dias, setDias] = useState(30);
  const [area, setArea] = useState('');
  const [cocina, setCocina] = useState(false);
  const { ir } = usarNavegacion();

  const traer = useCallback(() => api.masVendidos({ dias, area, cocina }), [dias, area, cocina]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [dias, area, cocina]);
  const productos = datos?.productos ?? [];

  return (
    <div className="space-y-4">
      <Opciones
        valor={dias}
        alElegir={setDias}
        opciones={[{ valor: 7, texto: 'Últimos 7 días' }, { valor: 30, texto: 'Últimos 30 días' }, { valor: 90, texto: 'Últimos 90 días' }]}
      />
      <div className="-mx-4 px-4">
        <Opciones
          valor={area}
          alElegir={setArea}
          opciones={[{ valor: '', texto: 'Toda la tienda' }, ...(estado?.areasVenta ?? []).map(a => ({ valor: a, texto: a }))]}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cocina} onChange={e => setCocina(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
        Ver comida hecha en la casa
      </label>

      {error && (
        <div className="space-y-2">
          <Aviso texto={error} />
          <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
        </div>
      )}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {!datos && cargando && !calculando && !error ? <Cargando /> : !productos.length && datos ? (
        <Vacio icono="trending_up" titulo="No hay ventas en este periodo" />
      ) : (
        <ol className="space-y-2">
          {productos.map((p, i) => (
            <li key={p.codigo}>
              <button
                type="button"
                onClick={() => ir(`/producto/${encodeURIComponent(p.codigo)}`)}
                className="tarjeta flex w-full items-center gap-3 p-3 text-left active:bg-surface-container-low"
              >
                <span className="w-6 shrink-0 text-center font-label text-sm text-on-surface-variant">{i + 1}</span>
                <Foto url={p.foto} nombre={p.nombre} tamano="h-11 w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-tight">{p.nombre}</span>
                  <span className="block font-label text-xs text-on-surface-variant">
                    {p.codigo}
                    {p.piezasEnTienda !== null && ` · quedan ${numero(p.piezasEnTienda)}`}
                  </span>
                  {/* "quedan 0" en algo que se vende a diario casi siempre es falso:
                      el anaquel se surtió sin registrarlo en la TC52. */}
                  {p.desfase > 0 && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-error">
                      <Icono nombre="warning" className="text-[14px]" />
                      Desfasado{p.desfaseEn && ` en ${p.desfaseEn}`}: {numero(p.desfase)} vendidas en 0
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block text-lg leading-none">{numero(p.piezas)}</strong>
                  <span className="etiqueta">vendidas</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
