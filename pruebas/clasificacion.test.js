import { describe, expect, it } from 'vitest';
import { CLASES, ETIQUETAS, clasificar, resumirPorClase } from '../src/calculos/clasificacion.js';
import { AHORA, haceDias } from './datos-de-prueba.js';

const opciones = { descontinuadoDias: 90, lentoDias: 30, nuevoDias: 30, ahora: AHORA };
const clase = p => clasificar(p, opciones).clase;

describe('clasificar', () => {
  it('sin alta gana sobre todo lo demás: el código no existe en NovaCaja', () => {
    expect(clase({
      codigo: '444444444444', alta: false, ultimaVenta: null,
      ultimaEntrada: haceDias(2), primeraVez: haceDias(2), duplicado: { codigo: 'x' },
    })).toBe('sin_alta');
  });

  it('nunca vendido pero con un código gemelo que sí vende = posible duplicado (Kinder Joy)', () => {
    expect(clase({
      codigo: '098733', alta: true, ultimaVenta: null, ultimaEntrada: haceDias(49),
      primeraVez: haceDias(77), duplicado: { codigo: '00987339', nombre: 'KINDER JOY' },
    })).toBe('duplicado_probable');
  });

  it('el duplicado gana sobre "nuevo" aunque acabe de llegar (Starbucks: 10 días)', () => {
    expect(clase({
      codigo: '126490', alta: true, ultimaVenta: null, ultimaEntrada: haceDias(10),
      primeraVez: haceDias(10), duplicado: { codigo: '01264904' },
    })).toBe('duplicado_probable');
  });

  it('producto nuevo en la tienda y todavía sin venderse', () => {
    expect(clase({
      codigo: '111111111111', alta: true, ultimaVenta: null,
      ultimaEntrada: haceDias(5), primeraVez: haceDias(5), duplicado: null,
    })).toBe('nuevo');
  });

  it('nunca vendido y ya lleva tiempo en la tienda = sin movimiento (Pepsi Wild Cherry), NO descontinuado', () => {
    expect(clase({
      codigo: '012000809996', alta: true, ultimaVenta: null,
      ultimaEntrada: haceDias(29), primeraVez: haceDias(95), duplicado: null,
    })).toBe('sin_movimiento');
  });

  it('un surtido interno reciente NO vuelve nuevo a un estancado (Duncan Hines: 144 días sin venta)', () => {
    // La trampa: ultima_entrada se mueve cuando surten de Bodega al anaquel.
    expect(clase({
      codigo: '644209307579', alta: true, ultimaVenta: haceDias(144),
      ultimaEntrada: haceDias(14), primeraVez: haceDias(88), duplicado: null,
    })).toBe('sin_movimiento');
  });

  it('vendió hace 45 días = lento', () => {
    expect(clase({
      codigo: '222222222222', alta: true, ultimaVenta: haceDias(45),
      ultimaEntrada: haceDias(60), primeraVez: haceDias(200), duplicado: null,
    })).toBe('lento');
  });

  it('vendió hoy = activo', () => {
    expect(clase({
      codigo: '333333333333', alta: true, ultimaVenta: haceDias(0),
      ultimaEntrada: haceDias(2), primeraVez: haceDias(300), duplicado: null,
    })).toBe('activo');
  });

  it('los umbrales son exactos en el límite', () => {
    const base = { codigo: 'x', alta: true, ultimaEntrada: haceDias(300), primeraVez: haceDias(300), duplicado: null };
    expect(clase({ ...base, ultimaVenta: haceDias(29) })).toBe('activo');
    expect(clase({ ...base, ultimaVenta: haceDias(30) })).toBe('lento');
    expect(clase({ ...base, ultimaVenta: haceDias(89) })).toBe('lento');
    expect(clase({ ...base, ultimaVenta: haceDias(90) })).toBe('sin_movimiento');
  });

  it('acepta el nombre nuevo del umbral (sinMovimientoDias) y el viejo (descontinuadoDias)', () => {
    const p = { codigo: 'x', alta: true, ultimaVenta: haceDias(60), ultimaEntrada: haceDias(300), primeraVez: haceDias(300), duplicado: null };
    expect(clasificar(p, { sinMovimientoDias: 60, lentoDias: 30, nuevoDias: 30, ahora: AHORA }).clase).toBe('sin_movimiento');
    expect(clasificar(p, { descontinuadoDias: 60, lentoDias: 30, nuevoDias: 30, ahora: AHORA }).clase).toBe('sin_movimiento');
    expect(clasificar(p, { lentoDias: 30, nuevoDias: 30, ahora: AHORA }).clase).toBe('lento');   // default 90
  });

  it('un producto que vende no se vuelve "nuevo" por resurtirlo', () => {
    expect(clase({
      codigo: '333333333333', alta: true, ultimaVenta: haceDias(1),
      ultimaEntrada: haceDias(1), primeraVez: haceDias(1), duplicado: null,
    })).toBe('activo');
  });

  it('sin fecha de primera vez se cae a la última entrada', () => {
    expect(clase({
      codigo: 'x', alta: true, ultimaVenta: null, ultimaEntrada: haceDias(3),
      primeraVez: null, duplicado: null,
    })).toBe('nuevo');
  });

  it('cuenta los días sin venta para la tarjeta', () => {
    const r = clasificar({
      codigo: 'x', alta: true, ultimaVenta: haceDias(143), ultimaEntrada: haceDias(14),
      primeraVez: haceDias(300), duplicado: null,
    }, opciones);
    expect(r.diasSinVenta).toBe(143);
    expect(r.nuncaVendido).toBe(false);
  });

  it('"descontinuado" ya no es una clase: eso solo lo decide el dueño en el Admin', () => {
    expect(CLASES).toEqual(['sin_alta', 'duplicado_probable', 'nuevo', 'sin_movimiento', 'lento', 'activo']);
    expect(CLASES).not.toContain('descontinuado');
    expect(ETIQUETAS.sin_movimiento).toBe('Sin movimiento 90+ días');
    expect(ETIQUETAS.descontinuado).toBeUndefined();
    for (const c of CLASES) expect(ETIQUETAS[c], c).toBeTruthy();
  });
});

describe('resumirPorClase', () => {
  it('suma productos y piezas por clase', () => {
    const r = resumirPorClase([
      { clase: 'sin_movimiento', piezas: 100 },
      { clase: 'sin_movimiento', piezas: 50 },
      { clase: 'activo', piezas: 7 },
    ]);
    expect(r.sin_movimiento).toMatchObject({ productos: 2, piezas: 150, etiqueta: 'Sin movimiento 90+ días' });
    expect(r.activo).toMatchObject({ productos: 1, piezas: 7 });
    expect(r.lento).toMatchObject({ productos: 0, piezas: 0 });
    expect(r.descontinuado).toBeUndefined();
  });
});
