import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Estado, type Producto, type ResumenDia } from '../api';
import {
  Cargando, ErrorConReintento, TarjetaResumen, Vacio, decimal, numero, rutaSinConsulta, usarConsulta, usarNavegacion,
} from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';
import { Filtros, consultaDesdeFiltros, filtrosDesdeConsulta, type ValoresFiltros } from '../componentes/Filtros';

const POR_PAGINA = 60;
/** Tope de tarjetas pintadas: con miles de productos, dejar crecer la lista sin freno acaba con el celular. */
const TOPE_PINTADAS = 600;

type Tarjeta = {
  id: keyof ResumenDia;
  titulo: string;
  detalle: (e: Estado | null) => string;
  tono: 'normal' | 'alerta' | 'aviso' | 'negro';
  /** Filtro que aplica al tocarla (prioridad + condiciones se ponen juntos, lo demás se conserva). */
  filtro?: Pick<ValoresFiltros, 'prioridad' | 'condiciones'>;
  /** O a qué módulo manda (piezas a mover → Resurtir, alertas → Alertas). */
  ruta?: string;
};

const TARJETAS: Tarjeta[] = [
  { id: 'urgentes', titulo: 'Urgentes', detalle: () => 'prioridad alta', tono: 'alerta', filtro: { prioridad: 'alta', condiciones: [] } },
  { id: 'piezasAMover', titulo: 'Piezas a mover', detalle: () => 'de Bodega al anaquel · ver Resurtir', tono: 'normal', ruta: '/resurtir' },
  { id: 'sinStock', titulo: 'Sin stock', detalle: () => 'se vende y hay 0', tono: 'alerta', filtro: { prioridad: '', condiciones: ['sin_stock'] } },
  { id: 'bajoStock', titulo: 'Bajo stock', detalle: e => `menos de ${e?.umbrales?.coberturaBajaDias ?? 7} días`, tono: 'aviso', filtro: { prioridad: '', condiciones: ['bajo_stock'] } },
  { id: 'sobrestock', titulo: 'Sobrestock', detalle: e => `más de ${e?.umbrales?.sobrestockDias ?? 120} días`, tono: 'normal', filtro: { prioridad: '', condiciones: ['sobrestock'] } },
  { id: 'sinMovimiento90', titulo: 'Sin movimiento 90+', detalle: () => 'días sin venta', tono: 'normal', filtro: { prioridad: '', condiciones: ['sin_movimiento_90'] } },
  { id: 'descontinuados', titulo: 'Descontinuados', detalle: () => 'marcados en el Admin', tono: 'negro', filtro: { prioridad: '', condiciones: ['descontinuado'] } },
  { id: 'alertas', titulo: 'Alertas', detalle: () => 'ver el módulo de alertas', tono: 'aviso', ruta: '/alertas' },
];

const mismoFiltro = (f: ValoresFiltros, t: Tarjeta) =>
  !!t.filtro && f.prioridad === t.filtro.prioridad && f.condiciones.join(',') === t.filtro.condiciones.join(',');

/** Pantalla de inicio: resumen del día, cobertura por sucursal, filtros y la lista completa. */
export function Inventario({ estado }: { estado: Estado | null }) {
  const { ruta, ir } = usarNavegacion();
  const consulta = usarConsulta();
  const filtros = useMemo(() => filtrosDesdeConsulta(consulta), [consulta]);
  // Texto estable que identifica "esta combinación de filtros".
  const clave = consultaDesdeFiltros(filtros);
  const base = rutaSinConsulta(ruta) === '/inventario' ? '/inventario' : '/';

  // Cambiar un filtro = cambiar la URL (sin agregar historial).
  const cambiar = useCallback((parcial: Partial<ValoresFiltros>) => {
    ir(`${base}${consultaDesdeFiltros({ ...filtros, ...parcial })}`, { reemplazar: true });
  }, [filtros, base, ir]);

  // La página vuelve a 1 sola cuando cambian los filtros (sin pedir dos veces).
  const [paginacion, setPaginacion] = useState({ clave, pagina: 1 });
  const pagina = paginacion.clave === clave ? paginacion.pagina : 1;

  const traer = useCallback(
    () => api.inventario({ ...filtros, pagina, porPagina: POR_PAGINA }),
    [filtros, pagina],
  );
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [clave, pagina], { retrasoMs: filtros.q ? 300 : 0 });

  // Lista acumulada ("Ver más" agrega páginas). Se guarda con su clave para no
  // enseñar la lista vieja debajo de filtros nuevos.
  const [lista, setLista] = useState<{ clave: string; productos: Producto[]; cuantos: number; piezas: number; hayMas: boolean } | null>(null);
  useEffect(() => {
    if (!datos) return;
    setLista(prev => ({
      clave,
      productos: datos.pagina === 1 || !prev || prev.clave !== clave ? datos.productos : [...prev.productos, ...datos.productos],
      cuantos: datos.cuantos,
      piezas: datos.piezas,
      hayMas: datos.hayMas,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);
  const vista = lista && lista.clave === clave ? lista : null;
  const puedeVerMas = !!vista?.hayMas && vista.productos.length < TOPE_PINTADAS;

  const resumen = estado?.resumenDia ?? null;
  const cobertura = estado?.coberturaSucursal ?? [];

  const tocarTarjeta = (t: Tarjeta) => {
    if (t.ruta) { ir(t.ruta); return; }
    if (!t.filtro) return;
    cambiar(mismoFiltro(filtros, t) ? { prioridad: '', condiciones: [] } : t.filtro);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="titulo text-2xl leading-tight">Inventario</h2>
        <p className="text-sm text-on-surface-variant">Todo lo contado con la TC52 y lo vendido en 120 días. Solo piezas.</p>
      </div>

      {resumen && (
        <section aria-label="Resumen del día">
          <h3 className="seccion-titulo">Resumen del día</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TARJETAS.map(t => (
              <TarjetaResumen
                key={t.id}
                titulo={t.titulo}
                valor={resumen[t.id] ?? 0}
                detalle={t.detalle(estado)}
                tono={t.tono}
                activa={mismoFiltro(filtros, t)}
                alTocar={() => tocarTarjeta(t)}
              />
            ))}
          </div>
        </section>
      )}

      {cobertura.length > 0 && (
        <section aria-label="Cobertura por sucursal">
          <h3 className="seccion-titulo">Cobertura por sucursal</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {cobertura.map(c => (
              <TarjetaResumen
                key={c.area}
                titulo={c.area}
                valor={c.medianaDias === null ? '—' : `${decimal(c.medianaDias, 1)} d`}
                detalle={`de cobertura · ${numero(c.productosQueVenden)} que se venden · ${numero(c.urgentes)} urgentes`}
                tono={c.urgentes > 0 ? 'aviso' : 'normal'}
                activa={filtros.area === c.area}
                alTocar={() => cambiar({ area: filtros.area === c.area ? '' : c.area })}
              />
            ))}
          </div>
        </section>
      )}

      <Filtros
        valores={filtros}
        alCambiar={cambiar}
        areas={(estado?.areas ?? []).map(a => a.nombre)}
        categorias={(estado?.categorias ?? []).map(c => c.nombre)}
      />

      <p className="flex items-center gap-2 text-sm text-on-surface-variant" aria-live="polite">
        {vista ? (
          <span>
            <strong className="text-on-surface">{numero(vista.cuantos)}</strong> productos
            {' · '}
            <strong className="text-on-surface">{numero(vista.piezas)}</strong> piezas
            {filtros.area ? ` en ${filtros.area}` : ''}
          </span>
        ) : <span>Contando…</span>}
        {cargando && vista && <span className="h-3 w-3 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />}
      </p>

      {error && <ErrorConReintento texto={error} reintentar={reintentar} />}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {!vista && cargando && !calculando && !error
        ? <Cargando />
        : vista && vista.productos.length === 0
          ? <Vacio titulo="No hay productos con estos filtros" detalle="Quita alguna condición, cambia de área o prende 'Incluir contados en 0'." />
          : vista && (
            <>
              <div className="rejilla">
                {vista.productos.map(p => <TarjetaProducto key={p.codigo} p={p} area={filtros.area || undefined} />)}
              </div>
              {puedeVerMas && (
                <button
                  type="button"
                  onClick={() => setPaginacion({ clave, pagina: pagina + 1 })}
                  disabled={cargando}
                  className="boton-suave toque w-full py-3"
                >
                  {cargando ? 'Trayendo…' : `Ver más (van ${numero(vista.productos.length)} de ${numero(vista.cuantos)})`}
                </button>
              )}
              {vista.hayMas && !puedeVerMas && (
                <p className="py-2 text-center text-xs text-on-surface-variant">
                  Ya son {numero(vista.productos.length)} productos. Usa el buscador o filtra para acortar la lista.
                </p>
              )}
            </>
          )}
    </div>
  );
}
