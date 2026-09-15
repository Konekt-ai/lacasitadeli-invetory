// Textos cortos que se repiten en Resurtir, Movimiento y Alertas: fechas,
// piezas y porcentajes. Todo en piezas: aquí nunca entra nada de dinero.
import { numero } from './basicos';

const CDMX = 'America/Mexico_City';

/**
 * Fecha bonita ("15 sep, 14:30") a partir de lo que manda el servidor.
 *
 * Llegan dos formatos y hay que distinguirlos para no correr 6 horas:
 *  · las rutas propias mandan ISO con "-06:00" (ya en hora de la tienda) → se
 *    pinta en America/Mexico_City;
 *  · las que se proxean del admin (solicitudes) mandan lo que da mssql: "…Z"
 *    pero con las partes UTC iguales a la hora de pared de CDMX → se pinta en
 *    UTC para que salga la misma hora que ve el de bodega en la TC52;
 *  · sin zona ("2026-09-15T14:30:00") → el navegador ya lo tomó como local y se
 *    pinta tal cual.
 */
export function fechaTexto(iso: string | null | undefined, conHora = true): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return String(iso);
  const zona = /z$/i.test(iso) ? 'UTC' : /[+-]\d\d:?\d\d$/.test(iso) ? CDMX : undefined;
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: zona,
      day: 'numeric',
      month: 'short',
      ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(fecha);
  } catch {
    return fecha.toLocaleString('es-MX');
  }
}

/** "8 pzas" / "1 pza". */
export const pzas = (n: number | null | undefined) => `${numero(n)} ${Number(n) === 1 ? 'pza' : 'pzas'}`;

/** Días de cobertura para leer de un vistazo: "0.6", "5.4", "12", "120+". */
export function coberturaTexto(dias: number | null | undefined): string {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return '—';
  if (dias >= 999) return '999+';
  if (dias < 10) return (Math.round(dias * 10) / 10).toLocaleString('es-MX');
  return Math.round(dias).toLocaleString('es-MX');
}

/** Pzas/día con un decimal ("5.0"), sin ceros raros. */
export const porDia = (n: number | null | undefined) => (Number(n ?? 0)).toFixed(1);

/**
 * "% vs el periodo anterior": flecha, color y texto. `null` = el periodo
 * anterior fue 0, así que no hay con qué comparar (no es lo mismo que 0 %).
 */
export function cambioTexto(cambio: number | null | undefined): { texto: string; clase: string; flecha: string } {
  if (cambio === null || cambio === undefined || !Number.isFinite(cambio)) {
    return { texto: 'sin dato anterior', clase: 'text-on-surface-variant', flecha: '' };
  }
  const abs = Math.abs(cambio);
  const num = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  if (cambio > 0) return { texto: `${num} %`, clase: 'text-[#166534]', flecha: '↑' };
  if (cambio < 0) return { texto: `${num} %`, clase: 'text-error', flecha: '↓' };
  return { texto: 'igual', clase: 'text-on-surface-variant', flecha: '=' };
}
