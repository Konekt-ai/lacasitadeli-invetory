import { describe, expect, it } from 'vitest';
import {
  CONDICIONES, ETIQUETAS_CONDICION, calcularCondiciones, calcularPrioridad, cambioPorciento,
  diasSinMovimientoDe, tramoDe,
} from '../src/calculos/condiciones.js';
import { armarSnapshot } from '../src/calculos/armar.js';
import { AHORA, OPCIONES, OVERRIDES, datosCompletos, haceDias } from './datos-de-prueba.js';

const opciones = { ahora: AHORA, areasVenta: ['Casita 1', 'Casita 2'] };

/** Un producto "normal": vende 1 al día en Casita 1 y tiene 10 piezas ahí. */
const producto = (extra = {}) => ({
  codigo: 'x', alta: true, piezas: 10, apartado: 0, esCocina: false, masVendido: false,
  descontinuado: false, duplicado: null, desfase: null,
  ultimaVenta: haceDias(1), primeraVez: haceDias(300), ultimaEntrada: haceDias(5),
  vendidas: { d7: 7, d14: 14, d30: 30, d60: 60, d90: 90, d180: 180 },
  porArea: [{ area: 'Casita 1', cantidad: 10, apartado: 0, v14: 14 }],
  ...extra,
});
const calcular = (extra, o = {}) => calcularCondiciones(producto(extra), { ...opciones, ...o });
const condiciones = (extra, o) => calcular(extra, o).condiciones;

describe('calcularCondiciones — por área de venta', () => {
  it('agotado: se vende ahí, está contado, no queda nada y no hay en otra área', () => {
    const r = calcular({ porArea: [{ area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 }] });
    expect(r.condiciones).toContain('agotado');
    expect(r.condiciones).not.toContain('bajo_stock');
    expect(r.prioridad).toBe('alta');
    expect(r.coberturaDias).toBe(0);
  });

  it('agotado vs falta en anaquel: la diferencia es si HAY en otra área (queja del jefe)', () => {
    // HUBBA BUBBA: 0 en Casita 1 (donde se vende) y 202 en Casita 2 → falta en anaquel, hay que moverlas.
    const hubba = calcular({
      piezas: 202,
      porArea: [
        { area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 },
        { area: 'Casita 2', cantidad: 202, apartado: 0, v14: 0 },
        { area: 'Bodega', cantidad: 0, apartado: 0, v14: 0 },
      ],
    });
    expect(hubba.condiciones).toContain('sin_stock');
    expect(hubba.condiciones).not.toContain('agotado');
    expect(hubba.faltaEn).toEqual(['Casita 1']);
    expect(hubba.hayEn).toEqual([{ area: 'Casita 2', piezas: 202 }]);
    expect(hubba.prioridad).toBe('alta');
    // Nada en ninguna área contada → agotado: hay que comprarlo.
    const nada = calcular({
      piezas: 0,
      porArea: [
        { area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 },
        { area: 'Bodega', cantidad: 0, apartado: 0, v14: 0 },
      ],
    });
    expect(nada.condiciones).toContain('agotado');
    expect(nada.condiciones).not.toContain('sin_stock');
    expect(nada.faltaEn).toEqual(['Casita 1']);
    expect(nada.hayEn).toEqual([]);
    expect(nada.prioridad).toBe('alta');
    // Lo apartado por la web no cuenta como "hay": 5 físicas y 5 apartadas en Bodega = nada que mover.
    const apartado = calcular({
      piezas: 5,
      porArea: [
        { area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 },
        { area: 'Bodega', cantidad: 5, apartado: 5, v14: 0 },
      ],
    });
    expect(apartado.condiciones).toContain('agotado');
    expect(apartado.hayEn).toEqual([]);
    // hayEn va de más a menos y falta en las dos sucursales se lista junto.
    const dos = calcular({
      piezas: 50,
      porArea: [
        { area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 },
        { area: 'Casita 2', cantidad: 0, apartado: 0, v14: 7 },
        { area: 'Bodega', cantidad: 40, apartado: 0, v14: 0 },
        { area: 'Refrigerador', cantidad: 10, apartado: 0, v14: 0 },
      ],
    });
    expect(dos.faltaEn).toEqual(['Casita 1', 'Casita 2']);
    expect(dos.hayEn).toEqual([{ area: 'Bodega', piezas: 40 }, { area: 'Refrigerador', piezas: 10 }]);
  });

  it('sin fila NO es cero: si no está contado no hay "sin stock" ni cobertura', () => {
    const sinFila = calcular({ porArea: [] });
    expect(sinFila.condiciones).not.toContain('sin_stock');
    expect(sinFila.condiciones).not.toContain('agotado');
    expect(sinFila.faltaEn).toEqual([]);
    expect(sinFila.coberturaDias).toBeNull();
    expect(sinFila.prioridad).toBe('baja');
    const filaNula = calcular({ porArea: [{ area: 'Casita 1', cantidad: null, apartado: 0, v14: 14 }] });
    expect(filaNula.condiciones).not.toContain('sin_stock');
    expect(filaNula.areas[0]).toMatchObject({ contado: false, seVende: true, cobertura: null, disponible: null });
  });

  it('lo apartado por la página web resta: disponible = físico − apartado', () => {
    const casi = calcular({ porArea: [{ area: 'Casita 1', cantidad: 10, apartado: 9, v14: 14 }] });
    expect(casi.areas[0].disponible).toBe(1);
    expect(casi.coberturaDias).toBe(1);
    expect(casi.condiciones).toContain('bajo_stock');
    expect(casi.prioridad).toBe('alta');           // cobertura < 2 días
    const nada = calcular({ porArea: [{ area: 'Casita 1', cantidad: 10, apartado: 10, v14: 14 }] });
    expect(nada.condiciones).toContain('agotado');
  });

  it('bajo stock: entre 0 y 7 días de cobertura (7 exactos ya no es bajo)', () => {
    const bajo = calcular({ porArea: [{ area: 'Casita 1', cantidad: 5, apartado: 0, v14: 14 }] });
    expect(bajo.condiciones).toContain('bajo_stock');
    expect(bajo.prioridad).toBe('media');
    const justo = calcular({ porArea: [{ area: 'Casita 1', cantidad: 7, apartado: 0, v14: 14 }] });
    expect(justo.condiciones).not.toContain('bajo_stock');
    expect(justo.prioridad).toBe('baja');
  });

  it('"se vende en un área" = venta diaria de ESA área > 0; sin venta ahí no hay cobertura', () => {
    const r = calcular({
      porArea: [
        { area: 'Casita 1', cantidad: 10, apartado: 0, v14: 14 },
        { area: 'Casita 2', cantidad: 5, apartado: 0, v14: 0 },
        { area: 'Bodega', cantidad: 500, apartado: 0, v14: 0 },
      ],
    });
    const c2 = r.areas.find(a => a.area === 'Casita 2');
    expect(c2).toMatchObject({ seVende: false, contado: true, cobertura: null, ventaDiaria: 0 });
    // Bodega no es área de venta: ni siquiera entra a la lista.
    expect(r.areas.map(a => a.area)).toEqual(['Casita 1', 'Casita 2']);
    expect(r.condiciones).not.toContain('bajo_stock');
  });

  it('la cobertura del producto es la MENOR de las áreas donde se vende', () => {
    const r = calcular({
      porArea: [
        { area: 'Casita 1', cantidad: 10, apartado: 0, v14: 14 },  // 10 días
        { area: 'Casita 2', cantidad: 4, apartado: 0, v14: 28 },   // 2 días
      ],
      vendidas: { d7: 21, d14: 42, d30: 90, d60: 180, d90: 270, d180: 540 },
    });
    expect(r.areas.map(a => a.cobertura)).toEqual([10, 2]);
    expect(r.coberturaDias).toBe(2);
    expect(r.condiciones).toContain('bajo_stock');
    expect(r.prioridad).toBe('media');          // 2 no es "menor que 2"
  });

  it('desfasado: el 0 es falso, no es "sin stock" y no da cobertura, pero sí es urgente', () => {
    const r = calcular({
      desfase: { piezas: 5, desde: haceDias(3), ultima: haceDias(1), areas: ['Casita 1'] },
      porArea: [{ area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14, desfase: { piezas: 5 } }],
    });
    expect(r.condiciones).toContain('desfasado');
    expect(r.condiciones).not.toContain('sin_stock');
    expect(r.coberturaDias).toBeNull();
    expect(r.areas[0].desfasada).toBe(true);
    expect(r.prioridad).toBe('alta');
  });
});

describe('calcularCondiciones — sobrestock, más vendidos, lento, sin movimiento', () => {
  it('sobrestock: 24+ piezas y sin venta en 30 días', () => {
    const sinVenta = { vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d180: 0 }, porArea: [{ area: 'Casita 1', cantidad: 24, apartado: 0, v14: 0 }] };
    expect(condiciones({ ...sinVenta, piezas: 24 })).toContain('sobrestock');
    expect(condiciones({ ...sinVenta, piezas: 23 })).not.toContain('sobrestock');
  });

  it('sobrestock: alcanza para más de 120 días contando la Bodega (caso Libby\'s)', () => {
    const r = calcular({
      piezas: 500,
      porArea: [
        { area: 'Casita 1', cantidad: 10, apartado: 0, v14: 14 },
        { area: 'Bodega', cantidad: 490, apartado: 0, v14: 0 },
      ],
    });
    expect(r.coberturaDias).toBe(10);            // en el anaquel
    expect(r.coberturaTiendaDias).toBe(500);     // en toda la tienda
    expect(r.condiciones).toContain('sobrestock');
  });

  it('un producto nuevo con 24 piezas todavía no está "de más"', () => {
    const r = calcular({
      piezas: 24, ultimaVenta: null, primeraVez: haceDias(5), ultimaEntrada: haceDias(5),
      vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d180: 0 },
      porArea: [{ area: 'Casita 1', cantidad: 24, apartado: 0, v14: 0 }],
    });
    expect(r.condiciones).toEqual(['nuevo_sin_venta']);
  });

  it('más vendido lo decide armar.js (top N), pero nunca la comida de cocina', () => {
    expect(condiciones({ masVendido: true })).toContain('mas_vendidos');
    expect(condiciones({ masVendido: true, esCocina: true })).not.toContain('mas_vendidos');
    expect(condiciones({ masVendido: false })).not.toContain('mas_vendidos');
  });

  it('lento: vendió alguna vez y lleva de 30 a 89 días sin venderse', () => {
    expect(condiciones({ ultimaVenta: haceDias(29) })).not.toContain('lento');
    expect(condiciones({ ultimaVenta: haceDias(30) })).toEqual(['lento', 'sin_movimiento_30']);
    expect(condiciones({ ultimaVenta: haceDias(89) })).toEqual(['lento', 'sin_movimiento_60']);
    const noventa = condiciones({ ultimaVenta: haceDias(90) });
    expect(noventa).not.toContain('lento');
    expect(noventa).toContain('sin_movimiento_90');
  });

  it('sin movimiento: solo el tramo MAYOR que cumpla', () => {
    const nunca = { ultimaVenta: null, vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d180: 0 }, porArea: [{ area: 'Casita 1', cantidad: 10, apartado: 0, v14: 0 }] };
    const r200 = calcular({ ...nunca, primeraVez: haceDias(200) });
    expect(r200.tramoSinMovimiento).toBe(180);
    expect(r200.diasSinMovimiento).toBe(200);
    expect(r200.condiciones.filter(c => c.startsWith('sin_movimiento'))).toEqual(['sin_movimiento_180']);
    const r95 = calcular({ ...nunca, primeraVez: haceDias(95) });
    expect(r95.tramoSinMovimiento).toBe(90);
    expect(r95.condiciones.filter(c => c.startsWith('sin_movimiento'))).toEqual(['sin_movimiento_90']);
    expect(tramoDe(59)).toBe(30);
    expect(tramoDe(60)).toBe(60);
    expect(tramoDe(null)).toBe(0);
  });

  it('nunca vendido: los días se cuentan desde la primera vez que se contó, no desde el último surtido', () => {
    // Duncan Hines: surtido interno hace 14 días, en la tienda desde hace 88.
    expect(diasSinMovimientoDe({ ultimaVenta: null, primeraVez: haceDias(88), ultimaEntrada: haceDias(14) }, AHORA)).toBe(88);
    expect(diasSinMovimientoDe({ ultimaVenta: haceDias(143), primeraVez: haceDias(300), ultimaEntrada: haceDias(14) }, AHORA)).toBe(143);
    expect(diasSinMovimientoDe({ ultimaVenta: null, primeraVez: null, ultimaEntrada: null }, AHORA)).toBeNull();
  });

  it('nuevo sin venta (contado hace < 30 días) NO lleva "sin movimiento"', () => {
    const nunca = { ultimaVenta: null, vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d180: 0 }, porArea: [{ area: 'Casita 1', cantidad: 10, apartado: 0, v14: 0 }] };
    const nuevo = calcular({ ...nunca, primeraVez: haceDias(10), ultimaEntrada: haceDias(10) });
    expect(nuevo.condiciones).toEqual(['nuevo_sin_venta']);
    expect(nuevo.tramoSinMovimiento).toBe(0);
    // A los 30 días deja de ser nuevo y ya cuenta como sin movimiento.
    const yaNo = calcular({ ...nunca, primeraVez: haceDias(30), ultimaEntrada: haceDias(30) });
    expect(yaNo.condiciones).toEqual(['sin_movimiento_30']);
  });
});

describe('calcularCondiciones — descontinuado, duplicado, sin alta, prioridad', () => {
  it('"Descontinuado" SOLO si el dueño lo marcó (overrides), nunca por días sin venta', () => {
    const marcado = condiciones({ descontinuado: true, ultimaVenta: haceDias(1) });
    expect(marcado).toContain('descontinuado');
    // Duncan Hines: 143 días sin venderse, 478 piezas: NO es descontinuado.
    const duncan = condiciones({
      descontinuado: false, piezas: 478, ultimaVenta: haceDias(143),
      vendidas: { d7: 0, d14: 0, d30: 0, d60: 0, d90: 0, d180: 3 },
      porArea: [{ area: 'Casita 1', cantidad: 478, apartado: 0, v14: 0 }],
    });
    expect(duncan).not.toContain('descontinuado');
    expect(duncan).toContain('sin_movimiento_90');
    expect(duncan).toContain('sobrestock');
  });

  it('duplicado probable y sin alta salen de lo que ya calculó armar.js', () => {
    expect(condiciones({ duplicado: { codigo: '00987339', nombre: 'KINDER JOY' } })).toContain('duplicado_probable');
    expect(condiciones({ alta: false })).toContain('sin_alta');
    expect(condiciones({ alta: true })).not.toContain('sin_alta');
  });

  it('prioridad: alta por sin stock, por cobertura < 2 o por desfasado; media por bajo stock', () => {
    expect(calcularPrioridad({ condiciones: ['sin_stock'], areas: [] })).toBe('alta');
    expect(calcularPrioridad({ condiciones: ['agotado'], areas: [] })).toBe('alta');
    expect(calcularPrioridad({ condiciones: ['desfasado'], areas: [] })).toBe('alta');
    expect(calcularPrioridad({ condiciones: ['bajo_stock'], areas: [{ cobertura: 1.9 }] })).toBe('alta');
    expect(calcularPrioridad({ condiciones: ['bajo_stock'], areas: [{ cobertura: 2 }] })).toBe('media');
    expect(calcularPrioridad({ condiciones: ['sobrestock', 'descontinuado'], areas: [{ cobertura: null }] })).toBe('baja');
    expect(calcularPrioridad({ condiciones: [], areas: [{ cobertura: 1 }] }, { coberturaUrgenteDias: 1 })).toBe('baja');
  });

  it('las condiciones salen siempre en el orden de CONDICIONES (para que los badges no bailen)', () => {
    const r = condiciones({ alta: false, descontinuado: true, masVendido: true, porArea: [{ area: 'Casita 1', cantidad: 0, apartado: 0, v14: 14 }] });
    expect(r).toEqual(['agotado', 'mas_vendidos', 'descontinuado', 'sin_alta']);
  });
});

describe('calcularCondiciones — números', () => {
  it('rotación = vendidas en 30 días / max(piezas, 1), a 2 decimales', () => {
    expect(calcular({ piezas: 10 }).rotacion).toBe(3);
    expect(calcular({ piezas: 0, porArea: [] }).rotacion).toBe(30);
    expect(calcular({ piezas: 43, vendidas: { d7: 35, d14: 70, d30: 150, d60: 250, d90: 420, d180: 600 } }).rotacion).toBe(3.49);
  });

  it('tendencia: % contra el periodo anterior; null si el anterior fue 0', () => {
    const r = calcular({ vendidas: { d7: 10, d14: 14, d30: 150, d60: 250, d90: 420, d180: 600 } });
    expect(r.tendencia).toEqual({ d7: 150, d30: 50, d90: 133.3 });
    const sinAntes = calcular({ vendidas: { d7: 7, d14: 7, d30: 30, d60: 30, d90: 90, d180: 90 } });
    expect(sinAntes.tendencia).toEqual({ d7: null, d30: null, d90: null });
    // Sin v180 (lote viejo) el anterior de 90 no se conoce: null, no un número inventado.
    expect(calcular({ vendidas: { d7: 7, d14: 14, d30: 30, d60: 60, d90: 90 } }).tendencia.d90).toBeNull();
    expect(cambioPorciento(5, 0)).toBeNull();
    expect(cambioPorciento(0, 4)).toBe(-100);
  });

  it('venta diaria = vendidas en 14 días / 14 (y por área igual)', () => {
    const r = calcular({ vendidas: { d7: 35, d14: 70, d30: 150, d60: 250, d90: 420, d180: 600 }, porArea: [{ area: 'Casita 1', cantidad: 3, apartado: 0, v14: 70 }] });
    expect(r.ventaDiaria).toBe(5);
    expect(r.areas[0].ventaDiaria).toBe(5);
    expect(r.areas[0].cobertura).toBe(0.6);
    expect(r.coberturaDias).toBe(0.6);
  });

  it('devuelve exactamente lo que promete el contrato', () => {
    const r = calcular({});
    for (const llave of ['condiciones', 'prioridad', 'tramoSinMovimiento', 'diasSinMovimiento', 'rotacion', 'tendencia', 'ventaDiaria', 'coberturaDias']) {
      expect(r, llave).toHaveProperty(llave);
    }
    expect(r.diasSinMovimiento).toBe(1);
  });

  it('cada condición tiene su texto de badge', () => {
    expect(CONDICIONES).toHaveLength(15);
    for (const id of CONDICIONES) expect(ETIQUETAS_CONDICION[id], id).toBeTruthy();
    expect(ETIQUETAS_CONDICION.sin_movimiento_90).toBe('Sin movimiento 90+ días');
    expect(ETIQUETAS_CONDICION.descontinuado).toBe('Descontinuado');
    expect(ETIQUETAS_CONDICION.nuevo_sin_venta).toBe('Nuevo, sin venta');
    expect(ETIQUETAS_CONDICION.desfasado).toBe('Desfasado: cuéntalo');
  });
});

describe('condiciones dentro del snapshot (datos de la tienda)', () => {
  const snap = armarSnapshot(datosCompletos(), OPCIONES);
  const dame = codigo => snap.porCodigo.get(codigo);

  it('la Pepsi es la ÚNICA descontinuada (overrides); los demás "nunca vendidos" no', () => {
    expect(dame('012000809996').condiciones).toEqual(['sobrestock', 'sin_movimiento_90', 'descontinuado']);
    expect(dame('012000809996').descontinuado).toBe(true);
    for (const codigo of ['098733', '999000000000', '444444444444']) {
      expect(dame(codigo).descontinuado, codigo).toBe(false);
      expect(dame(codigo).condiciones, codigo).not.toContain('descontinuado');
    }
    expect(snap.productos.filter(p => p.descontinuado).map(p => p.codigo)).toEqual(['012000809996']);
  });

  it('un producto puede traer varios badges a la vez', () => {
    expect(dame('098733').condiciones).toEqual(['sobrestock', 'sin_movimiento_60', 'duplicado_probable']);
    expect(dame('126490').condiciones).toEqual(['nuevo_sin_venta', 'duplicado_probable']);
    expect(dame('333333333333').condiciones).toEqual(['bajo_stock', 'mas_vendidos']);
    expect(dame('555555555555').condiciones).toEqual(['mas_vendidos', 'desfasado']);
    expect(dame('999000000000').condiciones).toEqual(['sobrestock', 'sin_movimiento_180']);
  });

  it('la comida de cocina no entra a "más vendidos" aunque venda 4,041 piezas', () => {
    expect(dame('0').condiciones).not.toContain('mas_vendidos');
    expect(dame('333333333333').condiciones).toContain('mas_vendidos');
  });

  it('prioridad: el chocolate (0.6 días) y el agua desfasada van en alta; el queso (6 días) en media', () => {
    expect(dame('333333333333').prioridad).toBe('alta');
    expect(dame('555555555555').prioridad).toBe('alta');
    expect(dame('666666666666').prioridad).toBe('media');
    expect(dame('012000809996').prioridad).toBe('baja');
  });

  it('sin la corrección del desfase, el agua contada en 0 (y en ningún otro lado) sería "agotado"', () => {
    const s = armarSnapshot(datosCompletos({ desfases: [] }), OPCIONES);
    const agua = s.porCodigo.get('555555555555');
    expect(agua.condiciones).toContain('agotado');
    expect(agua.condiciones).not.toContain('sin_stock');
    expect(agua.faltaEn).toEqual(['Casita 2']);
    expect(agua.hayEn).toEqual([]);
    expect(agua.prioridad).toBe('alta');
    expect(s.resumenDia.agotados).toBe(1);
    expect(s.resumenDia.sinStock).toBe(0);
  });

  it('marcar en el Admin un producto que sí vende lo vuelve descontinuado sin tocar sus otros badges', () => {
    const overrides = new Map(OVERRIDES);
    overrides.set('333333333333', { foto: null, categoria: null, descontinuado: true, descontinuadoDesde: haceDias(1) });
    const s = armarSnapshot(datosCompletos({ overrides }), OPCIONES);
    expect(s.porCodigo.get('333333333333').condiciones).toEqual(['bajo_stock', 'mas_vendidos', 'descontinuado']);
  });
});
