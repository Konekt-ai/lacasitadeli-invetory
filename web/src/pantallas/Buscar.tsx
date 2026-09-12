import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Aviso, Cargando, Icono, Vacio, numero } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';

export function Buscar() {
  const [texto, setTexto] = useState('');
  const caja = useRef<HTMLInputElement>(null);
  const corto = texto.trim().length < 2;

  useEffect(() => { caja.current?.focus(); }, []);

  const traer = useCallback(
    () => (corto ? Promise.resolve({ q: texto, cuantos: 0, productos: [] }) : api.buscar(texto.trim())),
    [texto, corto],
  );
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [texto], { retrasoMs: 300 });
  const productos = datos?.productos ?? [];

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
          className="w-full rounded-full border border-outline-variant/70 bg-surface-container-lowest py-3 pl-11 pr-12 text-base outline-none focus:border-primary"
        />
        {texto && (
          <button
            type="button"
            onClick={() => setTexto('')}
            aria-label="Limpiar"
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-on-surface-variant"
          >
            <Icono nombre="close" className="text-[20px]" />
          </button>
        )}
      </div>

      {error && (
        <div className="space-y-2">
          <Aviso texto={error} />
          <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
        </div>
      )}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {corto ? (
        <Vacio icono="search" titulo="Busca un producto" detalle="Escribe parte del nombre o el código de barras para ver dónde hay piezas." />
      ) : cargando && !productos.length && !error ? (
        <Cargando />
      ) : !productos.length && datos ? (
        <Vacio icono="search" titulo="No se encontró nada" detalle="Revisa cómo está escrito o prueba con el código." />
      ) : (
        <>
          <p className="text-sm text-on-surface-variant">{numero(datos?.cuantos ?? 0)} resultados</p>
          <div className="space-y-2">
            {productos.map(p => <TarjetaProducto key={p.codigo} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
