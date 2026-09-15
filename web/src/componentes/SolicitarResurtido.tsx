import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SinSesion, SolicitudDuplicada, api, type Solicitud, type Sugerencia } from '../api';
import { Aviso, Cargando, Foto, Icono, numero } from './basicos';
import { fechaTexto, porDia, pzas } from './formato';

/**
 * Modal "Solicitar resurtido": la ÚNICA acción sobre el inventario. Crea una
 * solicitud en el admin (POST /api/solicitudes) que el de bodega ejecuta con la
 * TC52; cuando registra el traslado, la solicitud se cierra sola.
 *
 * Esta es la interfaz que comparten Producto.tsx (ficha) y Resurtir.tsx.
 */
export type PropsSolicitarResurtido = {
  abierto: boolean;
  producto: { codigo: string; nombre: string; descontinuado?: boolean; foto?: string | null };
  /** Área de venta hacia donde se sugiere mover (p. ej. "Casita 1"). */
  areaSugerida?: string;
  /** Piezas sugeridas (editable en el modal). */
  cantidadSugerida?: number;
  /** Solicitud pendiente que ya existe para este producto+área, si se sabe. */
  solicitudExistente?: { id: number; cantidad: number; creado: string } | null;
  alCerrar: () => void;
  /** Se llama cuando el admin confirmó la solicitud (o cuando ya existía una: 409). */
  alSolicitar: (solicitud: Solicitud, yaExistia: boolean) => void;
};

export function SolicitarResurtido(props: PropsSolicitarResurtido) {
  // La hoja se monta al abrir y se desmonta al cerrar: así cada vez arranca
  // con el estado limpio (sin sugerencias ni errores de la vez pasada).
  if (!props.abierto) return null;
  return <Hoja {...props} />;
}

type Paso = 'formulario' | 'confirmar' | 'enviando' | 'listo' | 'duplicada' | 'error';
const MAX_PIEZAS = 9999;
const MAX_NOTA = 200;

const limpiarPiezas = (v: unknown) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_PIEZAS, Math.max(0, n));
};

const CAMPO = 'mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-base disabled:opacity-60';

function Hoja({ producto, areaSugerida, cantidadSugerida, solicitudExistente, alCerrar, alSolicitar }: PropsSolicitarResurtido) {
  const [ubicaciones, setUbicaciones] = useState<{ venta: string[]; respaldo: string[] } | null>(null);
  const [cargandoUbic, setCargandoUbic] = useState(true);
  const [errorUbic, setErrorUbic] = useState('');
  const [vueltaUbic, setVueltaUbic] = useState(0);
  const [hacia, setHacia] = useState(areaSugerida ?? '');
  const [desde, setDesde] = useState('Bodega');
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [cargandoSug, setCargandoSug] = useState(false);
  const [sinSugerencia, setSinSugerencia] = useState(false);
  const [piezas, setPiezas] = useState(String(limpiarPiezas(cantidadSugerida) || 1));
  const tocoPiezas = useRef(false);   // si el dueño ya escribió un número, la sugerencia no se lo pisa
  const [nota, setNota] = useState('');
  const [paso, setPaso] = useState<Paso>('formulario');
  const [errorEnvio, setErrorEnvio] = useState('');
  const [resultado, setResultado] = useState<{ solicitud: Solicitud; aviso: string | null } | null>(null);
  const [duplicada, setDuplicada] = useState<{ texto: string; existente: Solicitud | null } | null>(null);

  const descontinuado = !!producto.descontinuado;
  const yaExiste = !descontinuado && !!solicitudExistente;

  // Sin scroll de fondo mientras la hoja está abierta, y Escape la cierra.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && paso !== 'enviando') alCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla); };
  }, [alCerrar, paso]);

  // 1) Ubicaciones del admin: "Hacia" solo áreas de venta, "Desde" solo respaldo.
  useEffect(() => {
    if (descontinuado || yaExiste) { setCargandoUbic(false); return undefined; }
    let vivo = true;
    setCargandoUbic(true);
    setErrorUbic('');
    api.ubicacionesSolicitud()
      .then(u => {
        if (!vivo) return;
        const todas = u.todas ?? [];
        const venta = u.venta?.length ? u.venta : todas;
        const respaldo = u.respaldo?.length ? u.respaldo : todas.filter(x => !venta.includes(x));
        setUbicaciones({ venta, respaldo });
        setHacia(h => (h && venta.includes(h) ? h : areaSugerida && venta.includes(areaSugerida) ? areaSugerida : venta[0] ?? ''));
        setDesde(d => (d && respaldo.includes(d) ? d : respaldo.includes('Bodega') ? 'Bodega' : respaldo[0] ?? 'Bodega'));
      })
      .catch(e => {
        if (!vivo) return;
        if (e instanceof SinSesion) { alCerrar(); return; }
        setErrorUbic(e?.message || 'No se pudieron traer las ubicaciones del admin.');
      })
      .finally(() => { if (vivo) setCargandoUbic(false); });
    return () => { vivo = false; };
  }, [descontinuado, yaExiste, areaSugerida, alCerrar, vueltaUbic]);

  // 2) Sugerencia del admin para ese destino/origen (si falla, se usa la de la tarjeta).
  useEffect(() => {
    if (!ubicaciones || !hacia || !desde || hacia === desde) return undefined;
    let vivo = true;
    setCargandoSug(true);
    api.sugerencia(producto.codigo, hacia, desde)
      .then(s => {
        if (!vivo) return;
        setSugerencia(s);
        setSinSugerencia(false);
        if (!tocoPiezas.current) {
          const deTarjeta = limpiarPiezas(cantidadSugerida);
          const base = s.sugerido > 0 ? s.sugerido : deTarjeta > 0 ? deTarjeta : s.sugerido_sin_tope > 0 ? s.sugerido_sin_tope : 1;
          setPiezas(String(Math.min(MAX_PIEZAS, base)));
        }
      })
      .catch(e => {
        if (!vivo) return;
        if (e instanceof SinSesion) { alCerrar(); return; }
        setSugerencia(null);
        setSinSugerencia(true);
        if (!tocoPiezas.current) setPiezas(String(limpiarPiezas(cantidadSugerida) || 1));
      })
      .finally(() => { if (vivo) setCargandoSug(false); });
    return () => { vivo = false; };
  }, [ubicaciones, hacia, desde, producto.codigo, cantidadSugerida, alCerrar]);

  const n = limpiarPiezas(piezas);
  const notaLimpia = nota.trim();
  const problema = !hacia ? 'Elige hacia dónde va.'
    : !desde ? 'Elige desde dónde sale.'
      : hacia === desde ? 'Origen y destino tienen que ser distintos.'
        : n < 1 ? 'Pon cuántas piezas (mínimo 1).'
          : notaLimpia.length > MAX_NOTA ? `La nota es muy larga (máximo ${MAX_NOTA} letras).` : '';
  const stockOrigen = sugerencia?.stock_origen ?? null;
  const faltaEnOrigen = stockOrigen !== null && n > stockOrigen;

  const enviar = useCallback(async () => {
    setPaso('enviando');
    setErrorEnvio('');
    try {
      const r = await api.solicitarResurtido({
        codigo_barras: producto.codigo, a_ubicacion: hacia, de_ubicacion: desde, cantidad: n,
        ...(notaLimpia ? { nota: notaLimpia.slice(0, MAX_NOTA) } : {}),
      });
      setResultado({ solicitud: r.solicitud, aviso: r.aviso ?? null });
      setPaso('listo');
      alSolicitar(r.solicitud, false);
    } catch (e: unknown) {
      if (e instanceof SolicitudDuplicada) {
        const ex = e.existente;
        setDuplicada({ texto: ex ? `Ya hay una solicitud pendiente (#${ex.id}, ${pzas(ex.cantidad)})` : e.message, existente: ex });
        setPaso('duplicada');
        if (ex) alSolicitar(ex, true);
        return;
      }
      if (e instanceof SinSesion) { alCerrar(); return; }
      setErrorEnvio((e as Error)?.message || 'No se pudo mandar la solicitud.');
      setPaso('error');
    }
  }, [producto.codigo, hacia, desde, n, notaLimpia, alSolicitar, alCerrar]);

  const enFormulario = paso === 'formulario' || paso === 'confirmar' || paso === 'enviando' || paso === 'error';
  const bloqueado = paso !== 'formulario';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" onClick={() => { if (paso !== 'enviando') alCerrar(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-solicitar"
        onClick={e => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface-container-lowest p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:max-w-lg md:rounded-2xl md:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="titulo-solicitar" className="titulo text-xl leading-tight">Solicitar resurtido</h2>
            <p className="text-xs text-on-surface-variant">El de bodega lo verá en la TC52 y lo moverá</p>
          </div>
          <button type="button" onClick={alCerrar} disabled={paso === 'enviando'} className="boton-suave h-10 w-10 !px-0" aria-label="Cerrar">
            <Icono nombre="close" className="text-[20px]" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
          <Foto url={producto.foto ?? null} nombre={producto.nombre} tamano="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{producto.nombre}</p>
            <p className="font-label text-xs text-on-surface-variant">{producto.codigo}</p>
          </div>
        </div>

        {descontinuado && (
          <div className="mt-4 space-y-3">
            <span className="chip bg-[#1c1c19] px-3 py-1.5 text-sm text-white">Descontinuado</span>
            <Aviso texto="Producto descontinuado: no se resurte. Si se volvió a vender, quítale la marca en el Admin." />
            <button type="button" onClick={alCerrar} className="boton-suave w-full py-3">Cerrar</button>
          </div>
        )}

        {yaExiste && solicitudExistente && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-primary-fixed/60 px-4 py-3 text-sm text-on-primary-fixed">
              <p className="text-base font-bold">Solicitado · pendiente en TC52</p>
              <p className="mt-1">
                Ya hay una solicitud pendiente (#{solicitudExistente.id}, {pzas(solicitudExistente.cantidad)})
                {solicitudExistente.creado && <> desde el {fechaTexto(solicitudExistente.creado)}</>}.
                No se duplica: bodega la verá en la TC52.
              </p>
            </div>
            <button type="button" onClick={alCerrar} className="boton-suave w-full py-3">Entendido</button>
          </div>
        )}

        {!descontinuado && !yaExiste && enFormulario && (
          <>
            {cargandoUbic && <Cargando texto="Preguntando al admin las ubicaciones…" />}
            {!cargandoUbic && errorUbic && (
              <div className="mt-4 space-y-2">
                <Aviso texto={errorUbic} />
                <button type="button" onClick={() => setVueltaUbic(v => v + 1)} className="boton-suave w-full py-3">Reintentar</button>
              </div>
            )}
            {!cargandoUbic && ubicaciones && (
              <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); if (!problema && paso === 'formulario') setPaso('confirmar'); }}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="etiqueta">Hacia</span>
                    <select value={hacia} onChange={e => { setHacia(e.target.value); tocoPiezas.current = false; }} disabled={bloqueado} className={CAMPO}>
                      {!hacia && <option value="">Elige…</option>}
                      {ubicaciones.venta.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="etiqueta">Desde</span>
                    <select value={desde} onChange={e => { setDesde(e.target.value); tocoPiezas.current = false; }} disabled={bloqueado} className={CAMPO}>
                      {ubicaciones.respaldo.map(a => <option key={a} value={a}>{a}</option>)}
                      {desde && !ubicaciones.respaldo.includes(desde) && <option value={desde}>{desde}</option>}
                    </select>
                  </label>
                </div>

                {/* Lo que hay hoy y lo que se vende, para decidir cuántas pedir. */}
                <div className="rounded-xl border border-outline-variant/60 p-3 text-sm">
                  {cargandoSug && <p className="text-on-surface-variant">Calculando cuántas hacen falta…</p>}
                  {!cargandoSug && sugerencia && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <span className="text-on-surface-variant">En {desde}</span>
                      <strong className="text-right text-lg leading-tight">{numero(sugerencia.stock_origen)} <span className="text-xs font-normal">pzas</span></strong>
                      <span className="text-on-surface-variant">En {hacia}</span>
                      <strong className="text-right text-lg leading-tight">
                        {sugerencia.stock_destino === null
                          ? <span className="text-sm font-normal">sin contar</span>
                          : <>{numero(sugerencia.stock_destino)} <span className="text-xs font-normal">pzas</span></>}
                        {sugerencia.apartado_destino > 0 && <span className="block text-xs font-normal text-on-surface-variant">{numero(sugerencia.apartado_destino)} apartadas</span>}
                      </strong>
                      <span className="text-on-surface-variant">Se vende al día en {hacia}</span>
                      <strong className="text-right text-lg leading-tight">{porDia(sugerencia.venta_diaria)} <span className="text-xs font-normal">pzas</span></strong>
                      {sugerencia.cobertura_dias !== null && (
                        <>
                          <span className="text-on-surface-variant">Alcanza para</span>
                          <strong className="text-right">{numero(sugerencia.cobertura_dias)} días</strong>
                        </>
                      )}
                      <span className="text-on-surface-variant">Sugerido</span>
                      <strong className="text-right">
                        {pzas(sugerencia.sugerido)}
                        {sugerencia.sugerido_sin_tope > sugerencia.sugerido && (
                          <span className="block text-xs font-normal text-on-surface-variant">harían falta {numero(sugerencia.sugerido_sin_tope)}, pero en {desde} no hay más</span>
                        )}
                      </strong>
                    </div>
                  )}
                  {!cargandoSug && sinSugerencia && (
                    <p className="text-on-surface-variant">
                      El admin no contestó la sugerencia; se usa la de esta app
                      {limpiarPiezas(cantidadSugerida) > 0 && <>: {pzas(limpiarPiezas(cantidadSugerida))}</>}.
                    </p>
                  )}
                  {!cargandoSug && !sugerencia && !sinSugerencia && <p className="text-on-surface-variant">Elige hacia dónde y desde dónde.</p>}
                </div>

                <label className="block">
                  <span className="etiqueta">Piezas a mover</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PIEZAS}
                    step={1}
                    value={piezas}
                    onChange={e => { tocoPiezas.current = true; setPiezas(e.target.value); }}
                    disabled={bloqueado}
                    className={`${CAMPO} text-2xl font-bold`}
                  />
                </label>
                {faltaEnOrigen && <Aviso tono="aviso" texto={`En ${desde} solo hay ${pzas(stockOrigen ?? 0)}: el de bodega moverá lo que haya.`} />}

                <label className="block">
                  <span className="etiqueta">Nota (opcional)</span>
                  <input
                    type="text"
                    maxLength={MAX_NOTA}
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    disabled={bloqueado}
                    placeholder="Ej. la caja está abajo del anaquel 3"
                    className={CAMPO}
                  />
                  <span className="block text-right text-xs text-on-surface-variant">{nota.length}/{MAX_NOTA}</span>
                </label>

                {paso === 'formulario' && (
                  <>
                    {problema && <p className="text-sm text-error">{problema}</p>}
                    <button type="submit" disabled={!!problema || cargandoSug} className="boton-lleno w-full text-base">
                      <Icono nombre="local_shipping" className="text-[20px]" />
                      Solicitar resurtido
                    </button>
                  </>
                )}

                {paso === 'confirmar' && (
                  <div className="space-y-3 rounded-xl bg-secondary-fixed/60 p-4">
                    <p className="text-base font-medium text-on-secondary-fixed">
                      Se pedirá mover {pzas(n)} de {desde} a {hacia}. El de bodega lo verá en la TC52. ¿Continuar?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPaso('formulario')} className="boton-suave py-3">Volver</button>
                      <button type="button" onClick={enviar} className="boton-lleno py-3">Sí, continuar</button>
                    </div>
                  </div>
                )}

                {paso === 'enviando' && <Cargando texto="Mandando la solicitud al admin…" />}

                {paso === 'error' && (
                  <div className="space-y-2">
                    <Aviso texto={errorEnvio} />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPaso('formulario')} className="boton-suave py-3">Volver</button>
                      <button type="button" onClick={enviar} className="boton-lleno py-3">Reintentar</button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </>
        )}

        {paso === 'listo' && resultado && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-primary-fixed/60 px-4 py-3 text-on-primary-fixed">
              <p className="text-lg font-bold leading-tight">Solicitado · pendiente en TC52</p>
              <p className="mt-1 text-sm">
                #{resultado.solicitud.id}: mover {pzas(resultado.solicitud.cantidad)} de {resultado.solicitud.de_ubicacion} a {resultado.solicitud.a_ubicacion}.
                Se cierra sola cuando bodega registre el traslado.
              </p>
            </div>
            {resultado.aviso && <Aviso tono="aviso" texto={resultado.aviso} />}
            <button type="button" onClick={alCerrar} className="boton-lleno w-full py-3">Listo</button>
          </div>
        )}

        {paso === 'duplicada' && duplicada && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-secondary-fixed/60 px-4 py-3 text-on-secondary-fixed">
              <p className="text-lg font-bold leading-tight">{duplicada.texto}</p>
              {duplicada.existente && (
                <p className="mt-1 text-sm">
                  {duplicada.existente.de_ubicacion} → {duplicada.existente.a_ubicacion}
                  {duplicada.existente.solicitado_por && <> · pidió {duplicada.existente.solicitado_por}</>}
                  {duplicada.existente.creado && <> · {fechaTexto(duplicada.existente.creado)}</>}
                </p>
              )}
              <p className="mt-1 text-sm">Bodega la verá en la TC52; no hace falta pedirla otra vez.</p>
            </div>
            <button type="button" onClick={alCerrar} className="boton-suave w-full py-3">Entendido</button>
          </div>
        )}
      </div>
    </div>
  );
}
