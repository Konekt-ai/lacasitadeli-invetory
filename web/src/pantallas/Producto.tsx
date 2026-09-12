import React, { useCallback } from 'react';
import { api } from '../api';
import { Aviso, Cargando, Foto, Icono, Vacio, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';

export function Producto({ codigo }: { codigo: string }) {
  const { ir } = usarNavegacion();
  const traer = useCallback(() => api.producto(codigo), [codigo]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [codigo]);
  const p = datos?.producto ?? null;

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
        <Aviso texto={error} />
        <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
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

  const gemelo = p.duplicado?.codigo ?? '';

  return (
    <div className="space-y-4">
      <Volver />

      <div className="tarjeta p-4">
        <div className="flex gap-4">
          <Foto url={p.foto} nombre={p.nombre} tamano="h-24 w-24" />
          <div className="min-w-0 flex-1">
            <h2 className="titulo text-xl leading-tight">{p.nombre}</h2>
            <p className="mt-1 font-label text-sm text-on-surface-variant">{p.codigo}</p>
            {(p.categoria || p.marca) && (
              <p className="mt-1 text-sm text-on-surface-variant">{[p.marca, p.categoria].filter(Boolean).join(' · ')}</p>
            )}
            <span className="chip mt-2 bg-surface-container text-on-surface-variant">{p.etiqueta}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Dato titulo="En la tienda" valor={numero(p.piezas)} detalle="piezas" />
          <Dato titulo="7 días" valor={numero(p.vendidas.d7)} detalle="vendidas" />
          <Dato titulo="30 días" valor={numero(p.vendidas.d30)} detalle="vendidas" />
        </div>

        <div className="mt-4 space-y-1 text-sm text-on-surface-variant">
          <p className="flex items-center gap-2"><Icono nombre="sell" className="text-[18px]" />{p.ventaTexto}</p>
          {p.entradaTexto && <p className="flex items-center gap-2"><Icono nombre="local_shipping" className="text-[18px]" />{p.entradaTexto}</p>}
          {p.apartadas > 0 && <p className="flex items-center gap-2"><Icono nombre="inventory_2" className="text-[18px]" />{numero(p.apartadas)} piezas apartadas por pedidos de la página</p>}
        </div>

        {p.duplicado && (
          <div className="mt-3 rounded-lg bg-primary-fixed/60 px-3 py-2 text-sm text-on-primary-fixed">
            {p.duplicado.texto}
            <button
              type="button"
              onClick={() => ir(`/producto/${encodeURIComponent(gemelo)}`)}
              className="ml-1 underline"
            >
              ver ese
            </button>
          </div>
        )}
        {p.desfase && <div className="mt-3"><Aviso texto={`Inventario desfasado. ${p.desfase.texto}`} /></div>}
        {!p.alta && <div className="mt-3"><Aviso tono="aviso" texto="Este código no está dado de alta en la caja: no se puede cobrar bien y por eso nunca aparece vendido." /></div>}
      </div>

      <section>
        <h3 className="etiqueta mb-2">Dónde hay</h3>
        <div className="space-y-2">
          {(p.areasTodas ?? []).map(a => (
            <div key={a.area} className="tarjeta flex items-center gap-3 p-3">
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{a.area}</p>
                <p className="text-xs text-on-surface-variant">
                  {a.contado
                    ? <>{a.entradaTexto ? `Última entrada: ${a.entradaTexto}` : 'Contado con la TC52'}{a.apartadas > 0 && ` · ${numero(a.apartadas)} apartadas`}</>
                    : 'Nunca se ha contado aquí'}
                </p>
                {a.desfase > 0 && (
                  <p className="text-xs font-medium text-error">
                    Desfasado: {numero(a.desfase)} vendidas con 0 en sistema{a.desfaseDesde && ` desde el ${a.desfaseDesde}`}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-right">
                {a.contado
                  ? <><strong className="text-lg leading-none">{numero(a.piezas)}</strong><span className="etiqueta block">piezas</span></>
                  : <span className="text-sm text-on-surface-variant">sin contar</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {!!p.resurtido?.length && (
        <section>
          <h3 className="etiqueta mb-2">Para surtir el anaquel</h3>
          <div className="space-y-2">
            {p.resurtido.map(r => (
              <div key={r.area} className="tarjeta p-3">
                <p className="font-medium">{r.area}</p>
                <p className="text-sm text-on-surface-variant">
                  Vende {r.vendeAlDia.toFixed(1)} al día
                  {r.coberturaDias !== null && ` · alcanza para ${r.coberturaDias} días`}
                  {r.sugerido > 0 && ` · faltan ${numero(r.sugerido)}`}
                </p>
                <p className="mt-1 text-sm font-medium">{r.accion}</p>
                {r.accionNota && <p className="text-xs text-on-surface-variant">{r.accionNota}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-2">
      <p className="etiqueta">{titulo}</p>
      <p className="text-xl font-bold leading-tight">{valor}</p>
      <p className="text-xs text-on-surface-variant">{detalle}</p>
    </div>
  );
}

function Volver() {
  const { ir } = usarNavegacion();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : ir('/'))} className="flex items-center gap-1 text-sm text-on-surface-variant">
      <Icono nombre="arrow_back" className="text-[18px]" />
      Volver
    </button>
  );
}
