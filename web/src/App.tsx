import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SinSesion, api, type Estado, type ResumenDia } from './api';
import { Areas, Cargando, Icono, Navegacion, numero, rutaSinConsulta } from './componentes/basicos';
import { Entrar } from './pantallas/Entrar';
import { Inventario } from './pantallas/Inventario';
import { Resurtir } from './pantallas/Resurtir';
import { Movimiento } from './pantallas/Movimiento';
import { Alertas } from './pantallas/Alertas';
import { Buscar } from './pantallas/Buscar';
import { Producto } from './pantallas/Producto';

/** Los cuatro módulos: abajo en celular, arriba en desktop. */
const MODULOS = [
  { ruta: '/', icono: 'inventory_2', texto: 'Inventario', activaSi: (c: string) => c === '/' || c.startsWith('/inventario') },
  { ruta: '/resurtir', icono: 'local_shipping', texto: 'Resurtir', activaSi: (c: string) => c.startsWith('/resurtir') },
  { ruta: '/movimiento', icono: 'trending_up', texto: 'Movimiento', activaSi: (c: string) => c.startsWith('/movimiento') },
  { ruta: '/alertas', icono: 'notifications', texto: 'Alertas', activaSi: (c: string) => c.startsWith('/alertas') },
];

function nombreModulo(camino: string) {
  if (camino.startsWith('/producto/')) return 'Producto';
  if (camino.startsWith('/buscar')) return 'Buscar';
  return MODULOS.find(m => m.activaSi(camino))?.texto ?? 'Inventario';
}

const DIA_CDMX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
const DIA_BONITO = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' });

/**
 * "Actualizado a las 14:30" cuando los datos son de hoy. Si la app estuvo sin
 * visitas (deja de refrescar para no cargar el punto de venta), los datos pueden
 * ser de anoche: entonces se dice el día, para que nadie tome una decisión
 * creyendo que son de hace un rato.
 */
function textoActualizado(estado: Estado | null, refrescando: boolean) {
  if (refrescando || estado?.calculando) return 'Actualizando…';
  if (!estado?.actualizado || !estado.generado) return 'Juntando información…';
  const fecha = new Date(estado.generado);
  if (Number.isNaN(fecha.getTime())) return `Actualizado a las ${estado.actualizado}`;
  if (DIA_CDMX.format(fecha) === DIA_CDMX.format(new Date())) return `Actualizado a las ${estado.actualizado}`;
  return `Actualizado el ${DIA_BONITO.format(fecha)} a las ${estado.actualizado}`;
}

/** Buscador global: Enter o la lupa mandan a /buscar?q=… */
function BuscadorGlobal({ id, ir, className = '' }: { id: string; ir: (destino: string) => void; className?: string }) {
  const [texto, setTexto] = useState('');
  const mandar = (e: React.FormEvent) => {
    e.preventDefault();
    const q = texto.trim();
    if (!q) return;
    ir(`/buscar?q=${encodeURIComponent(q)}`);
    setTexto('');
  };
  return (
    <form onSubmit={mandar} role="search" className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">Buscar producto por nombre o código</label>
      <input
        id={id}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Buscar producto o código"
        inputMode="search"
        autoComplete="off"
        enterKeyHint="search"
        className="campo-buscar pl-4"
      />
      <button type="submit" aria-label="Buscar" className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-on-surface-variant">
        <Icono nombre="search" className="text-[22px]" />
      </button>
    </form>
  );
}

export function App() {
  // La ruta lleva la consulta (?q=…, ?area=…): los filtros viven en la URL.
  const [ruta, setRuta] = useState(() => window.location.pathname + window.location.search);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [entro, setEntro] = useState<boolean | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const ir = useCallback((destino: string, opciones: { reemplazar?: boolean } = {}) => {
    const actual = window.location.pathname + window.location.search;
    if (destino !== actual) {
      // Cambiar un filtro no agrega historial: "atrás" regresa a la pantalla anterior, no al filtro anterior.
      if (opciones.reemplazar) window.history.replaceState({}, '', destino);
      else window.history.pushState({}, '', destino);
    }
    setRuta(destino);
    if (!opciones.reemplazar) window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const atras = () => setRuta(window.location.pathname + window.location.search);
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, []);

  // Cuando se vence la sesión (12 h), cualquier pantalla que reciba un 401 avisa
  // por aquí. Antes solo lo notaba el encabezado y la app se quedaba congelada.
  useEffect(() => {
    const seVencio = () => { setEntro(false); setEstado(null); };
    window.addEventListener('invetory:sin-sesion', seVencio);
    return () => window.removeEventListener('invetory:sin-sesion', seVencio);
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

  const camino = rutaSinConsulta(ruta);
  const modulo = nombreModulo(camino);

  useEffect(() => {
    document.title = modulo === 'Inventario' ? 'Inventario La Casita' : `${modulo} · Inventario La Casita`;
  }, [modulo]);

  // Ya adentro, /entrar no tiene sentido: al inicio.
  useEffect(() => {
    if (entro && camino.startsWith('/entrar')) ir('/', { reemplazar: true });
  }, [entro, camino, ir]);

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
  if (camino.startsWith('/producto/')) pantalla = <Producto codigo={decodeURIComponent(camino.slice('/producto/'.length))} estado={estado} />;
  else if (camino.startsWith('/resurtir')) pantalla = <Resurtir estado={estado} />;
  else if (camino.startsWith('/movimiento')) pantalla = <Movimiento estado={estado} />;
  else if (camino.startsWith('/alertas')) pantalla = <Alertas estado={estado} />;
  else if (camino.startsWith('/buscar')) pantalla = <Buscar />;
  else pantalla = <Inventario estado={estado} />;

  const enBuscar = camino.startsWith('/buscar');
  const girando = refrescando || !!estado?.calculando;
  // Conteo para el ítem "Alertas": las urgentes si el resumen las trae; si no, las activas.
  const resumenDia = estado?.resumenDia as (ResumenDia & { alertasUrgentes?: number }) | null | undefined;
  const conteoAlertas = resumenDia?.alertasUrgentes ?? resumenDia?.alertas ?? 0;

  return (
    <Navegacion.Provider value={navegacion}>
      <Areas.Provider value={estado?.areas ?? []}>
        <div className="min-h-screen pb-24 lg:pb-10">
          <header className="no-imprimir sticky top-0 z-20 border-b border-outline-variant/60 bg-background/95 backdrop-blur">
            <div className="respeta-bordes mx-auto max-w-6xl">
              <div className="flex items-center gap-3 py-2 lg:py-3">
                <button type="button" onClick={() => ir('/')} aria-label="Ir al inicio" className="shrink-0">
                  <img src="/logo.png" alt="" className="h-10 w-10 rounded-lg object-contain lg:h-11 lg:w-11" />
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="titulo truncate text-xl leading-tight lg:text-2xl">{modulo}</h1>
                  <p className="etiqueta truncate">{textoActualizado(estado, refrescando)}</p>
                </div>
                {!enBuscar && <BuscadorGlobal id="buscador-arriba" ir={ir} className="hidden w-64 md:block lg:w-80" />}
                <button
                  type="button"
                  onClick={() => cargarEstado(true)}
                  className="boton-suave toque h-11 w-11 shrink-0 !px-0"
                  aria-label="Actualizar"
                  title="Actualizar"
                >
                  <Icono nombre="refresh" className={`text-[22px] ${girando ? 'animate-spin' : ''}`} />
                </button>
                {estado?.usuario && (
                  <span className="hidden items-center gap-1 text-sm text-on-surface-variant sm:inline-flex" title="Usuario">
                    <Icono nombre="person" className="text-[18px]" />
                    {estado.usuario}
                  </span>
                )}
                <button
                  type="button"
                  onClick={salir}
                  className="boton-suave toque h-11 shrink-0 gap-1 px-3"
                  aria-label={estado?.usuario ? `Salir (${estado.usuario})` : 'Salir'}
                  title="Salir"
                >
                  <Icono nombre="logout" className="text-[20px]" />
                  <span className="hidden text-sm sm:inline">Salir</span>
                </button>
              </div>

              {!enBuscar && <BuscadorGlobal id="buscador-abajo" ir={ir} className="pb-2 md:hidden" />}

              <nav className="-mb-px hidden lg:flex" aria-label="Módulos">
                {MODULOS.map(m => {
                  const activa = m.activaSi(camino);
                  return (
                    <button
                      key={m.ruta}
                      type="button"
                      onClick={() => ir(m.ruta)}
                      aria-current={activa ? 'page' : undefined}
                      className={`toque flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                        activa ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <Icono nombre={m.icono} className="text-[20px]" />
                      {m.texto}
                      {m.ruta === '/alertas' && conteoAlertas > 0 && (
                        <span className="chip bg-error px-2 py-0 text-[11px] text-on-error" aria-label={`${numero(conteoAlertas)} alertas`}>
                          {numero(conteoAlertas)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </header>

          <main className="respeta-bordes mx-auto max-w-6xl pt-4">
            {estado && !estado.listo
              ? <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />
              : pantalla}
          </main>

          <nav
            className="no-imprimir fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/60 bg-surface-container-lowest/95 backdrop-blur lg:hidden"
            aria-label="Módulos"
          >
            <div className="respeta-bordes mx-auto flex max-w-6xl items-stretch justify-between pb-[env(safe-area-inset-bottom)]">
              {MODULOS.map(m => {
                const activa = m.activaSi(camino);
                return (
                  <button
                    key={m.ruta}
                    type="button"
                    onClick={() => ir(m.ruta)}
                    aria-current={activa ? 'page' : undefined}
                    className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 ${activa ? 'text-primary' : 'text-on-surface-variant'}`}
                  >
                    <Icono nombre={m.icono} className={`text-[24px] ${activa ? 'opacity-100' : 'opacity-70'}`} />
                    <span className="font-label text-[11px] uppercase tracking-widest">{m.texto}</span>
                    {m.ruta === '/alertas' && conteoAlertas > 0 && (
                      <span
                        className="absolute left-1/2 top-1 ml-1 rounded-full bg-error px-1.5 text-[10px] font-bold leading-4 text-on-error"
                        aria-label={`${numero(conteoAlertas)} alertas`}
                      >
                        {conteoAlertas > 99 ? '99+' : conteoAlertas}
                      </span>
                    )}
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
