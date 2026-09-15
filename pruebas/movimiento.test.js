import { describe, expect, it } from 'vitest';
import {
  DIAS_SEMANA, calcularMovimiento, claveDia, diaSemanaDe, indexarVentasDia, notaCalor,
} from '../src/calculos/movimiento.js';
import { armarSnapshot } from '../src/calculos/armar.js';
import { AHORA, OPCIONES, VENTAS_AREA, VENTAS_AREA_90, VENTAS_AREA_LARGO, datosCompletos } from './datos-de-prueba.js';

const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$/i;
const DINERO_EN_TEXTO = /\$|\bpesos\b|\bmxn\b|precio|costo|proveedor/i;
function revisarDinero(valor, donde, problemas = []) {
  if (Array.isArray(valor)) valor.forEach((v, i) => revisarDinero(v, `${donde}[${i}]`, problemas));
  else if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    for (const [k, v] of Object.entries(valor)) {
      if (LLAVES_PROHIBIDAS.test(k)) problemas.push(`llave de dinero: ${donde}.${k}`);
      revisarDinero(v, `${donde}.${k}`, problemas);
    }
  } else if (typeof valor === 'string' && DINERO_EN_TEXTO.test(valor)) problemas.push(`texto con dinero en ${donde}: ${valor.slice(0, 60)}`);
  return problemas;
}

const snap = armarSnapshot(datosCompletos(), OPCIONES);
const mov = (filtros = {}) => calcularMovimiento(snap, filtros);

describe('calcularMovimiento — forma de GET /api/movimiento', () => {
  it('trae exactamente las secciones del contrato', () => {
    const m = mov({ dias: 30 });
    expect(Object.keys(m)).toEqual(['filtros', 'kpis', 'top', 'categorias', 'sucursales', 'aceleran', 'bajan', 'calor', 'ranking']);
    expect(m.filtros).toEqual({ dias: 30, area: '', incluirCocina: false });
    expect(Object.keys(m.kpis)).toEqual(['d7', 'd30', 'd90']);
    expect(Object.keys(m.calor)).toEqual(['dias', 'categoriaDia', 'sucursalDia', 'fechas', 'nota']);
    expect(m.calor.dias).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
    expect(DIAS_SEMANA).toEqual(m.calor.dias);
    for (const t of m.top) expect(Object.keys(t)).toEqual(['codigo', 'nombre', 'foto', 'categoria', 'piezas', 'piezasEnTienda', 'tendencia']);
    for (const c of m.categorias) expect(Object.keys(c)).toEqual(['nombre', 'piezas', 'porcentaje']);
    for (const s of m.sucursales) expect(Object.keys(s)).toEqual(['area', 'piezas', 'porcentaje']);
    for (const a of [...m.aceleran, ...m.bajan]) expect(Object.keys(a)).toEqual(['codigo', 'nombre', 'piezas', 'anterior', 'cambio']);
    for (const r of m.ranking) expect(Object.keys(r)).toEqual(['codigo', 'nombre', 'categoria', 'piezas', 'pzasDia', 'rotacion', 'diasSinMovimiento', 'piezasEnTienda']);
    for (const f of m.calor.fechas) expect(Object.keys(f)).toEqual(['fecha', 'dia', 'piezas']);
    for (const c of m.calor.categoriaDia) expect(c.valores).toHaveLength(7);
  });

  it('un periodo que no existe cae en 30; los topes se respetan', () => {
    expect(mov({ dias: 45 }).filtros.dias).toBe(30);
    expect(mov({ dias: '7' }).filtros.dias).toBe(7);
    const m = mov({ dias: 90 });
    expect(m.top.length).toBeLessThanOrEqual(10);
    expect(m.categorias.length).toBeLessThanOrEqual(12);
    expect(m.aceleran.length).toBeLessThanOrEqual(5);
    expect(m.bajan.length).toBeLessThanOrEqual(5);
    expect(m.calor.categoriaDia.length).toBeLessThanOrEqual(10);
    expect(m.ranking.length).toBeLessThanOrEqual(100);
  });

  it('ni una llave ni un texto de dinero en toda la respuesta (7, 30 y 90 días, con y sin cocina)', () => {
    for (const dias of [7, 30, 90]) {
      expect(revisarDinero(mov({ dias }), `dias${dias}`)).toEqual([]);
      expect(revisarDinero(mov({ dias, incluirCocina: true, area: 'Casita 1' }), `dias${dias}cocina`)).toEqual([]);
    }
  });

  it('el snapshot ya trae precalculado el de 30 días sin cocina', () => {
    expect(snap.movimiento.filtros).toEqual({ dias: 30, area: '', incluirCocina: false });
    expect(snap.movimiento.kpis).toEqual(mov({ dias: 30 }).kpis);
  });
});

describe('calcularMovimiento — KPIs, top, categorías, sucursales', () => {
  it('KPIs en piezas contra el periodo anterior de la misma duración', () => {
    const { kpis } = mov({ dias: 30 });
    // 7: 35+14+7+0 = 56 · 14 días: 70+28+14+1 = 113 → anterior 57
    expect(kpis.d7).toEqual({ piezas: 56, anterior: 57, cambio: -1.8 });
    // 30: 150+60+0+30+2 = 242 · 60: 250+100+3+60+4 = 417 → anterior 175
    expect(kpis.d30).toEqual({ piezas: 242, anterior: 175, cambio: 38.3 });
    // 90: 420+170+3+90+6 = 689 · 180: 600+170+3+180+12 = 965 → anterior 276
    expect(kpis.d90).toEqual({ piezas: 689, anterior: 276, cambio: 149.6 });
  });

  it('sin ventas de 180 días (lote viejo, solo v90) el anterior de 90 es null, no un invento', () => {
    const viejo = armarSnapshot(datosCompletos({ ventasAreaLargo: undefined, ventasArea90: VENTAS_AREA_90 }), OPCIONES);
    const { kpis } = calcularMovimiento(viejo, { dias: 90 });
    expect(kpis.d90).toEqual({ piezas: 689, anterior: null, cambio: null });
    expect(kpis.d30.anterior).toBeNull();
    expect(kpis.d7.anterior).toBe(57);
  });

  it('más vendidos por piezas: la comida de cocina y los códigos genéricos quedan fuera', () => {
    const m = mov({ dias: 30 });
    expect(m.top.map(t => t.codigo)).toEqual(['333333333333', '555555555555', '666666666666', '888888888888']);
    expect(m.top[0]).toMatchObject({ nombre: 'CHOCOLATE QUE VUELA', categoria: 'CHOCOLATES', piezas: 150, piezasEnTienda: 43, tendencia: 50, foto: null });
    expect(m.top.map(t => t.codigo)).not.toContain('0');
    expect(m.top.map(t => t.codigo)).not.toContain('00987339');
    const conCocina = mov({ dias: 30, incluirCocina: true });
    expect(conCocina.top[0]).toMatchObject({ codigo: '0', piezas: 4041 });
    expect(conCocina.top.map(t => t.codigo)).toContain('00987339');
  });

  it('categorías con más movimiento, con su porcentaje, usando la categoría FINAL', () => {
    const m = mov({ dias: 30 });
    expect(m.categorias).toEqual([
      { nombre: 'CHOCOLATES', piezas: 150, porcentaje: 62 },
      { nombre: 'Sin categoría', piezas: 60, porcentaje: 24.8 },
      { nombre: 'QUESOS Y LACTEOS', piezas: 30, porcentaje: 12.4 },
      { nombre: 'MERMELADAS Y MIELES', piezas: 2, porcentaje: 0.8 },
    ]);
  });

  it('comparativo por sucursal en el periodo', () => {
    expect(mov({ dias: 30 }).sucursales).toEqual([
      { area: 'Casita 1', piezas: 182, porcentaje: 75.2 },
      { area: 'Casita 2', piezas: 60, porcentaje: 24.8 },
    ]);
    expect(mov({ dias: 7 }).sucursales.map(s => s.piezas)).toEqual([42, 14]);
  });

  it('el filtro de sucursal usa lo vendido en esa área y las piezas de esa área', () => {
    const m = mov({ dias: 30, area: 'Casita 2' });
    expect(m.filtros.area).toBe('Casita 2');
    expect(m.kpis.d30).toEqual({ piezas: 60, anterior: 40, cambio: 50 });
    expect(m.top.map(t => t.codigo)).toEqual(['555555555555']);
    expect(m.top[0].piezasEnTienda).toBe(0);        // contado en 0 en Casita 2
    expect(m.categorias).toEqual([{ nombre: 'Sin categoría', piezas: 60, porcentaje: 100 }]);
    // El comparativo por sucursal es para comparar: no se recorta al filtro.
    expect(m.sucursales.map(s => s.area)).toEqual(['Casita 1', 'Casita 2']);
  });
});

describe('calcularMovimiento — aceleran / bajan', () => {
  it('top 5 por % de cambio, mínimo 10 piezas en el periodo', () => {
    const m = mov({ dias: 30 });
    expect(m.aceleran.map(a => a.codigo)).toEqual(['333333333333', '555555555555']);
    expect(m.aceleran[0]).toEqual({ codigo: '333333333333', nombre: 'CHOCOLATE QUE VUELA', piezas: 150, anterior: 100, cambio: 50 });
    expect(m.bajan).toEqual([]);
    // A 90 días: el agua no tiene periodo anterior (null): no entra.
    expect(mov({ dias: 90 }).aceleran.map(a => a.codigo)).toEqual(['333333333333']);
  });

  it('lo que baja sale en "bajan"; lo de menos de 10 piezas no hace ruido', () => {
    const s = armarSnapshot(datosCompletos({
      ventasArea: VENTAS_AREA.map(v => (v.codigo === '888888888888' ? { ...v, v7: 2, v14: 4, v30: 8 } : v)),
      ventasAreaLargo: VENTAS_AREA_LARGO.map(v => {
        if (v.codigo === '666666666666') return { ...v, v60: 100 };     // antes vendía 70, ahora 30
        if (v.codigo === '888888888888') return { ...v, v60: 10 };      // 8 vs 2: +300 %, pero son 8 piezas
        return v;
      }),
    }), OPCIONES);
    const m = calcularMovimiento(s, { dias: 30 });
    expect(m.bajan).toEqual([{ codigo: '666666666666', nombre: 'QUESO MANCHEGO 200G', piezas: 30, anterior: 70, cambio: -57.1 }]);
    expect(m.aceleran.map(a => a.codigo)).not.toContain('888888888888');
  });
});

describe('calcularMovimiento — mapas de calor', () => {
  it('categoría × día y sucursal × día, lunes primero, en piezas', () => {
    const { calor } = mov({ dias: 30 });
    // 21 días de datos = 3 de cada día de la semana. Chocolate: 3 entre semana, 12 en fin.
    expect(calor.categoriaDia[0]).toEqual({ nombre: 'CHOCOLATES', valores: [9, 9, 9, 9, 9, 36, 36] });
    expect(calor.categoriaDia.map(c => c.nombre)).toEqual(['CHOCOLATES', 'Sin categoría', 'QUESOS Y LACTEOS']);
    expect(calor.sucursalDia).toEqual([
      { nombre: 'Casita 1', valores: [12, 12, 12, 12, 12, 39, 39] },
      { nombre: 'Casita 2', valores: [6, 6, 6, 6, 6, 15, 15] },
    ]);
  });

  it('la nota dice qué días concentran el movimiento (fin de semana fuerte)', () => {
    expect(mov({ dias: 30 }).calor.nota).toBe('Sábado y domingo concentran el mayor movimiento');
    expect(mov({ dias: 7 }).calor.nota).toBe('Sábado y domingo concentran el mayor movimiento');
    // Con la cocina (100 al día parejo) el fin de semana ya no pasa del 40 %: un solo día.
    expect(mov({ dias: 7, incluirCocina: true }).calor.nota).toBe('El sábado concentra el mayor movimiento');
  });

  it('un renglón por cada fecha del periodo, con su día de la semana en CDMX', () => {
    const { calor } = mov({ dias: 7 });
    expect(calor.fechas).toHaveLength(7);
    expect(calor.fechas[0]).toEqual({ fecha: '2026-09-05', dia: 'sáb', piezas: 18 });   // 12 + 5 + 1
    expect(calor.fechas[6]).toEqual({ fecha: '2026-09-11', dia: 'vie', piezas: 6 });    // 3 + 2 + 1
    const treinta = mov({ dias: 30 }).calor.fechas;
    expect(treinta).toHaveLength(30);
    expect(treinta[0]).toEqual({ fecha: '2026-08-13', dia: 'jue', piezas: 0 });         // antes de los 21 días con datos
    expect(treinta[29].fecha).toBe('2026-09-11');
  });

  it('con filtro de sucursal solo cuenta esa área (pero el comparativo sigue completo)', () => {
    const { calor } = mov({ dias: 7, area: 'Casita 2' });
    expect(calor.categoriaDia).toEqual([{ nombre: 'Sin categoría', valores: [2, 2, 2, 2, 2, 5, 5] }]);
    expect(calor.fechas[0].piezas).toBe(5);
    expect(calor.sucursalDia.map(s => s.nombre)).toEqual(['Casita 1', 'Casita 2']);
  });

  it('sin ventas por día no hay nota ni calor, pero la respuesta sigue completa', () => {
    const vacio = armarSnapshot(datosCompletos({ ventasDia: [] }), OPCIONES);
    const { calor } = calcularMovimiento(vacio, { dias: 30 });
    expect(calor.nota).toBeNull();
    expect(calor.categoriaDia).toEqual([]);
    expect(calor.sucursalDia.every(s => s.valores.every(v => v === 0))).toBe(true);
    expect(calor.fechas.every(f => f.piezas === 0)).toBe(true);
  });

  it('la nota: dos días si juntos pasan del 40 %, si no el mayor; null sin datos', () => {
    expect(notaCalor([10, 10, 10, 10, 10, 11, 10])).toBe('El sábado concentra el mayor movimiento');
    expect(notaCalor([1, 1, 1, 1, 30, 30, 1])).toBe('Viernes y sábado concentran el mayor movimiento');
    expect(notaCalor([0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(notaCalor([])).toBeNull();
    expect(notaCalor([50, 0, 0, 0, 0, 0, 0])).toBe('El lunes concentra el mayor movimiento');
  });

  it('el día de la semana se saca de las partes UTC del naive CDMX (11-sep-2026 es viernes)', () => {
    expect(diaSemanaDe('2026-09-11')).toBe(4);
    expect(diaSemanaDe('2026-09-05')).toBe(5);
    expect(diaSemanaDe('2026-09-06')).toBe(6);
    expect(diaSemanaDe('2026-09-07')).toBe(0);
    expect(claveDia(AHORA)).toBe('2026-09-11');
    expect(claveDia(new Date(Date.UTC(2026, 7, 29, 23, 59)))).toBe('2026-08-29');   // de noche no se corre el día
    expect(claveDia('2026-09-11T00:00:00.000Z')).toBe('2026-09-11');
    expect(claveDia('2026-09-11')).toBe('2026-09-11');
    expect(claveDia(null)).toBeNull();
    expect(claveDia('no es fecha')).toBeNull();
  });
});

describe('calcularMovimiento — ranking', () => {
  it('ranking de rotación con pzas/día, rotación y días sin movimiento', () => {
    const { ranking } = mov({ dias: 30 });
    expect(ranking[0]).toEqual({
      codigo: '333333333333', nombre: 'CHOCOLATE QUE VUELA', categoria: 'CHOCOLATES',
      piezas: 150, pzasDia: 5, rotacion: 3.49, diasSinMovimiento: 0, piezasEnTienda: 43,
    });
    expect(ranking.map(r => r.codigo)).toEqual(['333333333333', '555555555555', '666666666666', '888888888888']);
    expect(ranking[3]).toMatchObject({ pzasDia: 0.07, rotacion: 0.01, diasSinMovimiento: 8 });
  });
});

describe('indexarVentasDia', () => {
  it('arma código → área → día → piezas en una pasada, con Date o con texto', () => {
    const indice = snap.ventasDiaIndice;
    expect(indice.get('333333333333').get('Casita 1').get('2026-09-11')).toBe(3);    // viernes
    expect(indice.get('333333333333').get('Casita 1').get('2026-09-05')).toBe(12);   // sábado
    expect(indice.get('666666666666').get('Casita 1').get('2026-09-11')).toBe(1);    // vino como 'YYYY-MM-DD'
    expect(indice.get('0').get('Casita 1').get('2026-09-11')).toBe(100);
    expect(indice.has('no-existe')).toBe(false);
  });

  it('suma varias filas del mismo día y las ventas por código de caja van al producto suelto', () => {
    const porCodigo = new Map([['888', {}]]);
    const indice = indexarVentasDia([
      { area: 'Casita 1', dia: '2026-09-10', codigo: '888CAJA', piezas: 2 },
      { area: 'Casita 1', dia: '2026-09-10', codigo: '888CAJA', piezas: 1 },
      { area: '', dia: '2026-09-10', codigo: '888', piezas: 5 },
      { area: 'Casita 1', dia: null, codigo: '888', piezas: 5 },        // sin día: se ignora
      { area: 'Casita 1', dia: '2026-09-10', codigo: 'otro', piezas: 9 }, // no está en el snapshot
    ], { porCodigo, equivalencias: new Map([['888CAJA', { base: '888', unidades: 12 }]]) });
    expect(indice.get('888').get('Casita 1').get('2026-09-10')).toBe(36);
    expect(indice.get('888').get('Sin área').get('2026-09-10')).toBe(5);
    expect(indice.has('888CAJA')).toBe(false);
    expect(indice.has('otro')).toBe(false);
  });
});
