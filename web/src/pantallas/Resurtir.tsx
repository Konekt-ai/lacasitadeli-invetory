import React, { useCallback, useState } from 'react';
import { api, type Estado, type FilaResurtido } from '../api';
import { Aviso, Cargando, Foto, Icono, Opciones, Vacio, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';

// Las palomitas se guardan SOLO en este celular (localStorage). El servidor no
// guarda nada: esta app no escribe en el negocio.
const LLAVE = 'invetory.surtidos';
const leerPalomeados = (): Record<string, number> => {
  try {
    const crudo = JSON.parse(localStorage.getItem(LLAVE) || '{}');
    const hace12h = Date.now() - 12 * 3_600_000;
    const limpio: Record<string, number> = {};
    for (const [k, v] of Object.entries(crudo)) if (Number(v) > hace12h) limpio[k] = Number(v);
    return limpio;
  } catch {
    return {};
  }
};

export function Resurtir({ estado }: { estado: Estado | null }) {
  const [area, setArea] = useState('');
  const [cocina, setCocina] = useState(false);
  const [sinConteo, setSinConteo] = useState(false);
  const [palomeados, setPalomeados] = useState<Record<string, number>>(leerPalomeados);

  const traer = useCallback(() => api.resurtido({ area, cocina, sinConteo }), [area, cocina, sinConteo]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [area, cocina, sinConteo]);

  const palomear = (llave: string) => {
    setPalomeados(prev => {
      const nuevo = { ...prev };
      if (nuevo[llave]) delete nuevo[llave]; else nuevo[llave] = Date.now();
      try { localStorage.setItem(LLAVE, JSON.stringify(nuevo)); } catch { /* modo privado */ }
      return nuevo;
    });
  };

  const areasVenta = estado?.areasVenta ?? [];

  return (
    <div className="space-y-4">
      <Opciones
        valor={area}
        alElegir={setArea}
        opciones={[{ valor: '', texto: 'Todo el anaquel' }, ...areasVenta.map(a => ({ valor: a, texto: a }))]}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cocina} onChange={e => setCocina(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
          Ver comida de cocina
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sinConteo} onChange={e => setSinConteo(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
          Ver lo que nunca se ha contado
        </label>
      </div>

      {error && (
        <div className="space-y-2">
          <Aviso texto={error} />
          <button type="button" onClick={reintentar} className="boton-suave w-full py-3">Volver a intentar</button>
        </div>
      )}

      {calculando && <Cargando texto="Estamos juntando la información del inventario. Tarda unos segundos." />}

      {!datos && cargando && !calculando && !error && <Cargando />}

      {datos && (
        <>
          <Grupo
            titulo="Urgente"
            detalle="Se acabó o alcanza para menos de 2 días"
            tono="error"
            filas={datos.urgentes}
            deEsos={datos.cuentas.urgentes}
            palomeados={palomeados}
            palomear={palomear}
          />
          <Grupo
            titulo="Desfasado: cuéntalo"
            detalle="El sistema dice 0 pero se sigue vendiendo. No lo pidas: cuéntalo con la TC52"
            tono="error"
            filas={datos.desfasados}
            deEsos={datos.cuentas.desfasados}
            palomeados={palomeados}
            palomear={palomear}
          />
          <Grupo
            titulo="Bajo"
            detalle="Alcanza para menos de una semana"
            tono="aviso"
            filas={datos.bajos}
            deEsos={datos.cuentas.bajos}
            palomeados={palomeados}
            palomear={palomear}
          />
          <Grupo
            titulo="Se vende pero no está contado"
            detalle="Hay que contarlo con la TC52 para saber cuánto queda"
            tono="normal"
            filas={datos.sinConteo}
            deEsos={datos.cuentas.sinConteo}
            palomeados={palomeados}
            palomear={palomear}
          />
          {!datos.urgentes.length && !datos.desfasados.length && !datos.bajos.length && !datos.sinConteo.length && (
            <Vacio icono="local_shipping" titulo="Nada urgente por ahora" detalle="El anaquel está surtido según las ventas de los últimos días." />
          )}
        </>
      )}
    </div>
  );
}

const POR_TANDA = 40;

function Grupo({
  titulo, detalle, tono, filas, deEsos, palomeados, palomear,
}: {
  titulo: string; detalle: string; tono: 'error' | 'aviso' | 'normal';
  filas: FilaResurtido[]; deEsos: number;
  palomeados: Record<string, number>; palomear: (llave: string) => void;
}) {
  const [abierto, setAbierto] = useState(tono !== 'normal');
  // En Casita 1 hay cientos de urgentes: se pintan de a poco para que el celular
  // no se atore con cientos de tarjetas de un jalón.
  const [cuantas, setCuantas] = useState(POR_TANDA);
  if (!filas.length) return null;
  const color = tono === 'error' ? 'bg-error text-on-error' : tono === 'aviso' ? 'bg-secondary text-on-secondary' : 'bg-surface-variant text-on-surface-variant';
  const fueraDeLista = Math.max(0, deEsos - filas.length);

  return (
    <section>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} className="mb-2 flex w-full items-center gap-2 py-1 text-left">
        <span className={`chip ${color}`}>{numero(deEsos)}</span>
        <span className="flex-1">
          <span className="titulo block text-lg leading-tight">{titulo}</span>
          <span className="text-xs text-on-surface-variant">{detalle}</span>
        </span>
        <Icono nombre={abierto ? 'expand_less' : 'expand_more'} className="text-[22px] text-on-surface-variant" />
      </button>
      {abierto && (
        <div className="space-y-2">
          {filas.slice(0, cuantas).map(f => (
            <Fila key={`${f.codigo}|${f.area}`} f={f} palomeado={!!palomeados[`${f.codigo}|${f.area}`]} palomear={palomear} />
          ))}
          {filas.length > cuantas && (
            <button type="button" onClick={() => setCuantas(c => c + POR_TANDA)} className="boton-suave w-full py-3">
              Ver más ({numero(filas.length - cuantas)} faltan)
            </button>
          )}
          {filas.length <= cuantas && fueraDeLista > 0 && (
            <p className="py-2 text-center text-xs text-on-surface-variant">
              Hay {numero(fueraDeLista)} más. Filtra por área para verlos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Fila({ f, palomeado, palomear }: { f: FilaResurtido; palomeado: boolean; palomear: (llave: string) => void }) {
  const { ir } = usarNavegacion();
  const llave = `${f.codigo}|${f.area}`;
  const bodega = f.enRespaldo?.[0];

  return (
    <div className={`tarjeta flex gap-2 p-3 ${palomeado ? 'opacity-55' : ''}`}>
      {/* Área de toque de 44 px: se palomea con el pulgar, de pie y con una mano. */}
      <button
        type="button"
        onClick={() => palomear(llave)}
        aria-pressed={palomeado}
        aria-label={palomeado ? 'Quitar palomita' : 'Marcar como surtido'}
        className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center self-start text-primary"
      >
        <Icono nombre={palomeado ? 'check_box' : 'check_box_outline_blank'} className="text-[26px]" />
      </button>

      <button type="button" onClick={() => ir(`/producto/${encodeURIComponent(f.codigo)}`)} className="flex min-w-0 flex-1 gap-3 text-left">
        <Foto url={f.foto} nombre={f.nombre} tamano="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className={`font-medium leading-tight ${palomeado ? 'line-through' : ''}`}>{f.nombre}</p>
          <p className="font-label text-xs text-on-surface-variant">{f.codigo} · {f.area}</p>

          <p className="mt-1 text-sm text-on-surface-variant">
            Vende <strong className="text-on-surface">{f.vendeAlDia.toFixed(1)}</strong> al día ·
            {' '}
            {f.piezasArea === null
              ? <span className="text-on-surface">sin contar</span>
              : <>{f.estado === 'desfasado' ? 'el sistema dice' : 'quedan'} <strong className="text-on-surface">{numero(f.piezasArea)}</strong></>}
            {f.coberturaDias !== null && f.piezasArea !== null && <> · para {f.coberturaDias} días</>}
          </p>

          <p className="mt-1.5 flex items-start gap-1 text-sm font-medium">
            <Icono nombre={f.accionTipo === 'contar' ? 'inventory_2' : 'local_shipping'} className="mt-0.5 text-[16px] text-primary" />
            <span>
              {f.accion}
              {f.accionNota && <span className="block text-xs font-normal text-on-surface-variant">{f.accionNota}</span>}
            </span>
          </p>

          {bodega && bodega.piezas !== null && f.accionTipo !== 'surtir' && f.accionTipo !== 'surtir_parcial' && (
            <p className="mt-1 text-xs text-on-surface-variant">En {bodega.area}: {numero(bodega.piezas)}</p>
          )}
        </div>
      </button>
    </div>
  );
}
