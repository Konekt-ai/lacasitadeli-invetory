import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SinSesion, api, type Estado } from './api';
import { Areas, Cargando, Icono, Navegacion } from './componentes/basicos';
import { Entrar } from './pantallas/Entrar';
import { SinVenta } from './pantallas/SinVenta';
import { Resurtir } from './pantallas/Resurtir';
import { MasVendidos } from './pantallas/MasVendidos';
import { Buscar } from './pantallas/Buscar';
import { Producto } from './pantallas/Producto';

const PESTANAS = [
  { ruta: '/', icono: 'warning', texto: 'Sin venta' },
  { ruta: '/resurtir', icono: 'local_shipping', texto: 'Resurtir' },
  { ruta: '/mas-vendidos', icono: 'trending_up', texto: 'Más vendidos' },
  { ruta: '/buscar', icono: 'search', texto: 'Buscar' },
];

export function App() {
  const [ruta, setRuta] = useState(() => window.location.pathname);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [entro, setEntro] = useState<boolean | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const ir = useCallback((destino: string) => {
    if (destino !== window.location.pathname) window.history.pushState({}, '', destino);
    setRuta(destino);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const atras = () => setRuta(window.location.pathname);
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, []);

  const cargarEstado = useCallback(async (fresco = false) => {
    try {
      if (fresco) setRefrescando(true);
      const e = await api.estado(fresco);
      setEstado(e);
      setEntro(true);
      return e;
    } catch (err) {
      if (err instanceof SinSesion) setEntro(false);
      return null;
    } finally {
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  // Mientras se está calculando por primera vez, se vuelve a preguntar solito.
  useEffect(() => {
    if (!entro) return undefined;
    const debeInsistir = !estado?.listo || estado?.calculando;
    const cada = debeInsistir ? 4000 : 5 * 60_000;
    const t = setInterval(() => {
      if (document.hidden) return;   // si el celular está guardado, no se molesta a la caja
      cargarEstado();
    }, cada);
    return () => clearInterval(t);
  }, [entro, estado?.listo, estado?.calculando, cargarEstado]);

  const navegacion = useMemo(() => ({ ruta, ir }), [ruta, ir]);

  if (entro === null) return <Cargando texto="Abriendo…" />;
  if (!entro) {
    return <Entrar alEntrar={async () => { await cargarEstado(); ir('/'); }} />;
  }

  const salir = async () => {
    await api.salir();
    setEntro(false);
    setEstado(null);
    ir('/entrar');
  };

  let pantalla: React.ReactNode = null;
  if (ruta.startsWith('/producto/')) pantalla = <Producto codigo={decodeURIComponent(ruta.slice('/producto/'.length))} />;
  else if (ruta.startsWith('/resurtir')) pantalla = <Resurtir estado={estado} />;
  else if (ruta.startsWith('/mas-vendidos')) pantalla = <MasVendidos estado={estado} />;
  else if (ruta.startsWith('/buscar')) pantalla = <Buscar />;
  else pantalla = <SinVenta estado={estado} />;

  return (
    <Navegacion.Provider value={navegacion}>
      <Areas.Provider value={estado?.areas ?? []}>
        <div className="min-h-screen pb-24">
          <header className="sticky top-0 z-20 border-b border-outline-variant/60 bg-background/90 backdrop-blur">
            <div className="respeta-bordes mx-auto flex max-w-screen-sm items-center gap-3 py-3">
              <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
              <div className="min-w-0 flex-1">
                <h1 className="titulo truncate text-lg leading-tight">Inventario La Casita</h1>
                <p className="etiqueta truncate">
                  {estado?.actualizado ? `Actualizado a las ${estado.actualizado}` : 'Juntando información…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => cargarEstado(true)}
                className="boton-suave h-10 w-10 !px-0"
                aria-label="Actualizar"
              >
                <Icono nombre="refresh" className={`text-[20px] ${refrescando ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={salir} className="boton-suave h-10 w-10 !px-0" aria-label="Salir">
                <Icono nombre="logout" className="text-[20px]" />
              </button>
            </div>
          </header>

          <main className="respeta-bordes mx-auto max-w-screen-sm pt-3">
            {estado && !estado.listo
              ? <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />
              : pantalla}
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/60 bg-surface-container-lowest/95 backdrop-blur">
            <div className="respeta-bordes mx-auto flex max-w-screen-sm items-stretch justify-between pb-[env(safe-area-inset-bottom)]">
              {PESTANAS.map(p => {
                const activa = p.ruta === '/' ? ruta === '/' : ruta.startsWith(p.ruta);
                return (
                  <button
                    key={p.ruta}
                    type="button"
                    onClick={() => ir(p.ruta)}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 ${activa ? 'text-primary' : 'text-on-surface-variant'}`}
                  >
                    <Icono nombre={p.icono} className={`text-[22px] ${activa ? 'opacity-100' : 'opacity-70'}`} />
                    <span className="font-label text-[10px] uppercase tracking-widest">{p.texto}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </Areas.Provider>
    </Navegacion.Provider>
  );
}
