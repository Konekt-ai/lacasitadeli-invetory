import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Estado, type EstadoResurtido, type FilaResurtido, type FiltrosResurtir, type RespuestaResurtir, type Solicitud } from '../api';
import { Badge, BadgePrioridad } from '../componentes/Badge';
import { Foto, Icono, Opciones, Vacio, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { Dato, Encabezado, EstadoCarga, TituloSeccion } from '../componentes/EstadoCarga';
import { SolicitarResurtido } from '../componentes/SolicitarResurtido';
import { ETIQUETA_MI_LISTA, claseImpresion, llaveDe, usarMiLista, type ArticuloMiLista } from '../componentes/miLista';
import { coberturaTexto, fechaTexto, porDia, pzas } from '../componentes/formato';

/**
 * Módulo Resurtir: qué mover, desde dónde, hacia dónde y cuántas piezas.
 * Botones = acciones reales: "Solicitar resurtido" (crea la tarea que bodega
 * ejecuta con la TC52) y "Agregar a mi lista" (solo en este teléfono). Aquí no
 * hay "Marcar surtido": lo surtido lo registra la TC52, no un botón.
 */
type Horizonte = NonNullable<FiltrosResurtir['horizonte']>;
type CondicionResurtir = NonNullable<FiltrosResurtir['condicion']>;
type SolicitudLocal = NonNullable<FilaResurtido['solicitud']>;
type Pestana = 'pendiente' | 'hecha' | 'cancelada';

const POR_TANDA = 45;

const CHIP_ESTADO: Record<EstadoResurtido, { texto: string; clase: string }> = {
  urgente: { texto: 'Urgente', clase: 'bg-error text-on-error' },
  desfasado: { texto: 'Desfasado: cuéntalo', clase: 'border border-error bg-transparent text-error' },
  bajo: { texto: 'Bajo stock', clase: 'bg-secondary-fixed text-on-secondary-fixed' },
  ok: { texto: 'Al día', clase: 'bg-primary-fixed text-on-primary-fixed' },
  sin_conteo: { texto: 'No está contado', clase: 'bg-surface-variant text-on-surface-variant' },
};

/** Con estas acciones sí tiene sentido mover piezas; con "contar" o "ninguna", no. */
const SE_PUEDE_MOVER = new Set(['surtir', 'surtir_parcial', 'pedir', 'revisar_respaldo']);

export function Resurtir({ estado }: { estado: Estado | null }) {
  const [horizonte, setHorizonte] = useState<Horizonte>('7');
  const [condicion, setCondicion] = useState<CondicionResurtir>('');
  const [area, setArea] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloAlta, setSoloAlta] = useState(false);
  const [cocina, setCocina] = useState(false);
  const [sinConteo, setSinConteo] = useState(false);
  const [q, setQ] = useState('');
  const [qBuscada, setQBuscada] = useState('');
  // La búsqueda espera a que dejes de escribir: no se le pega al servidor por cada letra.
  useEffect(() => { const t = setTimeout(() => setQBuscada(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const filtros = useMemo<FiltrosResurtir>(() => ({
    horizonte, condicion, area, categoria, prioridad: soloAlta ? 'alta' : '', cocina, sinConteo, q: qBuscada,
  }), [horizonte, condicion, area, categoria, soloAlta, cocina, sinConteo, qBuscada]);
  const traer = useCallback(() => api.resurtir(filtros), [filtros]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [filtros]);

  // Piezas editadas en cada tarjeta y solicitudes creadas en esta visita (para
  // que la tarjeta diga "Solicitado" sin volver a pedir toda la lista).
  const [piezasEditadas, setPiezasEditadas] = useState<Record<string, number>>({});
  const [solicitadas, setSolicitadas] = useState<Record<string, SolicitudLocal>>({});
  const [modal, setModal] = useState<FilaResurtido | null>(null);
  const modalRef = useRef<FilaResurtido | null>(null);
  modalRef.current = modal;
  const [cuantas, setCuantas] = useState(POR_TANDA);
  const [vueltaHistorial, setVueltaHistorial] = useState(0);
  useEffect(() => { setCuantas(POR_TANDA); }, [datos]);
  const miLista = usarMiLista();

  const puedeSolicitar = !!estado?.capacidades?.solicitudes;
  const piezasDe = (f: FilaResurtido) => piezasEditadas[llaveDe(f.codigo, f.area)] ?? f.sugerido;
  const solicitudDe = (f: FilaResurtido) => solicitadas[llaveDe(f.codigo, f.area)] ?? f.solicitud;

  const alSolicitar = useCallback((s: Solicitud) => {
    // La solicitud pudo ir a otra sucursal si el dueño cambió "Hacia" en el modal:
    // se marca la tarjeta de ESA sucursal (por eso la llave usa s.a_ubicacion).
    const m = modalRef.current;
    if (m) {
      const local: SolicitudLocal = { id: s.id, estado: s.estado, cantidad: s.cantidad, creado: s.creado };
      setSolicitadas(prev => ({ ...prev, [llaveDe(m.codigo, s.a_ubicacion)]: local }));
    }
    setVueltaHistorial(v => v + 1);
  }, []);

  const agregarALista = (f: FilaResurtido) => miLista.agregar({ codigo: f.codigo, nombre: f.nombre, area: f.area, piezas: piezasDe(f), accion: f.accion });

  const filas = datos?.filas ?? [];
  const visibles = filas.slice(0, cuantas);
  const fueraDeLista = Math.max(0, (datos?.cuantos ?? 0) - filas.length);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Resurtir" subtitulo="Qué mover, desde dónde, hacia dónde y cuántas piezas" />

      {datos && (
        <section aria-label="Resumen" className="space-y-1">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            <Dato titulo="Urgentes" valor={numero(datos.tarjetas.urgentes)} detalle="alcanzan para menos de 2 días" tono={datos.tarjetas.urgentes > 0 ? 'error' : 'normal'} alTocar={() => setHorizonte('hoy')} activo={horizonte === 'hoy'} />
            <Dato titulo="Piezas a mover" valor={numero(datos.tarjetas.piezasAMover)} detalle="sugeridas en total" />
            <Dato titulo="Transferencias sugeridas" valor={numero(datos.tarjetas.transferencias)} detalle="de Bodega al anaquel" />
            <Dato titulo="Sin respaldo en bodega" valor={numero(datos.tarjetas.sinRespaldo)} detalle="hay que comprarlos" tono={datos.tarjetas.sinRespaldo > 0 ? 'aviso' : 'normal'} />
            <Dato
              titulo="Sucursal más urgente"
              valor={datos.tarjetas.sucursalMasUrgente ?? '—'}
              detalle={datos.tarjetas.sucursalMasUrgente ? 'toca para filtrar' : 'nada urgente'}
              alTocar={datos.tarjetas.sucursalMasUrgente ? () => setArea(a => (a === datos.tarjetas.sucursalMasUrgente ? '' : datos.tarjetas.sucursalMasUrgente ?? '')) : undefined}
              activo={!!area && area === datos.tarjetas.sucursalMasUrgente}
            />
          </div>
          {(datos.tarjetas.desfasados > 0 || datos.tarjetas.sinConteo > 0) && (
            <p className="text-xs text-on-surface-variant">
              {datos.tarjetas.desfasados > 0 && <>{numero(datos.tarjetas.desfasados)} desfasados (el sistema dice 0 y se siguen vendiendo). </>}
              {datos.tarjetas.sinConteo > 0 && <>{numero(datos.tarjetas.sinConteo)} se venden sin estar contados: actívalos con "Ver lo no contado".</>}
            </p>
          )}
        </section>
      )}

      <section aria-label="Filtros" className="space-y-2">
        <Opciones
          valor={horizonte}
          alElegir={setHorizonte}
          opciones={[{ valor: 'hoy', texto: 'Urgente hoy' }, { valor: '3', texto: 'Próximos 3 días' }, { valor: '7', texto: 'Próximos 7 días' }]}
        />
        <Opciones
          valor={condicion}
          alElegir={setCondicion}
          opciones={[{ valor: '', texto: 'Todo' }, { valor: 'sin_stock', texto: 'Sin stock' }, { valor: 'bajo_stock', texto: 'Bajo stock' }]}
        />
        <Opciones
          valor={area}
          alElegir={setArea}
          opciones={[{ valor: '', texto: 'Todas las sucursales' }, ...(estado?.areasVenta ?? []).map(a => ({ valor: a, texto: a }))]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría" className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-base sm:w-64">
            <option value="">Todas las categorías</option>
            {(estado?.categorias ?? []).map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({numero(c.productos)})</option>)}
          </select>
          <div className="relative flex-1">
            <Icono nombre="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nombre o código"
              aria-label="Buscar"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2.5 pl-10 pr-3 text-base"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soloAlta} onChange={e => setSoloAlta(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
            Solo prioridad alta
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cocina} onChange={e => setCocina(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
            Ver cocina
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sinConteo} onChange={e => setSinConteo(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
            Ver lo no contado
          </label>
        </div>
      </section>

      <EstadoCarga cargando={cargando} calculando={calculando} error={error} reintentar={reintentar} hayDatos={!!datos}>
        {!filas.length ? (
          <Vacio icono="local_shipping" titulo="Nada que mover con estos filtros" detalle="El anaquel está surtido según las ventas de los últimos días, o cambia el horizonte y la sucursal." />
        ) : (
          <section aria-label="Productos por surtir" className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              {numero(datos?.cuantos ?? filas.length)} {(datos?.cuantos ?? filas.length) === 1 ? 'producto' : 'productos'}
              {!puedeSolicitar && ' · el sistema admin no está conectado: no se pueden crear solicitudes, pero sí tu lista'}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visibles.map(f => (
                <TarjetaResurtir
                  key={llaveDe(f.codigo, f.area)}
                  f={f}
                  piezas={piezasDe(f)}
                  alCambiarPiezas={n => setPiezasEditadas(p => ({ ...p, [llaveDe(f.codigo, f.area)]: n }))}
                  solicitud={solicitudDe(f)}
                  puedeSolicitar={puedeSolicitar}
                  alPedir={() => setModal(f)}
                  enLista={miLista.tiene(f.codigo, f.area)}
                  alLista={() => (miLista.tiene(f.codigo, f.area) ? miLista.quitar(f.codigo, f.area) : agregarALista(f))}
                />
              ))}
            </div>
            {filas.length > cuantas && (
              <button type="button" onClick={() => setCuantas(c => c + POR_TANDA)} className="boton-suave w-full py-3">
                Ver más ({numero(filas.length - cuantas)} faltan)
              </button>
            )}
            {filas.length <= cuantas && fueraDeLista > 0 && (
              <p className="py-2 text-center text-xs text-on-surface-variant">Hay {numero(fueraDeLista)} más. Filtra por sucursal o categoría para verlos.</p>
            )}
          </section>
        )}
      </EstadoCarga>

      <SeccionMiLista lista={miLista.lista} palomear={miLista.palomear} quitar={miLista.quitar} limpiar={miLista.limpiar} imprimir={miLista.imprimir} />

      <Historial habilitado={puedeSolicitar} conteo={datos?.historial ?? null} vuelta={vueltaHistorial} />

      {modal && (
        <SolicitarResurtido
          abierto
          producto={{ codigo: modal.codigo, nombre: modal.nombre, descontinuado: modal.descontinuado, foto: modal.foto }}
          areaSugerida={modal.area}
          cantidadSugerida={Math.max(1, piezasDe(modal))}
          solicitudExistente={solicitudDe(modal)}
          alCerrar={() => setModal(null)}
          alSolicitar={alSolicitar}
        />
      )}
    </div>
  );
}

function TarjetaResurtir({
  f, piezas, alCambiarPiezas, solicitud, puedeSolicitar, alPedir, enLista, alLista,
}: {
  f: FilaResurtido; piezas: number; alCambiarPiezas: (n: number) => void;
  solicitud: SolicitudLocal | null; puedeSolicitar: boolean; alPedir: () => void;
  enLista: boolean; alLista: () => void;
}) {
  const { ir } = usarNavegacion();
  const chip = CHIP_ESTADO[f.estado] ?? CHIP_ESTADO.ok;
  const sePuedeMover = SE_PUEDE_MOVER.has(f.accionTipo);
  const colorCobertura = f.estado === 'urgente' || f.estado === 'desfasado' ? 'text-error' : f.estado === 'bajo' ? 'text-secondary' : 'text-on-surface';
  let cobertura = coberturaTexto(f.coberturaDias);
  let coberturaDetalle = 'días de cobertura';
  if (f.piezasArea === null) { cobertura = '—'; coberturaDetalle = `sin contar en ${f.area}`; }
  else if (f.coberturaDias === null) { cobertura = '—'; coberturaDetalle = f.vendeAlDia > 0 ? 'sin cobertura' : 'no se vende aquí'; }
  else if (f.estado === 'desfasado') coberturaDetalle = 'según el sistema (dice 0 y se vende)';

  return (
    <article className="tarjeta flex flex-col gap-3 p-4" aria-label={`${f.nombre} para ${f.area}`}>
      <button type="button" onClick={() => ir(`/producto/${encodeURIComponent(f.codigo)}`)} className="flex items-start gap-3 text-left">
        <Foto url={f.foto} nombre={f.nombre} tamano="h-14 w-14" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-tight">{f.nombre}</span>
          <span className="block font-label text-xs text-on-surface-variant">{f.codigo} · {f.categoria}</span>
        </span>
      </button>

      <div className="flex flex-wrap gap-1.5">
        {f.descontinuado && <Badge condicion="descontinuado" />}
        <span className={`chip ${chip.clase}`}>{chip.texto}</span>
        <BadgePrioridad prioridad={f.prioridad} />
        {f.esCocina && <span className="chip bg-surface-container text-on-surface-variant">Cocina</span>}
      </div>

      <div>
        <p className="etiqueta">Para {f.area}</p>
        <p className={`text-3xl font-bold leading-none ${colorCobertura}`}>{cobertura}</p>
        <p className="text-xs text-on-surface-variant">{coberturaDetalle}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-container-low p-2">
          <p className="etiqueta truncate">En {f.area}</p>
          <p className="text-xl font-bold leading-tight">{f.piezasArea === null ? '—' : numero(f.piezasArea)}</p>
          <p className="text-xs text-on-surface-variant">{f.piezasArea === null ? 'sin contar' : f.apartadas > 0 ? `${numero(f.apartadas)} apartadas` : 'piezas'}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low p-2">
          <p className="etiqueta">Pzas/día</p>
          <p className="text-xl font-bold leading-tight">{porDia(f.vendeAlDia)}</p>
          <p className="text-xs text-on-surface-variant">{numero(f.vendidas14)} en 14 d</p>
        </div>
        <div className="rounded-lg bg-surface-container-low p-2">
          <p className="etiqueta">En Bodega</p>
          <p className="text-xl font-bold leading-tight">{f.enBodega === null ? '—' : numero(f.enBodega)}</p>
          <p className="text-xs text-on-surface-variant">{f.enBodega === null ? 'sin contar' : 'piezas'}</p>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-sm font-medium">
        <Icono nombre={f.accionTipo === 'contar' ? 'inventory_2' : 'local_shipping'} className="mt-0.5 text-[18px] text-primary" />
        <span>
          {f.accion}
          {f.accionNota && <span className="block text-xs font-normal text-on-surface-variant">{f.accionNota}</span>}
        </span>
      </p>

      {sePuedeMover && (
        <label className="flex items-center justify-between gap-3">
          <span className="etiqueta">Piezas a mover</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            value={piezas}
            onChange={e => alCambiarPiezas(Math.min(9999, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            className="w-28 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-right text-2xl font-bold"
          />
        </label>
      )}

      <div className="mt-auto grid grid-cols-1 gap-2">
        {solicitud ? (
          <p className="rounded-full bg-primary-fixed/70 px-4 py-2.5 text-center text-sm font-medium text-on-primary-fixed">
            Solicitado · pendiente en TC52
            <span className="block text-xs font-normal">#{solicitud.id} · {pzas(solicitud.cantidad)}{solicitud.creado && ` · ${fechaTexto(solicitud.creado)}`}</span>
          </p>
        ) : f.descontinuado ? (
          <p className="px-2 text-center text-xs text-on-surface-variant">Descontinuado: no se resurte.</p>
        ) : puedeSolicitar && sePuedeMover ? (
          <button type="button" onClick={alPedir} className="boton-lleno py-2.5">
            <Icono nombre="local_shipping" className="text-[18px]" />
            Solicitar resurtido
          </button>
        ) : null}
        <button type="button" onClick={alLista} aria-pressed={enLista} className={`boton-suave py-2.5 ${enLista ? '!border-primary !bg-primary-fixed/60 !text-on-primary-fixed' : ''}`}>
          <Icono nombre={enLista ? 'check_box' : 'check_box_outline_blank'} className="text-[18px]" />
          {enLista ? 'En mi lista · quitar' : 'Agregar a mi lista'}
        </button>
      </div>
    </article>
  );
}

function SeccionMiLista({
  lista, palomear, quitar, limpiar, imprimir,
}: {
  lista: ArticuloMiLista[]; palomear: (codigo: string, area: string) => void;
  quitar: (codigo: string, area: string) => void; limpiar: () => void; imprimir: () => void;
}) {
  const hechos = lista.filter(a => a.palomeado).length;
  return (
    <section className={`tarjeta p-4 ${claseImpresion()}`} aria-label={ETIQUETA_MI_LISTA}>
      <TituloSeccion
        texto={ETIQUETA_MI_LISTA}
        detalle="Se guarda solo en este navegador; el de bodega no la ve. Para eso está Solicitar resurtido."
        derecha={lista.length > 0 && (
          <div className="no-imprimir flex shrink-0 gap-2">
            <button type="button" onClick={imprimir} className="boton-suave py-2 text-sm">Imprimir</button>
            <button type="button" onClick={() => { if (window.confirm('¿Vaciar mi lista (en este teléfono)?')) limpiar(); }} className="boton-suave py-2 text-sm">Vaciar</button>
          </div>
        )}
      />
      <p className="solo-impresion hidden text-xs text-on-surface-variant">Impresa el {new Date().toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
      {!lista.length ? (
        <p className="py-3 text-sm text-on-surface-variant">Todavía no agregas nada. Toca "Agregar a mi lista" en un producto.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-on-surface-variant">{numero(hechos)} de {numero(lista.length)} palomeados</p>
          <ul className="divide-y divide-outline-variant/40">
            {lista.map(a => (
              <li key={llaveDe(a.codigo, a.area)} className={`flex items-center gap-2 py-2 ${a.palomeado ? 'opacity-55' : ''}`}>
                <button
                  type="button"
                  onClick={() => palomear(a.codigo, a.area)}
                  aria-pressed={a.palomeado}
                  aria-label={a.palomeado ? 'Quitar palomita' : 'Palomear'}
                  className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center text-primary"
                >
                  <Icono nombre={a.palomeado ? 'check_box' : 'check_box_outline_blank'} className="text-[26px]" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium leading-tight ${a.palomeado ? 'line-through' : ''}`}>{a.nombre}</span>
                  <span className="block font-label text-xs text-on-surface-variant">{a.codigo} · hacia {a.area}</span>
                  {a.accion && <span className="block text-xs text-on-surface-variant">{a.accion}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block text-2xl leading-none">{numero(a.piezas)}</strong>
                  <span className="etiqueta">pzas</span>
                </span>
                <button type="button" onClick={() => quitar(a.codigo, a.area)} className="no-imprimir boton-suave px-3 py-1.5 text-xs">Quitar</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Historial({ habilitado, conteo, vuelta }: { habilitado: boolean; conteo: RespuestaResurtir['historial']; vuelta: number }) {
  return (
    <section aria-label="Historial de resurtido">
      <TituloSeccion texto="Historial de resurtido" detalle="Solicitudes que viven en el admin: bodega las hace con la TC52 y ahí se cierran o se cancelan." />
      {habilitado
        ? <HistorialLista conteo={conteo} vuelta={vuelta} />
        : <p className="tarjeta p-4 text-sm text-on-surface-variant">El sistema admin no está conectado ahora: no se puede ver el historial ni crear solicitudes. Vuelve a intentar en un momento.</p>}
    </section>
  );
}

function HistorialLista({ conteo, vuelta }: { conteo: RespuestaResurtir['historial']; vuelta: number }) {
  const [pestana, setPestana] = useState<Pestana>('pendiente');
  const traer = useCallback(() => api.solicitudes({ estado: pestana, limit: 50 }), [pestana]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [pestana, vuelta]);
  const { ir } = usarNavegacion();

  // Los conteos del admin (si contestó) mandan sobre los del snapshot.
  const cuenta = (p: Pestana) => datos?.conteo?.[p] ?? (conteo ? conteo[p === 'pendiente' ? 'pendientes' : p === 'hecha' ? 'hechas' : 'canceladas'] : undefined);
  const con = (texto: string, n: number | undefined) => (n === undefined ? texto : `${texto} (${numero(n)})`);
  const lista = datos?.solicitudes ?? [];

  return (
    <div className="space-y-3">
      <Opciones
        valor={pestana}
        alElegir={setPestana}
        opciones={[
          { valor: 'pendiente', texto: con('Pendientes', cuenta('pendiente')) },
          { valor: 'hecha', texto: con('Hechas', cuenta('hecha')) },
          { valor: 'cancelada', texto: con('Canceladas', cuenta('cancelada')) },
        ]}
      />
      <EstadoCarga cargando={cargando} calculando={calculando} error={error} reintentar={reintentar} hayDatos={!!datos}>
        {!lista.length ? (
          <p className="py-4 text-center text-sm text-on-surface-variant">
            {pestana === 'pendiente' ? 'No hay solicitudes pendientes.' : pestana === 'hecha' ? 'Todavía no hay solicitudes hechas.' : 'No hay solicitudes canceladas.'}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {lista.map(s => (
              <li key={s.id} className="tarjeta flex flex-col gap-1.5 p-3">
                <button type="button" onClick={() => ir(`/producto/${encodeURIComponent(s.codigo_barras)}`)} className="flex items-start gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{s.nombre_mostrar || s.codigo_barras}</span>
                    <span className="block font-label text-xs text-on-surface-variant">{s.codigo_barras} · #{s.id}{s.origen === 'invetory' && ' · desde esta app'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block text-2xl leading-none">{numero(s.cantidad)}</strong>
                    <span className="etiqueta">pzas</span>
                  </span>
                </button>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icono nombre="local_shipping" className="text-[18px] text-primary" />
                  {s.de_ubicacion} → {s.a_ubicacion}
                </p>
                <p className="text-xs text-on-surface-variant">Pidió {s.solicitado_por || 'alguien'} · {fechaTexto(s.creado)}</p>
                {s.estado === 'hecha' && (
                  <p className="text-xs font-medium text-primary">
                    La TC52 la cerró {s.hecha_en ? fechaTexto(s.hecha_en) : ''}{s.hecha_por && ` (${s.hecha_por})`}
                    {s.cantidad_hecha !== null && s.cantidad_hecha !== s.cantidad && ` · se movieron ${numero(s.cantidad_hecha)}`}
                  </p>
                )}
                {s.estado === 'cancelada' && (
                  <p className="text-xs font-medium text-error">
                    Cancelada {s.cancelada_en ? fechaTexto(s.cancelada_en) : ''}{s.motivo_cancelacion && `: ${s.motivo_cancelacion}`}
                  </p>
                )}
                {s.estado === 'pendiente' && <p className="text-xs text-on-surface-variant">Pendiente en la TC52</p>}
                {s.nota && <p className="text-xs italic text-on-surface-variant">"{s.nota}"</p>}
              </li>
            ))}
          </ul>
        )}
      </EstadoCarga>
    </div>
  );
}
