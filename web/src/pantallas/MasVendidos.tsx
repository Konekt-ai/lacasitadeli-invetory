import React, { useEffect, useState } from 'react';
import { api, type Estado } from '../api';
import { Cargando, Foto, Opciones, Vacio, numero, usarNavegacion } from '../componentes/basicos';

export function MasVendidos({ estado }: { estado: Estado | null }) {
  const [dias, setDias] = useState(30);
  const [area, setArea] = useState('');
  const [cocina, setCocina] = useState(false);
  const [productos, setProductos] = useState<Awaited<ReturnType<typeof api.masVendidos>>['productos']>([]);
  const [cargando, setCargando] = useState(true);
  const { ir } = usarNavegacion();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    api.masVendidos({ dias, area, cocina })
      .then(r => { if (vivo) setProductos(r.productos ?? []); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [dias, area, cocina]);

  return (
    <div className="space-y-4">
      <Opciones valor={dias} alElegir={setDias} opciones={[{ valor: 7, texto: 'Últimos 7 días' }, { valor: 30, texto: 'Últimos 30 días' }]} />
      <Opciones
        valor={area}
        alElegir={setArea}
        opciones={[{ valor: '', texto: 'Toda la tienda' }, ...(estado?.areasVenta ?? []).map(a => ({ valor: a, texto: a }))]}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cocina} onChange={e => setCocina(e.target.checked)} className="h-4 w-4 accent-[#012d1d]" />
        Ver comida hecha en la casa
      </label>

      {cargando && !productos.length ? <Cargando /> : !productos.length ? (
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
