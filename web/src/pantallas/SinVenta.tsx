import React, { useEffect, useRef, useState } from 'react';
import { api, type Estado, type Producto, type Tarjeta } from '../api';
import { Cargando, Icono, Opciones, Vacio, numero } from '../componentes/basicos';
import { TarjetaProducto } from '../componentes/TarjetaProducto';

const DIAS = [
  { valor: 0, texto: 'Todos' },
  { valor: 30, texto: '30+ días' },
  { valor: 60, texto: '60+ días' },
  { valor: 90, texto: '90+ días' },
  { valor: 180, texto: '180+ días' },
];

export function SinVenta({ estado }: { estado: Estado | null }) {
  const [clase, setClase] = useState('descontinuado');
  const [area, setArea] = useState('');
  const [dias, setDias] = useState(0);
  const [orden, setOrden] = useState('piezas');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);

  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cuantos, setCuantos] = useState(0);
  const [piezas, setPiezas] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const primeraVez = useRef(true);

  useEffect(() => { setPagina(1); }, [clase, area, dias, orden, buscar]);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await api.sinVenta({ clase, area, dias, orden, buscar, pagina });
        if (!vivo) return;
        setTarjetas(r.tarjetas ?? []);
        setCuantos(r.cuantos ?? 0);
        setPiezas(r.piezas ?? 0);
        setHayMas(!!r.hayMas);
        setProductos(prev => (pagina === 1 ? (r.productos ?? []) : [...prev, ...(r.productos ?? [])]));
      } finally {
        if (vivo) { setCargando(false); primeraVez.current = false; }
      }
    }, buscar ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [clase, area, dias, orden, buscar, pagina]);

  const visibles = tarjetas.filter(t => !t.oculto || t.clase === clase || t.productos > 0);

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
              className={`w-40 shrink-0 rounded-xl border p-3 text-left transition-colors ${
                activa
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/60 bg-surface-container-lowest'
              }`}
            >
              <p className={`text-2xl font-bold leading-none ${activa ? '' : 'text-primary'}`}>{numero(t.productos)}</p>
              <p className="mt-1 text-sm font-medium leading-tight">{t.titulo}</p>
              <p className={`mt-1 text-xs leading-tight ${activa ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                {numero(t.piezas)} piezas paradas
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

        <Opciones
          valor={area}
          alElegir={setArea}
          opciones={[{ valor: '', texto: 'Todas las áreas' }, ...(estado?.areas ?? []).map(a => ({ valor: a.nombre, texto: a.nombre }))]}
        />
        <Opciones valor={dias} alElegir={setDias} opciones={DIAS} />
      </div>

      <p className="text-sm text-on-surface-variant">
        <strong className="text-on-surface">{numero(cuantos)}</strong> productos
        {' · '}
        <strong className="text-on-surface">{numero(piezas)}</strong> piezas
        {area ? ` en ${area}` : ''}
      </p>

      {cargando && primeraVez.current
        ? <Cargando />
        : productos.length === 0
          ? <Vacio titulo="No hay productos con estos filtros" detalle="Prueba con otra tarjeta de arriba o quita el filtro de días." />
          : (
            <div className="space-y-2">
              {productos.map(p => <TarjetaProducto key={p.codigo} p={p} area={area || undefined} />)}
              {hayMas && (
                <button type="button" onClick={() => setPagina(p => p + 1)} disabled={cargando} className="boton-suave w-full py-3">
                  {cargando ? 'Trayendo…' : 'Ver más'}
                </button>
              )}
            </div>
          )}
    </div>
  );
}
