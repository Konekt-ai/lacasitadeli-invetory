import { describe, expect, it } from 'vitest';
import { calcularResurtido, ordenarResurtido } from '../src/calculos/resurtido.js';
import { esCocina } from '../src/calculos/cocina.js';
import { AHORA, COCINA } from './datos-de-prueba.js';

const opciones = { ventanaDias: 14, urgenteDias: 2, bajaDias: 7, diasSugeridos: 7 };
const calcular = (e, o = {}) => calcularResurtido(e, { ...opciones, ...o });

describe('calcularResurtido', () => {
  it('venta diaria = piezas de la ventana entre los días de la ventana', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 30 });
    expect(r.ventaDiaria).toBe(5);
    expect(r.coberturaDias).toBe(6);
  });

  it('se acabó en el anaquel: urgente, aunque quede en Bodega → "Mover N de Bodega (hay N)"', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: 40 }],
    });
    expect(r.estado).toBe('urgente');
    expect(r.sugerido).toBe(35);
    expect(r.accion.tipo).toBe('surtir');
    expect(r.accion.texto).toBe('Mover 35 de Bodega (hay 40)');
    expect(r.accion.surtirDeRespaldo).toBe(35);
    expect(r.respaldo).toEqual({ area: 'Bodega', disponible: 40 });
  });

  it('menos de 2 días de cobertura también es urgente', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 9 });
    expect(r.coberturaDias).toBe(1.8);
    expect(r.estado).toBe('urgente');
  });

  it('entre 2 y 7 días de cobertura es bajo', () => {
    expect(calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 20 }).estado).toBe('bajo');
    expect(calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 35 }).estado).toBe('ok');
  });

  it('lo apartado por la página web no cuenta como disponible', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 14, stock: 10, apartado: 9 });
    expect(r.disponible).toBe(1);        // 10 físicas - 9 apartadas
    expect(r.coberturaDias).toBe(1);
    expect(r.estado).toBe('urgente');
    // Justo en 2 días de cobertura todavía NO es urgente (es "menos de 2").
    const limite = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 14, stock: 10, apartado: 8 });
    expect(limite.coberturaDias).toBe(2);
    expect(limite.estado).toBe('bajo');
  });

  it('NO está contado no es lo mismo que cero: hay que contarlo, no comprarlo', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 2', vendidasVentana: 30, stock: null });
    expect(r.estado).toBe('sin_conteo');
    expect(r.accion.tipo).toBe('contar');
    expect(r.accion.texto).toBe('No está contado en Casita 2: cuéntalo con la TC52');
    expect(r.disponible).toBeNull();
  });

  it('contado en cero sí es urgente', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 2', vendidasVentana: 30, stock: 0 });
    expect(r.estado).toBe('urgente');
  });

  it('sin nada en Bodega: "Sin respaldo en bodega: hay que comprarlo" (tipo pedir, sin decir a quién)', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: 0 }],
    });
    expect(r.accion.tipo).toBe('pedir');
    expect(r.accion.texto).toBe('Sin respaldo en bodega: hay que comprarlo');
    expect(r.accion.nota).toBe('No hay en Bodega');
    expect(r.respaldo).toEqual({ area: 'Bodega', disponible: 0 });
  });

  it('Bodega sin conteo: se avisa aparte, pero la acción sigue siendo comprarlo', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: null }],
    });
    expect(r.accion.tipo).toBe('revisar_respaldo');
    expect(r.accion.texto).toBe('Sin respaldo en bodega: hay que comprarlo');
    expect(r.accion.nota).toContain('no lo tiene contado');
    expect(r.respaldo).toEqual({ area: 'Bodega', disponible: null });
  });

  it('si en Bodega no alcanza, se mueve lo que hay y el resto se compra', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: 5 }],
    });
    expect(r.accion.tipo).toBe('surtir_parcial');
    expect(r.accion.texto).toBe('Mover 5 de Bodega (hay 5)');
    expect(r.accion.nota).toBe('Faltan 30: en Bodega no hay más, hay que comprarlos');
    expect(r.accion.surtirDeRespaldo).toBe(5);
  });

  it('lo apartado en Bodega tampoco se puede mover', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: 40, apartado: 38 }],
    });
    expect(r.accion.texto).toBe('Mover 2 de Bodega (hay 2)');
  });

  it('con varios respaldos se surte del que más tenga disponible', () => {
    const r = calcular({
      codigo: 'x', area: 'Casita 1', vendidasVentana: 70, stock: 0,
      respaldos: [{ area: 'Bodega', stock: 3 }, { area: 'Bodega 2', stock: 50 }],
    });
    expect(r.accion.texto).toBe('Mover 35 de Bodega 2 (hay 50)');
  });

  it('lo que no se vende no entra a la lista aunque esté en cero', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 0, stock: 0 });
    expect(r.estado).toBe('ok');
    expect(r.seVende).toBe(false);
    expect(r.sugerido).toBe(0);
  });

  it('bien surtido = sin acción', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 14, stock: 50 });
    expect(r.accion.tipo).toBe('ninguna');
    expect(r.accion.texto).toBe('Está bien surtido');
  });

  it('desfasado: el 0 es falso, hay que contarlo en vez de comprarlo (GHIRARDELLI)', () => {
    const r = calcular({
      codigo: '747599409943', area: 'Casita 1', vendidasVentana: 84, stock: 0,
      desfase: { piezas: 252, desde: new Date(Date.UTC(2026, 7, 2, 12, 19)) },
      respaldos: [{ area: 'Bodega', stock: null }],
    }, { ahora: AHORA });
    expect(r.estado).toBe('desfasado');
    expect(r.accion.tipo).toBe('contar');
    expect(r.accion.texto).toBe('Cuéntalo con la TC52: el sistema dice 0 y se sigue vendiendo');
    expect(r.accion.nota).toBe('Se vendieron 252 sin existencia en Casita 1 desde el 2 ago');
    // Con un 0 falso no hay cobertura ni "faltan N" que valga.
    expect(r.sugerido).toBe(0);
    expect(r.coberturaDias).toBeNull();
  });

  it('un desfase viejo de algo que ya no se vende no lo mete a la lista', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 0, stock: 0, desfase: { piezas: 4, desde: null } });
    expect(r.estado).toBe('ok');
  });

  it('ningún texto de acción habla de proveedores ni de dinero', () => {
    const casos = [
      { stock: 0, respaldos: [{ area: 'Bodega', stock: 40 }] },
      { stock: 0, respaldos: [{ area: 'Bodega', stock: 5 }] },
      { stock: 0, respaldos: [{ area: 'Bodega', stock: 0 }] },
      { stock: 0, respaldos: [{ area: 'Bodega', stock: null }] },
      { stock: null },
      { stock: 50 },
      { stock: 0, desfase: { piezas: 9, desde: null } },
    ];
    for (const c of casos) {
      const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: 70, ...c }, { ahora: AHORA });
      expect(`${r.accion.texto} ${r.accion.nota ?? ''}`).not.toMatch(/proveedor|pedir|pídelos|surte|precio|costo|\$|pesos/i);
    }
  });

  it('primero lo urgente y lo que más se vende', () => {
    const orden = ordenarResurtido([
      { estado: 'bajo', ventaDiaria: 9, codigo: 'b' },
      { estado: 'urgente', ventaDiaria: 1, codigo: 'u1' },
      { estado: 'urgente', ventaDiaria: 5, codigo: 'u2' },
      { estado: 'sin_conteo', ventaDiaria: 100, codigo: 's' },
    ]).map(x => x.codigo);
    expect(orden).toEqual(['u2', 'u1', 'b', 's']);
  });
});

describe('esCocina', () => {
  it('por código genérico', () => {
    expect(esCocina({ codigo: '0', nombre: 'ALIMENTOS LA CASITA', categoria: 'ABARROTES' }, COCINA)).toBe(true);
    expect(esCocina({ codigo: '1000', nombre: 'CONSUMO ALIMENTOS LC' }, COCINA)).toBe(true);
  });
  it('por categoría de cocina', () => {
    expect(esCocina({ codigo: '10', nombre: 'EMPANADA ARGENTINA', categoria: 'ESPECIALES LA CASITA' }, COCINA)).toBe(true);
    expect(esCocina({ codigo: '461', nombre: 'CHAROLA CHICA', categoria: 'CHAROLAS BAGUETTES Y CARNES' }, COCINA)).toBe(true);
  });
  it('por el "LC" del final', () => {
    expect(esCocina({ codigo: '669', nombre: 'LASAÑA IND LC', categoria: 'ABARROTES' }, COCINA)).toBe(true);
    expect(esCocina({ codigo: '11', nombre: 'ROSCA DE CHOCOLATE GRANDE LC' }, COCINA)).toBe(true);
  });
  it('un abarrote normal no es cocina', () => {
    expect(esCocina({ codigo: '049000028904', nombre: '12 PACK COCA COLA', categoria: 'ABARROTES' }, COCINA)).toBe(false);
    expect(esCocina({ codigo: '1', nombre: 'LC CREMA' }, COCINA)).toBe(false); // "LC" al principio no cuenta
  });
});

// ── Regresiones de la revisión adversarial ──────────────────────────────────
describe('regresiones', () => {
  it('sin conteo NO sugiere cantidad (antes decía "faltan 35" junto a "cuéntalo")', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 2', vendidasVentana: 70, stock: null });
    expect(r.estado).toBe('sin_conteo');
    expect(r.sugerido).toBe(0);
    expect(r.accion.texto).toContain('cuéntalo con la TC52');
  });

  it('una venta negativa (más devoluciones que ventas) no cuenta como que se vende', () => {
    const r = calcular({ codigo: 'x', area: 'Casita 1', vendidasVentana: -3, stock: 5 });
    expect(r.ventaDiaria).toBeLessThan(0);
    expect(r.estado).toBe('ok');       // no urgente
    expect(r.sugerido).toBe(0);
  });
});
