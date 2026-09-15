import React from 'react';
import { Aviso, Cargando } from './basicos';

/**
 * Los tres estados que devuelve `usarDatos`, pintados igual en todas las
 * pantallas: error con botón de reintentar, "calculando" (el motor apenas está
 * armando la foto) y el spinner de la primera carga. Cuando ya hay datos se
 * pintan los hijos aunque haya una recarga en curso (así no parpadea).
 */
export function EstadoCarga({
  cargando, calculando, error, reintentar, hayDatos, children,
}: {
  cargando: boolean; calculando: boolean; error: string; reintentar: () => void;
  hayDatos: boolean; children: React.ReactNode;
}) {
  return (
    <>
      {error && (
        <div className="space-y-2">
          <Aviso texto={error} />
          <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
        </div>
      )}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}
      {!hayDatos && cargando && !calculando && !error && <Cargando />}
      {hayDatos && children}
    </>
  );
}

/** Encabezado de módulo: nombre grande y el subtítulo que pide la spec. */
export function Encabezado({ titulo, subtitulo, extra }: { titulo: string; subtitulo: string; extra?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="titulo text-2xl leading-tight">{titulo}</h2>
        <p className="text-sm text-on-surface-variant">{subtitulo}</p>
      </div>
      {extra}
    </header>
  );
}

/** Título de sección dentro de un módulo. */
export function TituloSeccion({ texto, detalle, derecha }: { texto: string; detalle?: string; derecha?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <div>
        <h3 className="titulo text-lg leading-tight">{texto}</h3>
        {detalle && <p className="text-xs text-on-surface-variant">{detalle}</p>}
      </div>
      {derecha}
    </div>
  );
}

/** Tarjeta chica con un número grande (los "KPIs" de arriba de cada módulo). */
export function Dato({
  titulo, valor, detalle, tono = 'normal', alTocar, activo = false,
}: {
  titulo: string; valor: string | number; detalle?: string;
  tono?: 'normal' | 'error' | 'aviso' | 'bien'; alTocar?: () => void; activo?: boolean;
}) {
  const colorValor = tono === 'error' ? 'text-error' : tono === 'aviso' ? 'text-secondary' : tono === 'bien' ? 'text-primary' : 'text-on-surface';
  const contenido = (
    <>
      <p className="etiqueta">{titulo}</p>
      <p className={`text-2xl font-bold leading-tight md:text-3xl ${colorValor}`}>{valor}</p>
      {detalle && <p className="text-xs text-on-surface-variant">{detalle}</p>}
    </>
  );
  if (alTocar) {
    return (
      <button
        type="button"
        onClick={alTocar}
        aria-pressed={activo}
        className={`tarjeta p-3 text-left active:bg-surface-container-low ${activo ? 'border-primary ring-1 ring-primary' : ''}`}
      >
        {contenido}
      </button>
    );
  }
  return <div className="tarjeta p-3">{contenido}</div>;
}
