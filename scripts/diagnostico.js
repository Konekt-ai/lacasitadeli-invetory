// Revisión contra la base REAL (solo lectura): cuánto tarda cada consulta, cómo
// quedan los grupos y si algún producto trae dinero en el nombre.
//
//   node scripts/diagnostico.js
//
// Sirve para el "antes de publicar" y para cuando algo no cuadre: imprime los
// mismos números que muestra la app.
import { armarSnapshot } from '../src/calculos/armar.js';
import { config } from '../src/config.js';
import { traerHistorial, traerRapido } from '../src/datos/fuente.js';
import { cerrar } from '../src/db/mssql.js';
import { obtenerFotos } from '../src/db/fotos.js';
import { ETIQUETAS } from '../src/calculos/clasificacion.js';

const n = v => Number(v || 0).toLocaleString('es-MX');
const seg = ms => `${(ms / 1000).toFixed(1)} s`;

console.log(`\nBase: ${config.sql.database} en ${config.sql.server} como "${config.sql.user}"`);
if (config.sql.user.toLowerCase() === 'sa') console.log('  ⚠  Todavía usa "sa": antes de publicar cámbialo a inventory_ro.');

const t0 = Date.now();
const historial = await traerHistorial({ completo: true, duplicadosDias: config.umbrales.duplicadosDias });
const tHistorial = Date.now() - t0;

const t1 = Date.now();
const rapido = await traerRapido(config.umbrales);
const tRapido = Date.now() - t1;

const fotos = await obtenerFotos({ forzar: true });

const t2 = Date.now();
const snap = armarSnapshot({
  ahora: rapido.ahora ? new Date(rapido.ahora) : undefined,
  areas: rapido.areas,
  mapaCajas: rapido.mapaCajas,
  inventario: rapido.inventario,
  reservas: rapido.reservas,
  equivalencias: rapido.equivalencias,
  ventasArea: rapido.ventasArea,
  historial: historial.historial,
  catalogo: historial.catalogo,
  fotos,
}, { ...config.umbrales, cocina: config.cocina, areasRespaldo: config.areas.respaldo });
const tArmar = Date.now() - t2;

console.log('\n── Tiempos ──────────────────────────────────────────────');
for (const paso of historial.tiempos) console.log(`  ${paso.paso.padEnd(20)} ${seg(paso.ms)}`);
console.log(`  ${'lote historial (total)'.padEnd(20)} ${seg(tHistorial)}`);
console.log(`  ${'lote rápido'.padEnd(20)} ${seg(tRapido)}`);
console.log(`  ${'armar en memoria'.padEnd(20)} ${seg(tArmar)}`);
console.log(`  ${'TODO'.padEnd(20)} ${seg(Date.now() - t0)}   (el objetivo es menos de 10 s)`);

console.log('\n── Productos con piezas ─────────────────────────────────');
console.log(`  ${n(snap.resumen.conPiezas)} productos · ${n(snap.resumen.piezasTotales)} piezas`);
for (const c of Object.values(snap.resumen.porClase)) {
  console.log(`  ${ETIQUETAS[c.clase].padEnd(24)} ${String(n(c.productos)).padStart(7)} productos ${String(n(c.piezas)).padStart(9)} piezas`);
}

console.log('\n── Por área ─────────────────────────────────────────────');
for (const a of [...snap.resumen.porArea].sort((x, y) => y.piezas - x.piezas)) {
  console.log(`  ${a.area.padEnd(14)} ${String(n(a.productos)).padStart(6)} productos ${String(n(a.piezas)).padStart(8)} piezas · paradas ${String(n(a.paradas)).padStart(5)} (${n(a.piezasParadas)} piezas)`);
}

console.log('\n── Resurtido ────────────────────────────────────────────');
const cuenta = {};
for (const r of snap.resurtido) {
  if (r.esCocina || r.nuncaContado) continue;
  const k = `${r.area} · ${r.estado}`;
  cuenta[k] = (cuenta[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(cuenta).sort()) console.log(`  ${k.padEnd(24)} ${String(v).padStart(5)}`);

console.log('\n── Lo más parado (top 10) ───────────────────────────────');
const parados = snap.productos
  .filter(p => p.piezas > 0 && (p.clase === 'descontinuado' || p.clase === 'lento'))
  .sort((a, b) => b.piezas - a.piezas).slice(0, 10);
for (const p of parados) {
  console.log(`  ${String(n(p.piezas)).padStart(6)} pz  ${p.codigo.padEnd(14)} ${p.nombre.slice(0, 34).padEnd(34)} ${p.diasSinVenta === null ? 'nunca vendido' : `hace ${p.diasSinVenta} días`}`);
}

console.log('\n── Posibles códigos duplicados (top 5) ──────────────────');
for (const p of snap.productos.filter(x => x.duplicado).sort((a, b) => b.piezas - a.piezas).slice(0, 5)) {
  console.log(`  ${String(n(p.piezas)).padStart(6)} pz  ${p.codigo.padEnd(14)} ${p.nombre.slice(0, 28).padEnd(28)} → ${p.duplicado.codigo} ${p.duplicado.nombre.slice(0, 24)}`);
}

console.log('\n── Privacidad ───────────────────────────────────────────');
const conDinero = snap.productos.filter(p => /\$|\bpesos\b|\bmxn\b/i.test(`${p.nombre} ${p.categoria ?? ''}`));
console.log(conDinero.length === 0
  ? '  ✓ ningún nombre ni categoría trae dinero'
  : `  ✗ ${conDinero.length}: ${conDinero.slice(0, 3).map(p => p.nombre).join(' | ')}`);
console.log(`  fotos disponibles: ${n(fotos.size)}`);

await cerrar();
console.log('');
