import React, { useCallback, useEffect, useState } from 'react';
import { api, type Estado, type Producto } from '../api';
import { Aviso, Cargando, Icono, Opciones, Vacio, numero } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';

const DIAS = [
  { valor: 0, texto: 'Todos' },
  { valor: 30, texto: '30+ días' },
  { valor: 60, texto: '60+ días' },
  { valor: 90, texto: '90+ días' },
  { valor: 180, texto: '180+ días' },
];
// Tope de tarjetas pintadas: con 2,203 descontinuados, dejar crecer la lista sin
// freno acaba con el celular. Pasado el tope se pide filtrar.
const TOPE_PINTADAS = 300;

export function SinVenta({ estado }: { estado: Estado | null }) {
  const [clase, setClase] = useState('descontinuado');
  const [area, setArea] = useState('');
  const [dias, setDias] = useState(0);
  const [orden, setOrden] = useState('piezas');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const [acumulados, setAcumulados] = useState<Producto[]>([]);

  useEffect(() => { setPagina(1); setAcumulados([]); }, [clase, area, dias, orden, buscar]);

  const traer = useCallback(
    () => api.sinVenta({ clase, area, dias, orden, buscar, pagina }),
    [clase, area, dias, orden, buscar, pagina],
  );
  const { datos, cargando, error, calculando, reintentar } = usarDatos(
    traer,
    [clase, area, dias, orden, buscar, pagina],
    { retrasoMs: buscar ? 300 : 0 },
  );

  useEffect(() => {
    if (!datos) return;
    setAcumulados(prev => (datos.pagina === 1 ? datos.productos : [...prev, ...datos.productos]));
  }, [datos]);

  const tarjetas = datos?.tarjetas ?? [];
  const visibles = tarjetas.filter(t => !t.oculto || t.clase === clase || t.productos > 0);
  const puedeVerMas = !!datos?.hayMas && acumulados.length < TOPE_PINTADAS;

  return (
    <div className="space-y-4">
      {/* Tarjetas de resumen: se tocan para filtrar */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sin-barra">
        {visibles.map(t => {
          const activa = clase === t.clase;
          return (
            <button
              key={t.clase}
              type="button"
              onClick={() => setClase(t.clase)}
              aria-pressed={activa}
              className={`w-44 shrink-0 rounded-xl border p-3 text-left transition-colors ${
                activa
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/60 bg-surface-container-lowest'
              }`}
            >
              <p className={`text-2xl font-bold leading-none ${activa ? '' : 'text-primary'}`}>{numero(t.productos)}</p>
              <p className="mt-1 text-sm font-medium leading-tight">{t.titulo}</p>
              <p className={`mt-0.5 text-xs leading-tight ${activa ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                {t.detalle}
              </p>
              <p className={`mt-1 text-xs font-medium ${activa ? 'text-on-primary/90' : 'text-on-surface'}`}>
                {numero(t.piezas)} piezas
              </p>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icono nombre="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant" />
            <input
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar en esta lista"
              aria-label="Buscar en esta lista"
              className="w-full rounded-full border border-outline-variant/70 bg-surface-container-lowest py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => setOrden(o => (o === 'piezas' ? 'dias' : 'piezas'))}
            className="boton-suave shrink-0 text-sm"
          >
            <Icono nombre="sort" className="text-[18px]" />
            {orden === 'piezas' ? 'Piezas' : 'Días'}
          </button>
        </div>

        <div className="-mx-4 px-4">
          <Opciones
            valor={area}
            alElegir={setArea}
            opciones={[{ valor: '', texto: 'Todas las áreas' }, ...(estado?.areas ?? []).map(a => ({ valor: a.nombre, texto: a.nombre }))]}
          />
        </div>
        <div className="-mx-4 px-4">
          <Opciones valor={dias} alElegir={setDias} opciones={DIAS} />
        </div>
      </div>

      <p className="flex items-center gap-2 text-sm text-on-surface-variant">
        <span>
          <strong className="text-on-surface">{numero(datos?.cuantos ?? 0)}</strong> productos
          {' · '}
          <strong className="text-on-surface">{numero(datos?.piezas ?? 0)}</strong> piezas
          {area ? ` en ${area}` : ''}
        </span>
        {cargando && datos && <span className="h-3 w-3 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />}
      </p>

      {error && (
        <div className="space-y-2">
          <Aviso texto={error} />
          <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
        </div>
      )}
      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {!datos && cargando && !calculando && !error
        ? <Cargando />
        : acumulados.length === 0 && datos
          ? <Vacio titulo="No hay productos con estos filtros" detalle="Prueba con otra tarjeta de arriba o quita el filtro de días." />
          : (
            <div className="space-y-2">
              {acumulados.map(p => <TarjetaProducto key={p.codigo} p={p} area={area || undefined} />)}
              {puedeVerMas && (
                <button type="button" onClick={() => setPagina(p => p + 1)} disabled={cargando} className="boton-suave w-full py-3">
                  {cargando ? 'Trayendo…' : 'Ver más'}
                </button>
              )}
              {datos?.hayMas && !puedeVerMas && (
                <p className="py-2 text-center text-xs text-on-surface-variant">
                  Ya son {numero(acumulados.length)} productos. Usa el buscador o filtra por área para acortar la lista.
                </p>
              )}
            </div>
          )}
    </div>
  );
}
