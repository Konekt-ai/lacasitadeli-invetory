// Revisión contra la base REAL (solo lectura): cuánto tarda cada consulta, cómo
// quedan los grupos y si algún producto trae dinero en el nombre.
//
//   node scripts/diagnostico.js
//
// Sirve para el "antes de publicar" y para cuando algo no cuadre: imprime los
// mismos números que muestra la app (versión 2: condiciones, resumen del día,
// alertas, y los tiempos nuevos #vlargo / #dias / catálogo completo).
import { armarSnapshot } from '../src/calculos/armar.js';
import { ETIQUETAS_CONDICION } from '../src/calculos/condiciones.js';
import { contarAlertas } from '../src/calculos/alertas.js';
import { config } from '../src/config.js';
import { traerHistorial, traerRapido } from '../src/datos/fuente.js';
import { cerrar } from '../src/db/mssql.js';
import { capacidadesOverrides, obtenerOverrides } from '../src/db/overrides.js';

const n = v => Number(v || 0).toLocaleString('es-MX');
const seg = ms => `${(ms / 1000).toFixed(1)} s`;

console.log(`\nBase: ${config.sql.database} en ${config.sql.server} como "${config.sql.user}"`);
if (config.sql.user.toLowerCase() === 'sa') console.log('  ⚠  Todavía usa "sa": antes de publicar cámbialo a inventory_ro.');

const t0 = Date.now();
const historial = await traerHistorial({
  completo: true, duplicadosDias: config.umbrales.duplicadosDias, ventasDiaDias: config.umbrales.ventasDiaDias,
});
const tHistorial = Date.now() - t0;

const t1 = Date.now();
const rapido = await traerRapido(config.umbrales);
const tRapido = Date.now() - t1;

const overrides = await obtenerOverrides({ forzar: true });

const t2 = Date.now();
const snap = armarSnapshot({
  ahora: rapido.ahora ? new Date(rapido.ahora) : undefined,
  areas: rapido.areas,
  mapaCajas: rapido.mapaCajas,
  inventario: rapido.inventario,
  reservas: rapido.reservas,
  equivalencias: rapido.equivalencias,
  ventasArea: rapido.ventasArea,
  ventasAreaLargo: historial.ventasAreaLargo,
  ventasDia: historial.ventasDia,
  desfases: rapido.desfases,
  historial: historial.historial,
  catalogo: historial.catalogo,
  catalogoCompleto: historial.catalogoCompleto ?? [],
  overrides,
}, {
  ...config.umbrales, refrigerado: config.refrigerado, cocina: config.cocina, areasRespaldo: config.areas.respaldo,
});
const tArmar = Date.now() - t2;

console.log('\n── Tiempos ──────────────────────────────────────────────');
for (const paso of historial.tiempos) console.log(`  ${paso.paso.padEnd(22)} ${seg(paso.ms)}`);
console.log(`  ${'lote historial (total)'.padEnd(22)} ${seg(tHistorial)}   filas: ventas largas ${n(historial.ventasAreaLargo.length)} · por día ${n(historial.ventasDia.length)} · catálogo completo ${n(historial.catalogoCompleto?.length)}`);
console.log(`  ${'lote rápido'.padEnd(22)} ${seg(tRapido)}`);
console.log(`  ${'armar en memoria'.padEnd(22)} ${seg(tArmar)}`);
console.log(`  ${'TODO'.padEnd(22)} ${seg(Date.now() - t0)}   (el objetivo es menos de 15 s)`);
const ventasPorDia = historial.tiempos.find(t => t.paso === 'ventas-por-dia');
if (ventasPorDia && ventasPorDia.ms > 4000) {
  console.log(`  ⚠  las ventas por día tardaron ${seg(ventasPorDia.ms)}: pon VENTAS_DIA_DIAS=30 en el .env`);
}

console.log('\n── Productos con piezas ─────────────────────────────────');
console.log(`  ${n(snap.resumen.conPiezas)} productos · ${n(snap.resumen.piezasTotales)} piezas · ${n(snap.productos.length)} en la foto · ${n(snap.catalogoCompleto.size)} en el catálogo completo`);
const porCondicion = new Map();
for (const p of snap.productos) {
  if (!(p.piezas > 0)) continue;
  for (const c of p.condiciones) {
    const acc = porCondicion.get(c) ?? { productos: 0, piezas: 0 };
    acc.productos += 1;
    acc.piezas += p.piezas;
    porCondicion.set(c, acc);
  }
}
for (const [c, acc] of [...porCondicion.entries()].sort((a, b) => b[1].productos - a[1].productos)) {
  console.log(`  ${(ETIQUETAS_CONDICION[c] ?? c).padEnd(26)} ${String(n(acc.productos)).padStart(7)} productos ${String(n(acc.piezas)).padStart(9)} piezas`);
}

console.log('\n── Resumen del día ──────────────────────────────────────');
for (const [k, v] of Object.entries(snap.resumenDia)) console.log(`  ${k.padEnd(18)} ${String(n(v)).padStart(8)}`);

console.log('\n── Por área ─────────────────────────────────────────────');
for (const a of [...snap.resumen.porArea].sort((x, y) => y.piezas - x.piezas)) {
  console.log(`  ${a.area.padEnd(14)} ${String(n(a.productos)).padStart(6)} productos ${String(n(a.piezas)).padStart(8)} piezas · paradas ${String(n(a.paradas)).padStart(5)} (${n(a.piezasParadas)} piezas)`);
}
for (const c of snap.coberturaSucursal) {
  console.log(`  ${c.area.padEnd(14)} cobertura mediana ${c.medianaDias ?? '—'} d · ${n(c.productosQueVenden)} productos que venden · ${n(c.urgentes)} urgentes`);
}

console.log('\n── Resurtido ────────────────────────────────────────────');
const cuenta = {};
for (const r of snap.resurtido) {
  if (r.esCocina || r.nuncaContado) continue;
  const k = `${r.area} · ${r.estado}`;
  cuenta[k] = (cuenta[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(cuenta).sort()) console.log(`  ${k.padEnd(24)} ${String(v).padStart(5)}`);

console.log('\n── Alertas ──────────────────────────────────────────────');
const conteo = contarAlertas(snap.alertas);
console.log(`  ${Object.entries(conteo).map(([k, v]) => `${k} ${n(v)}`).join(' · ')}`);
const porTipo = {};
for (const a of snap.alertas) porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
for (const [k, v] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${String(n(v)).padStart(6)}`);

console.log('\n── Lo más parado (top 10, sin movimiento o lento) ───────');
const parados = snap.productos
  .filter(p => p.piezas > 0 && (p.clase === 'sin_movimiento' || p.clase === 'lento'))
  .sort((a, b) => b.piezas - a.piezas).slice(0, 10);
for (const p of parados) {
  console.log(`  ${String(n(p.piezas)).padStart(6)} pz  ${p.codigo.padEnd(14)} ${p.nombre.slice(0, 34).padEnd(34)} ${p.diasSinVenta === null ? 'nunca vendido' : `hace ${p.diasSinVenta} días`}${p.descontinuado ? ' · DESCONTINUADO' : ''}`);
}

console.log('\n── Descontinuados (los marca el dueño en el Admin) ──────');
const descontinuados = snap.productos.filter(p => p.descontinuado);
console.log(`  ${n(descontinuados.length)} productos${descontinuados.length ? ': ' + descontinuados.slice(0, 5).map(p => `${p.codigo} ${p.nombre.slice(0, 24)}`).join(' | ') : ''}`);

console.log('\n── Posibles códigos duplicados (top 5) ──────────────────');
for (const p of snap.productos.filter(x => x.duplicado).sort((a, b) => b.piezas - a.piezas).slice(0, 5)) {
  console.log(`  ${String(n(p.piezas)).padStart(6)} pz  ${p.codigo.padEnd(14)} ${p.nombre.slice(0, 28).padEnd(28)} → ${p.duplicado.codigo} ${p.duplicado.nombre.slice(0, 24)}`);
}

console.log('\n── Inventario desfasado (el sistema dice 0 y se sigue vendiendo) ──');
const desfasados = snap.productos.filter(p => p.desfase).sort((a, b) => b.desfase.piezas - a.desfase.piezas);
console.log(`  ${n(desfasados.length)} productos · ${n(desfasados.reduce((s, p) => s + p.desfase.piezas, 0))} piezas vendidas sin existencia en ${config.umbrales.desfaseDias} días`);
for (const p of desfasados.slice(0, 10)) {
  console.log(`  ${String(n(p.desfase.piezas)).padStart(6)} pz  ${p.codigo.padEnd(14)} ${p.nombre.slice(0, 34).padEnd(34)} ${p.desfase.areas.join(', ')}`);
}

console.log('\n── Movimiento (30 días, sin cocina) ─────────────────────');
const m = snap.movimiento;
console.log(`  7 d ${n(m.kpis.d7.piezas)} pz (${m.kpis.d7.cambio ?? '—'} %) · 30 d ${n(m.kpis.d30.piezas)} pz (${m.kpis.d30.cambio ?? '—'} %) · 90 d ${n(m.kpis.d90.piezas)} pz (${m.kpis.d90.cambio ?? '—'} %)`);
console.log(`  ${m.calor.nota ?? 'sin nota del mapa de calor'} · días con datos: ${m.calor.fechas.filter(f => f.piezas > 0).length} de ${m.calor.fechas.length}`);

console.log('\n── Privacidad ───────────────────────────────────────────');
const conDinero = snap.productos.filter(p => /\$|\bpesos\b|\bmxn\b/i.test(`${p.nombre} ${p.categoria ?? ''}`));
console.log(conDinero.length === 0
  ? '  ✓ ningún nombre ni categoría trae dinero'
  : `  ✗ ${conDinero.length}: ${conDinero.slice(0, 3).map(p => p.nombre).join(' | ')}`);
const cap = capacidadesOverrides();
console.log(`  overrides del admin: ${n(overrides.size)} (fotos: ${cap.fotos ? 'sí' : 'no'} · estatus descontinuado: ${cap.overrides ? 'sí' : 'no'})`);

await cerrar();
console.log('');
