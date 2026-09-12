import React, { useEffect, useRef, useState } from 'react';
import { api, type Producto } from '../api';
import { Cargando, Icono, Vacio, numero } from '../componentes/basicos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';

export function Buscar() {
  const [texto, setTexto] = useState('');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cuantos, setCuantos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const caja = useRef<HTMLInputElement>(null);

  useEffect(() => { caja.current?.focus(); }, []);

  useEffect(() => {
    if (texto.trim().length < 2) { setProductos([]); setCuantos(0); return undefined; }
    let vivo = true;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.buscar(texto.trim());
        if (!vivo) return;
        setProductos(r.productos ?? []);
        setCuantos(r.cuantos ?? 0);
      } finally {
        if (vivo) setCargando(false);
      }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [texto]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Icono nombre="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
        <input
          ref={caja}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Nombre o código del producto"
          aria-label="Buscar producto"
          inputMode="search"
          className="w-full rounded-full border border-outline-variant/70 bg-surface-container-lowest py-3 pl-11 pr-10 text-base outline-none focus:border-primary"
        />
        {texto && (
          <button type="button" onClick={() => setTexto('')} aria-label="Limpiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <Icono nombre="close" className="text-[20px]" />
          </button>
        )}
      </div>

      {texto.trim().length < 2 ? (
        <Vacio icono="search" titulo="Busca un producto" detalle="Escribe parte del nombre o el código de barras para ver dónde hay piezas." />
      ) : cargando && !productos.length ? (
        <Cargando />
      ) : !productos.length ? (
        <Vacio icono="search" titulo="No se encontró nada" detalle="Revisa cómo está escrito o prueba con el código." />
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">{numero(cuantos)} resultados</p>
          <div className="space-y-2">
            {productos.map(p => <TarjetaProducto key={p.codigo} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
