import React, { useMemo, useState } from 'react';
import { numero } from './basicos';

/**
 * Gráficas sin librerías: barras horizontales y mapas de calor hechos con divs
 * y Tailwind. La CSP es `style-src 'self'`, así que los colores con intensidad
 * van por la prop `style` de React (CSSOM, que la CSP no bloquea) y nunca por
 * un <style> inline. Todo en piezas.
 */

// primary #012d1d en RGB, para pintar la intensidad con transparencia.
const PRIMARY_RGB = '1, 45, 29';

/** Fondo y texto según qué tan grande es el valor respecto al máximo. */
export function estiloIntensidad(valor: number, max: number): React.CSSProperties {
  if (!max || !(valor > 0)) return { backgroundColor: '#f0ede8', color: '#414844' };
  const alpha = 0.12 + 0.88 * Math.min(1, valor / max);
  return {
    backgroundColor: `rgba(${PRIMARY_RGB}, ${alpha.toFixed(2)})`,
    // Con fondo oscuro el número va en blanco; si no, no se lee.
    color: alpha > 0.5 ? '#ffffff' : '#1c1c19',
  };
}

export type FilaBarra = { nombre: string; valor: number; porcentaje?: number | null; detalle?: string };

/** Barras horizontales: nombre, valor y porcentaje. Si `alTocar` viene, cada fila es un botón. */
export function Barras({
  filas, unidad = 'pzas', alTocar, vacio = 'Sin movimiento en este periodo',
}: {
  filas: FilaBarra[]; unidad?: string; alTocar?: (fila: FilaBarra) => void; vacio?: string;
}) {
  const max = Math.max(0, ...filas.map(f => f.valor));
  if (!filas.length) return <p className="py-4 text-center text-sm text-on-surface-variant">{vacio}</p>;
  return (
    <ul className="space-y-2.5">
      {filas.map(f => {
        const ancho = max > 0 ? Math.max(1.5, (f.valor / max) * 100) : 0;
        const conPorcentaje = f.porcentaje !== null && f.porcentaje !== undefined;
        const etiqueta = `${f.nombre}: ${numero(f.valor)} ${unidad}${conPorcentaje ? ` (${f.porcentaje} %)` : ''}`;
        const contenido = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{f.nombre}</span>
              <span className="shrink-0 font-label text-xs text-on-surface-variant">
                <strong className="text-base text-on-surface">{numero(f.valor)}</strong> {unidad}
                {conPorcentaje && <> · {f.porcentaje} %</>}
              </span>
            </span>
            <span className="mt-1 block h-3 w-full overflow-hidden rounded-full bg-surface-container" role="img" aria-label={etiqueta} title={etiqueta}>
              <span className="block h-3 rounded-full bg-primary" style={{ width: `${ancho}%` }} />
            </span>
            {f.detalle && <span className="mt-0.5 block text-xs text-on-surface-variant">{f.detalle}</span>}
          </>
        );
        return (
          <li key={f.nombre}>
            {alTocar
              ? <button type="button" onClick={() => alTocar(f)} className="block w-full text-left">{contenido}</button>
              : contenido}
          </li>
        );
      })}
    </ul>
  );
}

/** Leyenda "menos → más" de los mapas de calor. */
function Leyenda({ max, unidad }: { max: number; unidad: string }) {
  const pasos = [0, 0.2, 0.45, 0.7, 1];
  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
      <span>menos</span>
      {pasos.map(p => <span key={p} className="h-3.5 w-5 rounded" style={estiloIntensidad(p * max, max)} aria-hidden="true" />)}
      <span>más</span>
      <span className="ml-auto">máx. {numero(max)} {unidad}</span>
    </div>
  );
}

/**
 * Mapa de calor filas × columnas. El valor se ve al pasar el ratón o al tocar
 * la celda (y siempre va en aria-label/title, para lectores de pantalla).
 */
export function MapaCalor({
  filas, columnas, unidad = 'pzas', vacio = 'Sin movimiento en este periodo',
}: {
  filas: Array<{ nombre: string; valores: number[] }>; columnas: string[]; unidad?: string; vacio?: string;
}) {
  const [activa, setActiva] = useState<{ fila: number; col: number } | null>(null);
  const max = useMemo(() => Math.max(0, ...filas.flatMap(f => f.valores)), [filas]);
  if (!filas.length || !columnas.length) return <p className="py-4 text-center text-sm text-on-surface-variant">{vacio}</p>;

  const seleccion = activa ? filas[activa.fila] : null;
  return (
    <div>
      <div className="overflow-x-auto sin-barra">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `minmax(6.5rem, 1.6fr) repeat(${columnas.length}, minmax(2.4rem, 1fr))`, minWidth: `${6.5 + columnas.length * 2.6}rem` }}
          role="table"
          aria-label="Mapa de calor"
        >
          <span role="columnheader" className="etiqueta self-end pb-1">&nbsp;</span>
          {columnas.map(c => <span key={c} role="columnheader" className="etiqueta self-end pb-1 text-center">{c}</span>)}
          {filas.map((f, i) => (
            <React.Fragment key={f.nombre}>
              <span role="rowheader" className="truncate self-center pr-1 text-sm font-medium" title={f.nombre}>{f.nombre}</span>
              {columnas.map((c, j) => {
                const v = f.valores[j] ?? 0;
                const etiqueta = `${f.nombre} · ${c}: ${numero(v)} ${unidad}`;
                const esActiva = activa?.fila === i && activa?.col === j;
                return (
                  <button
                    key={c}
                    type="button"
                    role="cell"
                    title={etiqueta}
                    aria-label={etiqueta}
                    aria-pressed={esActiva}
                    onClick={() => setActiva(esActiva ? null : { fila: i, col: j })}
                    className={`group flex h-9 items-center justify-center rounded text-xs font-bold ${esActiva ? 'ring-2 ring-secondary' : ''}`}
                    style={estiloIntensidad(v, max)}
                  >
                    <span className={esActiva ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}>{numero(v)}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <Leyenda max={max} unidad={unidad} />
      {activa && seleccion && (
        <p className="mt-1 text-sm">
          <strong>{seleccion.nombre}</strong> · {columnas[activa.col]}: <strong>{numero(seleccion.valores[activa.col] ?? 0)}</strong> {unidad}
        </p>
      )}
    </div>
  );
}

const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' → índice lunes=0 … domingo=6 (sin zona: la fecha ya es de CDMX). */
function indiceLunes(fecha: string): number {
  const f = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(f.getTime())) return 0;
  return (f.getUTCDay() + 6) % 7;
}
const diaDelMes = (fecha: string) => parseInt(fecha.slice(8, 10), 10) || 0;
const mesDe = (fecha: string) => MESES_CORTOS[(parseInt(fecha.slice(5, 7), 10) || 1) - 1] ?? '';

type Fecha = { fecha: string; dia: string; piezas: number };

/**
 * Calendario del periodo: un cuadrito por día con el número de piezas. Para 90
 * días se agrupa por semanas (lunes a domingo) para que quepa en el celular.
 */
export function CalendarioCalor({ fechas, porSemanas = false, unidad = 'pzas' }: { fechas: Fecha[]; porSemanas?: boolean; unidad?: string }) {
  const ordenadas = useMemo(() => [...fechas].filter(f => f.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)), [fechas]);
  if (!ordenadas.length) return <p className="py-4 text-center text-sm text-on-surface-variant">Sin ventas por día en este periodo</p>;

  if (porSemanas) {
    // Semana = lunes…domingo; se etiqueta con el primer y último día que trae.
    const semanas: Array<{ desde: string; hasta: string; piezas: number; dias: number }> = [];
    for (const f of ordenadas) {
      const ultima = semanas[semanas.length - 1];
      if (!ultima || indiceLunes(f.fecha) === 0 || ultima.dias >= 7) semanas.push({ desde: f.fecha, hasta: f.fecha, piezas: f.piezas, dias: 1 });
      else { ultima.hasta = f.fecha; ultima.piezas += f.piezas; ultima.dias += 1; }
    }
    const max = Math.max(0, ...semanas.map(s => s.piezas));
    return (
      <div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {semanas.map(s => {
            const rango = mesDe(s.desde) === mesDe(s.hasta)
              ? `${diaDelMes(s.desde)}–${diaDelMes(s.hasta)} ${mesDe(s.desde)}`
              : `${diaDelMes(s.desde)} ${mesDe(s.desde)} – ${diaDelMes(s.hasta)} ${mesDe(s.hasta)}`;
            const etiqueta = `Semana del ${rango}: ${numero(s.piezas)} ${unidad}`;
            return (
              <div key={s.desde} className="flex h-16 flex-col items-center justify-center rounded-lg p-1 text-center" style={estiloIntensidad(s.piezas, max)} title={etiqueta} aria-label={etiqueta} role="img">
                <span className="text-[11px] leading-tight opacity-90">{rango}</span>
                <span className="text-base font-bold leading-tight">{numero(s.piezas)}</span>
              </div>
            );
          })}
        </div>
        <Leyenda max={max} unidad={unidad} />
      </div>
    );
  }

  const max = Math.max(0, ...ordenadas.map(f => f.piezas));
  const huecos = indiceLunes(ordenadas[0].fecha);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_CORTOS.map(d => <span key={d} className="etiqueta text-center">{d}</span>)}
        {Array.from({ length: huecos }, (_, i) => <span key={`hueco-${i}`} aria-hidden="true" />)}
        {ordenadas.map((f, i) => {
          const dia = diaDelMes(f.fecha);
          const etiqueta = `${dia} ${mesDe(f.fecha)}: ${numero(f.piezas)} ${unidad}`;
          const muestraMes = i === 0 || dia === 1;
          return (
            <div key={f.fecha} className="flex h-14 flex-col items-center justify-center rounded-lg p-1 text-center" style={estiloIntensidad(f.piezas, max)} title={etiqueta} aria-label={etiqueta} role="img">
              <span className="text-[11px] leading-tight opacity-90">{dia}{muestraMes && ` ${mesDe(f.fecha)}`}</span>
              <span className="text-base font-bold leading-tight">{numero(f.piezas)}</span>
            </div>
          );
        })}
      </div>
      <Leyenda max={max} unidad={unidad} />
    </div>
  );
}
