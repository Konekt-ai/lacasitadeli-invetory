import React, { useCallback, useEffect, useState } from 'react';
import { SinSesion, api, type Alerta, type Estado, type FiltroAlertas, type GrupoAlerta } from '../api';
import { BadgePrioridad } from '../componentes/Badge';
import { Foto, Opciones, Vacio, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { Encabezado, EstadoCarga } from '../componentes/EstadoCarga';
import { fechaTexto } from '../componentes/formato';

/**
 * Módulo Alertas: incidencias explicadas en lenguaje sencillo. Solo dos
 * acciones, y las dos son reales: "Ver producto" (abre la ficha) y "Descartar"
 * (se guarda en el SQLite propio con quién y cuándo; se puede deshacer).
 */
const GRUPOS: Record<GrupoAlerta, string> = { codigos: 'Códigos', caja: 'Caja', catalogo: 'Catálogo', inventario: 'Inventario' };
const POR_TANDA = 60;

type Descartada = { usuario: string; cuando: string } | null;

export function Alertas({ estado }: { estado: Estado | null }) {
  const [filtro, setFiltro] = useState<FiltroAlertas>('todas');
  const [verDescartadas, setVerDescartadas] = useState(false);
  const { ir } = usarNavegacion();

  const traer = useCallback(() => api.alertas({ filtro, descartadas: verDescartadas }), [filtro, verDescartadas]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [filtro, verDescartadas]);

  // Lo que se descartó/deshizo en esta visita, para que la tarjeta cambie al
  // instante sin volver a pedir toda la lista.
  const [locales, setLocales] = useState<Record<string, Descartada>>({});
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cuantas, setCuantas] = useState(POR_TANDA);
  useEffect(() => { setCuantas(POR_TANDA); }, [datos]);

  const cambiar = async (a: Alerta, deshacer: boolean) => {
    setOcupadas(o => ({ ...o, [a.id]: true }));
    setErrores(e => ({ ...e, [a.id]: '' }));
    try {
      const r = await api.descartarAlerta(a.id, deshacer);
      // Si el servidor no regresa quién/cuándo, se pone el usuario de la sesión y "ahora mismo".
      const valor: Descartada = deshacer ? null : (r.descartada ?? { usuario: estado?.usuario ?? 'tú', cuando: '' });
      setLocales(l => ({ ...l, [a.id]: valor }));
    } catch (e: unknown) {
      if (e instanceof SinSesion) return;
      setErrores(er => ({ ...er, [a.id]: (e as Error)?.message || 'No se pudo guardar. Intenta otra vez.' }));
    } finally {
      setOcupadas(o => ({ ...o, [a.id]: false }));
    }
  };

  const conteo = datos?.conteo;
  const con = (texto: string, n: number | undefined) => (n === undefined ? texto : `${texto} (${numero(n)})`);
  const alertas = datos?.alertas ?? [];
  const visibles = alertas.slice(0, cuantas);

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Alertas"
        subtitulo="Cosas que hay que revisar, explicadas en sencillo"
        extra={conteo && (
          <div className="flex items-baseline gap-3">
            <span className="text-right">
              <strong className="block text-3xl leading-none">{numero(conteo.todas)}</strong>
              <span className="etiqueta">activas</span>
            </span>
            <span className="text-right">
              <strong className={`block text-3xl leading-none ${conteo.urgentes > 0 ? 'text-error' : ''}`}>{numero(conteo.urgentes)}</strong>
              <span className="etiqueta">urgentes</span>
            </span>
          </div>
        )}
      />

      <div className="space-y-2">
        <Opciones
          valor={filtro}
          alElegir={setFiltro}
          opciones={[
            { valor: 'todas', texto: con('Todas', conteo?.todas) },
            { valor: 'urgentes', texto: con('Urgentes', conteo?.urgentes) },
            { valor: 'codigos', texto: con('Códigos', conteo?.codigos) },
            { valor: 'caja', texto: con('Caja', conteo?.caja) },
            { valor: 'catalogo', texto: con('Catálogo', conteo?.catalogo) },
            { valor: 'inventario', texto: con('Inventario', conteo?.inventario) },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={verDescartadas} onChange={e => setVerDescartadas(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
          Ver descartadas{conteo ? ` (${numero(conteo.descartadas)})` : ''}
        </label>
      </div>

      <EstadoCarga cargando={cargando} calculando={calculando} error={error} reintentar={reintentar} hayDatos={!!datos}>
        {!alertas.length ? (
          <Vacio icono="warning" titulo="Sin alertas aquí" detalle={verDescartadas ? 'No hay alertas descartadas con este filtro.' : 'Nada que revisar con este filtro. Cambia de grupo o activa "Ver descartadas".'} />
        ) : (
          <>
            <p className="text-sm text-on-surface-variant">
              {datos && datos.cuantos > alertas.length
                ? `Se muestran las ${numero(alertas.length)} más importantes de ${numero(datos.cuantos)}. Filtra por grupo para ver las demás.`
                : `${numero(alertas.length)} ${alertas.length === 1 ? 'alerta' : 'alertas'}`}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visibles.map(a => (
                <TarjetaAlerta
                  key={a.id}
                  a={a}
                  descartada={a.id in locales ? locales[a.id] : a.descartada}
                  ocupada={!!ocupadas[a.id]}
                  error={errores[a.id] ?? ''}
                  verProducto={() => ir(`/producto/${encodeURIComponent(a.codigo)}`)}
                  descartar={() => cambiar(a, false)}
                  deshacer={() => cambiar(a, true)}
                />
              ))}
            </div>
            {alertas.length > cuantas && (
              <button type="button" onClick={() => setCuantas(c => c + POR_TANDA)} className="boton-suave w-full py-3">
                Ver más ({numero(alertas.length - cuantas)} faltan)
              </button>
            )}
          </>
        )}
      </EstadoCarga>
    </div>
  );
}

function TarjetaAlerta({
  a, descartada, ocupada, error, verProducto, descartar, deshacer,
}: {
  a: Alerta; descartada: Descartada; ocupada: boolean; error: string;
  verProducto: () => void; descartar: () => void; deshacer: () => void;
}) {
  const apagada = !!descartada;
  return (
    <article className={`tarjeta flex flex-col gap-3 p-4 ${apagada ? 'bg-surface-container-low opacity-70' : ''}`} aria-label={a.titulo}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-base font-bold leading-tight">{a.titulo}</h3>
        <BadgePrioridad prioridad={a.prioridad} />
      </div>
      <p className="etiqueta -mt-2">{GRUPOS[a.grupo] ?? a.grupo}</p>

      <button type="button" onClick={verProducto} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-2 text-left active:bg-surface-container">
        <Foto url={a.foto} nombre={a.nombre} tamano="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium leading-tight">{a.nombre}</span>
          <span className="block font-label text-xs text-on-surface-variant">{a.codigo}</span>
        </span>
        <span className="shrink-0 text-right">
          <strong className="block text-xl leading-none">{numero(a.piezas)}</strong>
          <span className="etiqueta">piezas</span>
        </span>
      </button>

      <p className="flex-1 text-sm leading-snug">{a.texto}</p>

      {descartada && (
        <p className="text-xs text-on-surface-variant">
          Descartada por <strong>{descartada.usuario}</strong>{descartada.cuando ? ` · ${fechaTexto(descartada.cuando)}` : ' · ahora mismo'}
        </p>
      )}
      {error && <p className="text-sm text-error">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={verProducto} className="boton-suave py-2.5">Ver producto</button>
        {descartada
          ? <button type="button" onClick={deshacer} disabled={ocupada} className="boton-lleno py-2.5">{ocupada ? 'Un momento…' : 'Deshacer'}</button>
          : <button type="button" onClick={descartar} disabled={ocupada} className="boton-suave py-2.5">{ocupada ? 'Un momento…' : 'Descartar'}</button>}
      </div>
    </article>
  );
}
