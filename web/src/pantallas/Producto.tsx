import React, { useCallback, useState } from 'react';
import { api, type Estado, type ProductoDetalle, type Solicitud } from '../api';
import { BadgePrioridad, Badges } from '../componentes/Badge';
import {
  Aviso, Cargando, Dato, ErrorConReintento, Foto, Icono, Seccion, Tendencia, Vacio, Volver,
  decimal, fechaCorta, numero, textoHace, usarNavegacion,
} from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { SolicitarResurtido } from '../componentes/SolicitarResurtido';

/** De dónde salió la categoría, cuando no es la de la caja. */
const FUENTE_CATEGORIA: Record<ProductoDetalle['categoriaFuente'], string | null> = {
  caja: null,
  admin: 'categoría puesta en el Admin',
  shopify: 'categoría de la página web',
  ninguna: 'sin categoría en la caja',
};

const ESTADO_SOLICITUD: Record<Solicitud['estado'], { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente en TC52', clase: 'bg-secondary-fixed text-on-secondary-fixed' },
  hecha: { texto: 'Hecha', clase: 'bg-primary-fixed text-on-primary-fixed' },
  cancelada: { texto: 'Cancelada', clase: 'bg-surface-variant text-on-surface-variant' },
};

function iconoMovimiento(tipo: string): string {
  const t = (tipo || '').toLowerCase();
  if (t.includes('entrada') || t.includes('recep')) return 'move_to_inbox';
  if (t.includes('salida') || t.includes('venta')) return 'outbox';
  if (t.includes('trasl') || t.includes('transf')) return 'swap_horiz';
  if (t.includes('merma') || t.includes('baja')) return 'delete';
  if (t.includes('conteo') || t.includes('ajuste')) return 'checklist';
  return 'history';
}

/** Ficha de un producto: todo lo de la tarjeta y más, sin dinero. */
export function Producto({ codigo, estado }: { codigo: string; estado: Estado | null }) {
  const { ir } = usarNavegacion();
  const traer = useCallback(() => api.producto(codigo), [codigo]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [codigo]);
  const p = datos?.producto ?? null;

  // Modal de "Solicitar resurtido" (área y piezas sugeridas) y lo que se acaba
  // de pedir desde aquí, por si el admin tarda en reflejarlo al recargar.
  const [modal, setModal] = useState<{ area: string; cantidad: number } | null>(null);
  const [recienPedidas, setRecienPedidas] = useState<Record<string, Solicitud>>({});

  if (calculando) {
    return (
      <div className="space-y-4">
        <Volver />
        <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />
      </div>
    );
  }
  if (cargando && !p) return <Cargando />;
  if (error) {
    // Un error de red NO es "no existe el producto": eso confundía de más.
    return (
      <div className="space-y-4">
        <Volver />
        <ErrorConReintento texto={error} reintentar={reintentar} />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="space-y-4">
        <Volver />
        <Vacio titulo="No se encontró ese producto" detalle="Puede que ese código no esté contado ni se haya vendido últimamente." />
      </div>
    );
  }

  const umbrales = estado?.umbrales;
  const puedeSolicitar = !!estado?.capacidades?.solicitudes && !p.descontinuado;
  const pendienteEn = (area: string): Solicitud | null =>
    recienPedidas[area] ?? (p.solicitudes ?? []).find(s => s.estado === 'pendiente' && s.a_ubicacion === area) ?? null;
  const fuente = FUENTE_CATEGORIA[p.categoriaFuente] ?? null;
  const areasVenta = estado?.areasVenta ?? [];
  const gemelo = p.duplicado?.codigo ?? '';
  const coberturaUrgente = umbrales?.coberturaUrgenteDias ?? 2;

  return (
    <div className="space-y-4">
      <Volver />

      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div className={`tarjeta p-4 ${p.descontinuado ? 'border-on-surface/60' : ''}`}>
        <div className="flex gap-4">
          <Foto url={p.foto} nombre={p.nombre} tamano="h-28 w-28 sm:h-36 sm:w-36" />
          <div className="min-w-0 flex-1">
            <h2 className="titulo text-2xl leading-tight lg:text-3xl">{p.nombre}</h2>
            <p className="mt-1 font-label text-sm text-on-surface-variant">
              {p.codigo}{p.artCodigo && p.artCodigo !== p.codigo ? ` · en caja: ${p.artCodigo}` : ''}
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {p.categoria}{p.subcategoria ? ` › ${p.subcategoria}` : ''}{fuente ? ` (${fuente})` : ''}
              {p.marca ? ` · ${p.marca}` : ''}{p.esCocina ? ' · Cocina' : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badges condiciones={p.condiciones} max={20} grande />
              <BadgePrioridad prioridad={p.prioridad} />
            </div>
          </div>
        </div>

        {p.descontinuado && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-[#1c1c19] px-4 py-3 text-white">
            <Icono nombre="block" className="shrink-0 text-[26px]" />
            <div>
              <p className="text-lg font-bold leading-tight">Descontinuado</p>
              <p className="text-sm opacity-90">
                {p.descontinuadoDesde
                  ? `Descontinuado desde el ${fechaCorta(p.descontinuadoDesde)} (lo marcó el Admin).`
                  : 'Lo marcó el Admin.'}
                {' '}No se pide resurtido.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Dato titulo="Piezas en tienda" valor={numero(p.piezas)} detalle="contadas con la TC52" />
          <Dato titulo="Apartadas" valor={numero(p.apartadas)} detalle="por pedidos de la página" />
          <Dato titulo="Pzas/día" valor={decimal(p.ventaDiaria, 1)} detalle={`promedio de ${umbrales?.ventanaVentaDiariaDias ?? 14} días`} />
          <Dato
            titulo="Cobertura"
            valor={p.coberturaDias === null ? '—' : `${decimal(p.coberturaDias, 1)} d`}
            detalle={p.coberturaDias === null ? 'no se vende' : 'en el anaquel más corto'}
            tono={p.coberturaDias !== null && p.coberturaDias < coberturaUrgente ? 'alerta' : 'normal'}
          />
          <Dato titulo="Rotación" valor={decimal(p.rotacion, 2)} detalle="vendidas en 30 d ÷ piezas" />
          <Dato
            titulo="Última venta"
            valor={textoHace(p.diasSinVenta)}
            detalle={p.ultimaVenta ? fechaCorta(p.ultimaVenta, { hora: true }) : p.ventaTexto}
          />
          <Dato
            titulo="Última entrada"
            valor={p.ultimaEntrada ? fechaCorta(p.ultimaEntrada) : '—'}
            detalle={p.primeraVez ? `contado desde el ${fechaCorta(p.primeraVez)}` : undefined}
          />
          <Dato titulo="Tendencia 7 d" valor={<Tendencia valor={p.tendencia.d7} />} detalle="vs los 7 días anteriores" />
          <Dato titulo="Tendencia 30 d" valor={<Tendencia valor={p.tendencia.d30} />} detalle="vs los 30 días anteriores" />
          <Dato titulo="Tendencia 90 d" valor={<Tendencia valor={p.tendencia.d90} />} detalle="vs los 90 días anteriores" />
        </div>

        {p.duplicado && (
          <div className="mt-3 rounded-lg bg-[#ffedd5] px-3 py-2 text-sm text-[#9a3412]">
            {p.duplicado.texto}
            <button type="button" onClick={() => ir(`/producto/${encodeURIComponent(gemelo)}`)} className="ml-1 underline">
              ver ese
            </button>
          </div>
        )}
        {p.desfase && <div className="mt-3"><Aviso texto={`Inventario desfasado. ${p.desfase.texto}`} /></div>}
        {!p.alta && (
          <div className="mt-3">
            <Aviso tono="aviso" texto="Este código no está dado de alta en la caja: no se puede cobrar bien y por eso nunca aparece vendido." />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {/* ── Dónde hay ──────────────────────────────────────────────── */}
          <Seccion titulo="Dónde hay">
            <div className="space-y-2">
              {(p.areasTodas ?? []).map(a => (
                <div key={a.area} className="tarjeta flex items-center gap-3 p-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{a.area}</p>
                    <p className="text-xs text-on-surface-variant">
                      {a.contado
                        ? <>
                            {a.entradaTexto ? `Última entrada: ${a.entradaTexto}` : 'Contado con la TC52'}
                            {a.apartadas > 0 ? ` · ${numero(a.apartadas)} apartadas` : ''}
                            {a.cobertura !== null ? ` · alcanza ${decimal(a.cobertura, 1)} d` : ''}
                          </>
                        : 'Nunca se ha contado aquí (no es lo mismo que 0)'}
                    </p>
                    {a.desfase > 0 && (
                      <p className="text-xs font-medium text-error">
                        Desfasado: {numero(a.desfase)} vendidas con 0 en sistema{a.desfaseDesde ? ` desde el ${fechaCorta(a.desfaseDesde)}` : ''}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right">
                    {a.contado
                      ? <><strong className="numero-grande block">{numero(a.piezas)}</strong><span className="etiqueta block">piezas</span></>
                      : <span className="text-sm text-on-surface-variant">sin contar</span>}
                  </span>
                </div>
              ))}
              {!(p.areasTodas ?? []).length && <p className="text-sm text-on-surface-variant">No está contado en ninguna área.</p>}
            </div>
          </Seccion>

          {/* ── Unidades vendidas ──────────────────────────────────────── */}
          <Seccion titulo="Unidades vendidas">
            <div className="grid grid-cols-3 gap-2">
              <Dato titulo="7 días" valor={numero(p.vendidas.d7)} detalle="piezas en total" />
              <Dato titulo="30 días" valor={numero(p.vendidas.d30)} detalle="piezas en total" />
              <Dato titulo="90 días" valor={numero(p.vendidas.d90)} detalle="piezas en total" />
            </div>
            {(p.vendidas.d180 !== undefined || p.vendidas.d120 !== undefined) && (
              <p className="mt-2 text-xs text-on-surface-variant">
                120 días: {numero(p.vendidas.d120)}
                {p.vendidas.d180 !== undefined ? ` · 180 días: ${numero(p.vendidas.d180)}` : ''}
              </p>
            )}
            <p className="mb-1 mt-3 etiqueta">Por área, últimos 14 días</p>
            <div className="tarjeta divide-y divide-outline-variant/40">
              {(p.areasTodas ?? [])
                .filter(a => a.vendidas14 > 0 || areasVenta.includes(a.area))
                .map(a => (
                  <div key={a.area} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.area}
                    </span>
                    <strong className="tabular-nums">{numero(a.vendidas14)}</strong>
                  </div>
                ))}
              {!(p.areasTodas ?? []).some(a => a.vendidas14 > 0 || areasVenta.includes(a.area)) && (
                <p className="px-3 py-2.5 text-sm text-on-surface-variant">Sin ventas en los últimos 14 días.</p>
              )}
            </div>
          </Seccion>
        </div>

        <div className="space-y-4">
          {/* ── Para surtir el anaquel ─────────────────────────────────── */}
          <Seccion titulo="Para surtir el anaquel">
            <div className="space-y-2">
              {(p.resurtido ?? []).map(r => {
                const pendiente = pendienteEn(r.area);
                return (
                  <div key={r.area} className="tarjeta p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{r.area}</p>
                        <p className="text-sm text-on-surface-variant">
                          Vende {decimal(r.vendeAlDia, 1)} al día
                          {r.coberturaDias !== null ? ` · alcanza ${decimal(r.coberturaDias, 1)} d` : ''}
                        </p>
                      </div>
                      {r.sugerido > 0 && (
                        <span className="shrink-0 text-right">
                          <strong className="numero-grande block">{numero(r.sugerido)}</strong>
                          <span className="etiqueta block">a mover</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium">{r.accion}</p>
                    {r.accionNota && <p className="text-xs text-on-surface-variant">{r.accionNota}</p>}

                    {pendiente ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-secondary-fixed px-3 py-1.5 text-sm font-medium text-on-secondary-fixed">
                        <Icono nombre="pending" className="text-[18px]" />
                        Solicitado · pendiente en TC52 ({numero(pendiente.cantidad)} pzas)
                      </p>
                    ) : puedeSolicitar && r.accionTipo !== 'pedir' && (
                      <button
                        type="button"
                        onClick={() => setModal({ area: r.area, cantidad: r.sugerido })}
                        className="boton-lleno toque mt-2 w-full sm:w-auto"
                      >
                        <Icono nombre="local_shipping" className="text-[20px]" />
                        Solicitar resurtido
                      </button>
                    )}
                  </div>
                );
              })}
              {!(p.resurtido ?? []).length && (
                <p className="text-sm text-on-surface-variant">Este producto no se vende en ninguna área de venta, así que no hay nada que surtir.</p>
              )}
              {estado && !estado.capacidades.solicitudes && !p.descontinuado && (
                <p className="text-xs text-on-surface-variant">El sistema admin no responde: ahora no se pueden pedir resurtidos.</p>
              )}
            </div>
          </Seccion>

          {/* ── Últimos movimientos ────────────────────────────────────── */}
          <Seccion titulo="Últimos movimientos">
            {(p.movimientos ?? []).length ? (
              <div className="tarjeta divide-y divide-outline-variant/40">
                {p.movimientos.map((m, i) => (
                  <div key={`${m.fecha}-${i}`} className="flex items-start gap-3 p-3">
                    <Icono nombre={iconoMovimiento(m.tipo)} className="mt-0.5 shrink-0 text-[20px] text-on-surface-variant" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{m.texto}</p>
                      <p className="text-xs text-on-surface-variant">
                        {m.fechaTexto || fechaCorta(m.fecha, { hora: true })}
                        {m.area ? ` · ${m.area}` : ''}
                        {m.stockDespues !== null ? ` · quedan ${numero(m.stockDespues)}` : ''}
                      </p>
                    </div>
                    <strong className="shrink-0 tabular-nums">{numero(m.cantidad)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">Sin movimientos registrados en bodega.</p>
            )}
          </Seccion>

          {/* ── Solicitudes de resurtido ───────────────────────────────── */}
          <Seccion titulo="Solicitudes de resurtido">
            <div className="space-y-2">
              {(p.solicitudes ?? []).map(s => {
                const est = ESTADO_SOLICITUD[s.estado] ?? { texto: s.estado, clase: 'bg-surface-variant text-on-surface-variant' };
                return (
                  <div key={s.id} className="tarjeta p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`chip ${est.clase}`}>{est.texto}</span>
                      <strong className="tabular-nums">
                        {numero(s.cantidad)} pzas
                        {s.cantidad_hecha !== null && s.cantidad_hecha !== s.cantidad ? ` (se movieron ${numero(s.cantidad_hecha)})` : ''}
                      </strong>
                    </div>
                    <p className="mt-1 text-sm">{s.de_ubicacion} → {s.a_ubicacion}</p>
                    <p className="text-xs text-on-surface-variant">
                      Pidió {s.solicitado_por ?? s.origen} · {fechaCorta(s.creado, { hora: true })}
                      {s.hecha_en ? ` · la hizo ${s.hecha_por ?? 'bodega'} el ${fechaCorta(s.hecha_en, { hora: true })}` : ''}
                      {s.cancelada_en ? ` · cancelada el ${fechaCorta(s.cancelada_en, { hora: true })}${s.motivo_cancelacion ? `: ${s.motivo_cancelacion}` : ''}` : ''}
                    </p>
                    {s.nota && <p className="mt-1 text-xs italic text-on-surface-variant">{s.nota}</p>}
                  </div>
                );
              })}
              {!(p.solicitudes ?? []).length && (
                <p className="text-sm text-on-surface-variant">Sin solicitudes de resurtido para este producto.</p>
              )}
            </div>
          </Seccion>
        </div>
      </div>

      {modal && (
        <SolicitarResurtido
          abierto
          producto={{ codigo: p.codigo, nombre: p.nombre, descontinuado: p.descontinuado, foto: p.foto }}
          areaSugerida={modal.area}
          cantidadSugerida={modal.cantidad > 0 ? modal.cantidad : undefined}
          solicitudExistente={null}
          alCerrar={() => setModal(null)}
          alSolicitar={solicitud => {
            setRecienPedidas(prev => ({ ...prev, [modal.area]: solicitud }));
            setModal(null);
            reintentar();
          }}
        />
      )}
    </div>
  );
}
