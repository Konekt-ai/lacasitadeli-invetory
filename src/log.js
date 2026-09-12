// Log sencillo a archivo con tope de tamaño (la caja no debe llenarse de logs).
// Escribe también a la consola, que el .bat manda a logs/consola.log.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const TOPE_BYTES = 2 * 1024 * 1024; // 2 MB y rota
let archivo = null;

function asegurarCarpeta() {
  if (archivo) return archivo;
  try {
    fs.mkdirSync(config.rutas.logs, { recursive: true });
    archivo = path.join(config.rutas.logs, 'app.log');
  } catch {
    archivo = null;
  }
  return archivo;
}

function rotarSiHaceFalta(ruta) {
  try {
    const st = fs.statSync(ruta);
    if (st.size > TOPE_BYTES) {
      fs.rmSync(`${ruta}.1`, { force: true });
      fs.renameSync(ruta, `${ruta}.1`);
    }
  } catch { /* no existe todavía */ }
}

function marca() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  // Hora de la tienda (CDMX) para que el log se lea igual que el reloj de la caja.
  const mx = new Date(d.getTime() - 6 * 3_600_000);
  return `${mx.getUTCFullYear()}-${p(mx.getUTCMonth() + 1)}-${p(mx.getUTCDate())} ${p(mx.getUTCHours())}:${p(mx.getUTCMinutes())}:${p(mx.getUTCSeconds())}`;
}

function escribir(nivel, area, mensaje, extra) {
  const detalle = extra instanceof Error ? ` ${extra.message}` : extra ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '';
  const linea = `${marca()} [${nivel}] ${area}: ${mensaje}${detalle}`;
  if (nivel === 'ERROR') console.error(linea);
  else console.log(linea);
  const ruta = asegurarCarpeta();
  if (!ruta) return;
  try {
    rotarSiHaceFalta(ruta);
    fs.appendFileSync(ruta, `${linea}\n`);
  } catch { /* si no se puede escribir, con la consola basta */ }
}

export const log = {
  info: (area, mensaje, extra) => escribir('INFO', area, mensaje, extra),
  aviso: (area, mensaje, extra) => escribir('AVISO', area, mensaje, extra),
  error: (area, mensaje, extra) => escribir('ERROR', area, mensaje, extra),
};
