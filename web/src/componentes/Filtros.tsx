import React, { useId, useState } from 'react';
import type { Condicion, OrdenInventario, Prioridad } from '../api';
import { COLORES_CONDICION, ETIQUETAS_CONDICION } from './Badge';
import { Icono, Interruptor, Opciones, Selector, SelectorMultiple } from './basicos';

/**
 * Barra de filtros del Inventario (y de cualquier lista de productos): área,
 * condiciones (varias a la vez), prioridad, categoría, orden, texto, "incluir
 * contados en 0" y "ver cocina". Los valores viven en la URL de la pantalla
 * (ver `filtrosDesdeConsulta` / `consultaDesdeFiltros`) para poder volver atrás
 * desde una ficha y encontrar la lista como estaba.
 */
export type ValoresFiltros = {
  area: string;
  condiciones: Condicion[];
  prioridad: Prioridad | '';
  categoria: string;
  orden: OrdenInventario;
  q: string;
  /** true (default) = solo productos con piezas; false = también contados en 0 y vendidos sin conteo. */
  soloConPiezas: boolean;
  /** false (default) = esconde la comida de cocina, que no tiene inventario. */
  cocina: boolean;
};

export const FILTROS_VACIOS: ValoresFiltros = {
  area: '', condiciones: [], prioridad: '', categoria: '', orden: 'piezas', q: '', soloConPiezas: true, cocina: false,
};

/** Orden en que se ofrecen las condiciones en la barra: primero lo que urge. */
export const CONDICIONES_FILTRO: Condicion[] = [
  'sin_stock', 'bajo_stock', 'desfasado', 'sobrestock', 'mas_vendidos', 'nuevo_sin_venta', 'lento',
  'sin_movimiento_30', 'sin_movimiento_60', 'sin_movimiento_90', 'sin_movimiento_180',
  'descontinuado', 'duplicado_probable', 'sin_alta',
];

export const ORDENES: Array<{ valor: OrdenInventario; texto: string }> = [
  { valor: 'piezas', texto: 'Más piezas' },
  { valor: 'dias', texto: 'Más días sin venta' },
  { valor: 'cobertura', texto: 'Menos cobertura' },
  { valor: 'venta', texto: 'Más venta' },
  { valor: 'rotacion', texto: 'Más rotación' },
  { valor: 'nombre', texto: 'Nombre' },
];

const PRIORIDADES: Array<{ valor: Prioridad | ''; texto: string }> = [
  { valor: '', texto: 'Cualquier prioridad' },
  { valor: 'alta', texto: 'Alta' },
  { valor: 'media', texto: 'Media' },
  { valor: 'baja', texto: 'Baja' },
];

const esCondicion = (x: string): x is Condicion => Object.prototype.hasOwnProperty.call(ETIQUETAS_CONDICION, x);
const esOrden = (x: string): x is OrdenInventario => ORDENES.some(o => o.valor === x);
const esPrioridad = (x: string): x is Prioridad => x === 'alta' || x === 'media' || x === 'baja';

/** Los filtros que vienen en la URL (?area=&condiciones=a,b&…). Lo que no se reconoce se ignora. */
export function filtrosDesdeConsulta(c: URLSearchParams): ValoresFiltros {
  const orden = c.get('orden') ?? '';
  const prioridad = c.get('prioridad') ?? '';
  return {
    area: c.get('area') ?? '',
    condiciones: (c.get('condiciones') ?? '').split(',').map(s => s.trim()).filter(esCondicion),
    prioridad: esPrioridad(prioridad) ? prioridad : '',
    categoria: c.get('categoria') ?? '',
    orden: esOrden(orden) ? orden : 'piezas',
    q: c.get('q') ?? '',
    soloConPiezas: c.get('soloConPiezas') !== '0',
    cocina: c.get('cocina') === '1',
  };
}

/** Lo contrario: "?area=…" para pegarlo a la ruta ('' si todo está en su valor normal). */
export function consultaDesdeFiltros(v: ValoresFiltros): string {
  const p = new URLSearchParams();
  if (v.area) p.set('area', v.area);
  if (v.condiciones.length) p.set('condiciones', v.condiciones.join(','));
  if (v.prioridad) p.set('prioridad', v.prioridad);
  if (v.categoria) p.set('categoria', v.categoria);
  if (v.orden !== 'piezas') p.set('orden', v.orden);
  if (v.q) p.set('q', v.q);
  if (!v.soloConPiezas) p.set('soloConPiezas', '0');
  if (v.cocina) p.set('cocina', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Cuántos filtros "de verdad" hay puestos (el orden y el texto no cuentan). */
export function cuantosFiltros(v: ValoresFiltros): number {
  return (v.area ? 1 : 0) + v.condiciones.length + (v.prioridad ? 1 : 0) + (v.categoria ? 1 : 0)
    + (v.soloConPiezas ? 0 : 1) + (v.cocina ? 1 : 0);
}

export function Filtros({
  valores, alCambiar, areas, categorias, placeholder = 'Buscar en esta lista',
}: {
  valores: ValoresFiltros;
  /** Recibe solo lo que cambió; la pantalla lo mezcla con lo demás. */
  alCambiar: (parcial: Partial<ValoresFiltros>) => void;
  /** Nombres de las áreas de la tienda (estado.areas). */
  areas: string[];
  /** Nombres de las categorías (estado.categorias). */
  categorias: string[];
  placeholder?: string;
}) {
  const id = useId();
  // En celular los filtros de abajo van escondidos hasta que se piden; en
  // desktop siempre se ven (hay lugar).
  const [abierto, setAbierto] = useState(false);
  const escondidos = (valores.prioridad ? 1 : 0) + (valores.categoria ? 1 : 0) + (valores.soloConPiezas ? 0 : 1) + (valores.cocina ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${id}-q`} className="sr-only">{placeholder}</label>
          <Icono nombre="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
          <input
            id={`${id}-q`}
            value={valores.q}
            onChange={e => alCambiar({ q: e.target.value })}
            placeholder={placeholder}
            inputMode="search"
            autoComplete="off"
            className="campo-buscar"
          />
          {valores.q && (
            <button
              type="button"
              onClick={() => alCambiar({ q: '' })}
              aria-label="Limpiar el texto"
              className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-on-surface-variant"
            >
              <Icono nombre="close" className="text-[20px]" />
            </button>
          )}
        </div>
        <Selector
          id={`${id}-orden`}
          etiqueta="Orden"
          etiquetaOculta
          valor={valores.orden}
          opciones={ORDENES}
          alElegir={orden => alCambiar({ orden })}
          className="shrink-0"
        />
      </div>

      <div className="-mx-4 px-4">
        <Opciones
          etiqueta="Área"
          valor={valores.area}
          alElegir={area => alCambiar({ area })}
          opciones={[{ valor: '', texto: 'Todas las áreas' }, ...areas.map(a => ({ valor: a, texto: a }))]}
        />
      </div>

      <div className="-mx-4 px-4">
        <SelectorMultiple
          etiqueta="Condiciones"
          valores={valores.condiciones}
          alCambiar={condiciones => alCambiar({ condiciones })}
          opciones={CONDICIONES_FILTRO.map(c => ({ valor: c, texto: ETIQUETAS_CONDICION[c], colorActivo: COLORES_CONDICION[c] }))}
        />
      </div>

      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        aria-controls={`${id}-mas`}
        className="chip-boton lg:hidden"
      >
        <Icono nombre="tune" className="text-[18px]" />
        Más filtros{escondidos > 0 ? ` (${escondidos})` : ''}
        <Icono nombre={abierto ? 'expand_less' : 'expand_more'} className="text-[18px]" />
      </button>

      <div id={`${id}-mas`} className={`${abierto ? 'flex' : 'hidden lg:flex'} flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="-mx-4 max-w-full px-4 lg:mx-0 lg:px-0">
          <Opciones
            etiqueta="Prioridad"
            valor={valores.prioridad}
            alElegir={prioridad => alCambiar({ prioridad })}
            opciones={PRIORIDADES}
          />
        </div>
        <Selector
          id={`${id}-categoria`}
          etiqueta="Categoría"
          valor={valores.categoria}
          opciones={[{ valor: '', texto: 'Todas las categorías' }, ...categorias.map(c => ({ valor: c, texto: c }))]}
          alElegir={categoria => alCambiar({ categoria })}
          className="max-w-full"
        />
        <Interruptor
          activo={!valores.soloConPiezas}
          alCambiar={v => alCambiar({ soloConPiezas: !v })}
          texto="Incluir contados en 0"
        />
        <Interruptor activo={valores.cocina} alCambiar={cocina => alCambiar({ cocina })} texto="Ver cocina" />
      </div>
    </div>
  );
}
