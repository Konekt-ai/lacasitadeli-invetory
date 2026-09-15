import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Producto } from '../api';
import { Cargando, ErrorConReintento, Icono, Vacio, numero, usarConsulta, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';

type Resultado = { q: string; cuantos: number; deCatalogo: number; productos: Producto[] };

/**
 * Buscador: encuentra cualquier producto (contado, vendido o solo en el
 * catálogo de la caja). Lo que se busca vive en la URL (?q=…): el buscador del
 * encabezado manda aquí, y al volver atrás se conserva.
 */
export function Buscar() {
  const { ir } = usarNavegacion();
  const consulta = usarConsulta();
  const q = (consulta.get('q') ?? '').trim();
  const [texto, setTexto] = useState(q);
  const caja = useRef<HTMLInputElement>(null);

  useEffect(() => { caja.current?.focus(); }, []);

  // Si llegan con otra búsqueda desde el encabezado, el campo se pone al día
  // (sin comerse el espacio que la persona acaba de escribir).
  useEffect(() => { setTexto(t => (t.trim() === q ? t : q)); }, [q]);

  // Lo que se escribe pasa a la URL (sin historial) con una pausa para no
  // pedir por cada letra.
  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === q) return undefined;
    const t = setTimeout(() => ir(`/buscar${limpio ? `?q=${encodeURIComponent(limpio)}` : ''}`, { reemplazar: true }), 300);
    return () => clearTimeout(t);
  }, [texto, q, ir]);

  const corto = q.length < 2;
  const traer = useCallback(
    (): Promise<Resultado> => (corto ? Promise.resolve({ q, cuantos: 0, deCatalogo: 0, productos: [] }) : api.buscar(q)),
    [q, corto],
  );
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [q]);
  const productos = datos?.productos ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="titulo text-2xl leading-tight">Buscar</h2>
        <p className="text-sm text-on-surface-variant">Cualquier producto: contado, vendido o solo en el catálogo de la caja.</p>
      </div>

      <div className="relative">
        <label htmlFor="buscar-q" className="sr-only">Nombre o código del producto</label>
        <Icono nombre="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[22px] text-on-surface-variant" />
        <input
          id="buscar-q"
          ref={caja}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Nombre o código del producto"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          className="campo-buscar py-3 text-lg"
        />
        {texto && (
          <button
            type="button"
            onClick={() => setTexto('')}
            aria-label="Limpiar"
            className="absolute right-0 top-0 flex h-full w-12 items-center justify-center text-on-surface-variant"
          >
            <Icono nombre="close" className="text-[22px]" />
          </button>
        )}
      </div>

      {error && <ErrorConReintento texto={error} reintentar={reintentar} />}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {corto ? (
        <Vacio icono="search" titulo="Busca un producto" detalle="Escribe al menos 2 letras del nombre o el código de barras." />
      ) : cargando && !productos.length && !error ? (
        <Cargando />
      ) : datos && !productos.length ? (
        <Vacio icono="search" titulo="No se encontró nada" detalle="Revisa cómo está escrito o prueba con el código." />
      ) : datos && (
        <>
          <p className="flex items-center gap-2 text-sm text-on-surface-variant" aria-live="polite">
            <span>
              <strong className="text-on-surface">{numero(datos.cuantos)}</strong> resultados
              {datos.deCatalogo > 0 ? ` (${numero(datos.deCatalogo)} solo en catálogo)` : ''}
            </span>
            {cargando && <span className="h-3 w-3 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />}
          </p>
          <div className="rejilla">
            {productos.map(p => <TarjetaProducto key={p.codigo} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
