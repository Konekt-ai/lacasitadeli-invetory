// Fechas en hora de Ciudad de México (UTC-6, sin horario de verano).
//
// Regla del sistema (ya probada en el admin): SQL Server sella con GETDATE() y su
// reloj YA es CDMX. El driver mssql entrega esos DATETIME como Date cuyas partes
// **UTC** son la hora de pared de CDMX. Entonces:
//   - para comparar/contar días se usan SIEMPRE las partes UTC ("naive CDMX");
//   - para mandar al frontend se arma el ISO con -06:00 (patrón naiveAIso).
// Nunca uses getFullYear()/getDate() locales sobre esos valores: dependen de la
// zona de la máquina y de noche cambian el día.

export const TZ_MX = 'America/Mexico_City';

const fmtPartes = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ_MX, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Instante actual como "naive CDMX": sus partes UTC son la hora de pared en México. */
export function ahoraNaive(referencia = new Date()) {
  const p = {};
  for (const { type, value } of fmtPartes.formatToParts(referencia)) p[type] = value;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second));
}

/** Convierte lo que venga (Date de mssql, string) a Date naive CDMX, o null. */
export function aNaive(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date naive CDMX -> ISO con su zona real: "2026-09-11T14:30:00-06:00". */
export function naiveAIso(valor) {
  const d = aNaive(valor);
  if (!d) return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}-06:00`;
}

/** Solo la fecha (medianoche) de un naive CDMX. */
function soloFecha(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Días naturales completos entre dos instantes (por día de calendario CDMX).
 * "Ayer" = 1 aunque hayan pasado 3 horas. Devuelve null si falta la fecha.
 */
export function diasEntre(desde, hasta = ahoraNaive()) {
  const a = aNaive(desde);
  const b = aNaive(hasta);
  if (!a || !b) return null;
  return Math.round((soloFecha(b) - soloFecha(a)) / 86_400_000);
}

/** "29 ago" / "29 ago 2025" si es de otro año. */
export function fechaCorta(valor, referencia = ahoraNaive()) {
  const d = aNaive(valor);
  if (!d) return null;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const texto = `${d.getUTCDate()} ${meses[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === referencia.getUTCFullYear() ? texto : `${texto} ${d.getUTCFullYear()}`;
}

/** "14:30" en hora de la tienda. */
export function horaCorta(valor) {
  const d = aNaive(valor);
  if (!d) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Texto para la tarjeta: "hace 143 días", "hoy", "ayer", "nunca". */
export function haceCuanto(valor, referencia = ahoraNaive()) {
  const dias = diasEntre(valor, referencia);
  if (dias === null) return 'nunca';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}
