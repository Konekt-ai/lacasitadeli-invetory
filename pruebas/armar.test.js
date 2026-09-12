import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { armarSnapshot, limpiarCategoria, limpiarNombre } from '../src/calculos/armar.js';
import { vistaBuscar, vistaMasVendidos, vistaProducto, vistaResurtido, vistaSinVenta } from '../src/servicios/vistas.js';
import { AHORA, OPCIONES, datosCompletos, haceDias } from './datos-de-prueba.js';

const snap = armarSnapshot(datosCompletos(), OPCIONES);
const dame = codigo => snap.porCodigo.get(codigo);

describe('armarSnapshot', () => {
  it('solo toma las áreas activas y respeta su orden', () => {
    expect(snap.areas.map(a => a.nombre)).toEqual(['Bodega', 'Casita 1', 'Casita 2', 'Cocina']);
    expect(snap.areasVenta).toEqual(['Casita 1', 'Casita 2']);
    expect(snap.areasRespaldo).toEqual(['Bodega']);
  });

  it('suma las piezas de todas las áreas', () => {
    expect(dame('098733').piezas).toBe(507);
    expect(dame('012000809996').piezas).toBe(348);
  });

  it('clasifica cada caso donde va', () => {
    expect(dame('098733').clase).toBe('duplicado_probable');
    expect(dame('012000809996').clase).toBe('descontinuado');
    expect(dame('111111111111').clase).toBe('nuevo');
    expect(dame('222222222222').clase).toBe('lento');
    expect(dame('333333333333').clase).toBe('activo');
    expect(dame('444444444444').clase).toBe('sin_alta');
  });

  it('la fila en cero cuenta como "contado", no como "sin contar"', () => {
    const p = dame('555555555555');
    expect(p.piezas).toBe(0);
    expect(p.porArea.get('Casita 2').cantidad).toBe(0);
  });

  it('marca la comida de cocina', () => {
    expect(dame('0').esCocina).toBe(true);
    expect(dame('333333333333').esCocina).toBe(false);
  });

  it('quita el IVA del nombre de la categoría y el dinero de los nombres', () => {
    expect(dame('555555555555').categoria).toBe('ABARROTES');
    expect(limpiarCategoria('TÉS E INFUSIONES SIN IVA')).toBe('TÉS E INFUSIONES');
    expect(limpiarNombre('SEGUNDA PIEZA GOMAS POR $40 PESOS LAS DOS')).not.toMatch(/\$|40/);
    expect(limpiarNombre('Celery seed Morton $ bassett')).toBe('Celery seed Morton bassett');
  });

  it('cuenta piezas paradas y por área', () => {
    expect(snap.resumen.conPiezas).toBe(6);
    const casita1 = snap.resumen.porArea.find(a => a.area === 'Casita 1');
    expect(casita1.piezas).toBe(90);
  });

  it('los códigos de caja heredan sus ventas al producto suelto', () => {
    const conCaja = armarSnapshot(datosCompletos({
      equivalencias: [{ codigo: '00987339', codigo_base: '098733', unidades: 1 }],
    }), OPCIONES);
    // Ahora 098733 "vende" por su código de caja: ya no es un duplicado sin ventas.
    expect(conCaja.porCodigo.get('098733').ultimaVenta).not.toBeNull();
    expect(conCaja.porCodigo.get('098733').clase).not.toBe('duplicado_probable');
  });

  it('no guarda productos que ni tienen piezas ni se han vendido en la ventana', () => {
    const conBasura = armarSnapshot(datosCompletos({
      historial: [...datosCompletos().historial, { codigo: '999999999999', ultima: haceDias(900), v120: 0 }],
    }), OPCIONES);
    expect(conBasura.porCodigo.has('999999999999')).toBe(false);
  });

  it('el resurtido solo mira las áreas de venta', () => {
    const areas = new Set(snap.resurtido.map(r => r.area));
    expect([...areas].sort()).toEqual(['Casita 1', 'Casita 2']);
  });

  it('detecta el urgente con respaldo en Bodega (menos lo apartado)', () => {
    const fila = snap.resurtido.find(r => r.codigo === '333333333333' && r.area === 'Casita 1');
    expect(fila.estado).toBe('urgente');
    expect(fila.accion.texto).toBe('Surte 32 de Bodega (hay 32)');
  });

  it('desfasado: contado en 0 y se sigue vendiendo (caso GHIRARDELLI)', () => {
    const p = dame('555555555555');
    expect(p.desfase.piezas).toBe(20);
    expect(p.desfase.areas).toEqual(['Casita 2']);
    expect(p.porArea.get('Casita 2').desfase.piezas).toBe(20);
    const fila = snap.resurtido.find(r => r.codigo === '555555555555' && r.area === 'Casita 2');
    expect(fila.estado).toBe('desfasado');
    expect(fila.accion.texto).toBe('Cuéntalo con la TC52: el sistema dice 0 y se sigue vendiendo');
    expect(fila.accion.nota).toBe('Se vendieron 20 sin existencia en Casita 2 desde el 2 sep');
  });

  it('una venta en cero vieja y nada desde entonces no es desfase (de verdad se acabó)', () => {
    const viejo = armarSnapshot(datosCompletos({
      desfases: [{ codigo: '555555555555', area: 'Casita 2', piezas: 3, desde: haceDias(60), ultima: haceDias(40) }],
    }), OPCIONES);
    expect(viejo.porCodigo.get('555555555555').desfase).toBeNull();
  });

  it('si HOY ya tiene piezas no está desfasado, aunque antes se vendiera en cero', () => {
    expect(dame('333333333333').desfase).toBeNull();
    const fila = snap.resurtido.find(r => r.codigo === '333333333333' && r.area === 'Casita 1');
    expect(fila.estado).toBe('urgente');
  });

  it('las ventas de 90 días se suman aparte, por área', () => {
    expect(dame('333333333333').vendidas.d90).toBe(420);
    expect(dame('222222222222').vendidas.d90).toBe(3);
    expect(dame('222222222222').vendidas.d30).toBe(0);
    expect(dame('555555555555').porArea.get('Casita 2').v90).toBe(170);
  });

  it('marca lo que nunca se contó en ninguna área (comida preparada)', () => {
    const fila = snap.resurtido.find(r => r.codigo === '0' && r.area === 'Casita 1');
    expect(fila.nuncaContado).toBe(true);
    expect(fila.esCocina).toBe(true);
  });
});

describe('vistas', () => {
  // Los textos ("hace 45 días", "desde el 2 sep") se escriben contra el reloj de
  // verdad. Sin fijarlo, esta prueba caducó sola al día siguiente de escribirse.
  // AHORA es hora de pared de CDMX: el instante real es 6 h después en UTC.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(AHORA.getTime() + 6 * 3_600_000));
  });
  afterAll(() => { vi.useRealTimers(); });

  it('sin-venta: tarjetas, filtro por clase y orden por piezas', () => {
    const v = vistaSinVenta(snap, { clase: 'descontinuado' }, OPCIONES);
    expect(v.cuantos).toBe(1);
    expect(v.productos[0].codigo).toBe('012000809996');
    expect(v.tarjetas.find(t => t.clase === 'duplicado_probable').productos).toBe(1);
  });

  it('sin-venta: el filtro por área solo trae lo que hay ahí', () => {
    const v = vistaSinVenta(snap, { clase: 'todos', area: 'Casita 2' }, OPCIONES);
    expect(v.productos.map(p => p.codigo)).toContain('098733');
    expect(v.productos.map(p => p.codigo)).not.toContain('111111111111');
  });

  it('sin-venta: el filtro de días deja pasar a los que nunca se vendieron', () => {
    const v = vistaSinVenta(snap, { clase: 'todos', dias: 180 }, OPCIONES);
    expect(v.productos.map(p => p.codigo)).toContain('012000809996');
    expect(v.productos.map(p => p.codigo)).not.toContain('222222222222');
  });

  it('la tarjeta del duplicado dice con qué código sí se vende', () => {
    const v = vistaSinVenta(snap, { clase: 'duplicado_probable' }, OPCIONES);
    expect(v.productos[0].duplicado.texto).toBe('Se vende como 00987339 KINDER JOY');
  });

  it('resurtido: esconde cocina y lo nunca contado, y ordena por urgencia', () => {
    const v = vistaResurtido(snap, {});
    expect(v.urgentes.length).toBeGreaterThan(0);
    expect(v.urgentes.every(r => !r.esCocina)).toBe(true);
    expect(v.urgentes.map(r => r.codigo)).not.toContain('0');
  });

  it('resurtido: si se pide, aparece la comida de cocina', () => {
    const v = vistaResurtido(snap, { incluirCocina: true, incluirSinConteo: true });
    const todos = [...v.urgentes, ...v.bajos, ...v.sinConteo].map(r => r.codigo);
    expect(todos).toContain('0');
  });

  it('más vendidos: por piezas, sin comida de cocina', () => {
    const v = vistaMasVendidos(snap, { dias: 30 });
    expect(v.productos[0].codigo).toBe('333333333333');
    expect(v.productos.map(p => p.codigo)).not.toContain('0');
  });

  it('más vendidos: por área usa lo vendido en esa área', () => {
    const v = vistaMasVendidos(snap, { dias: 7, area: 'Casita 2' });
    expect(v.productos.map(p => p.codigo)).toEqual(['555555555555']);
  });

  it('más vendidos: últimos 90 días', () => {
    const v = vistaMasVendidos(snap, { dias: 90 });
    expect(v.filtros.dias).toBe(90);
    expect(v.productos.map(p => p.codigo)).toEqual(['333333333333', '555555555555', '222222222222']);
    expect(v.productos[0].piezas).toBe(420);
    // Un número de días que no existe cae en 30, no en un campo vacío.
    expect(vistaMasVendidos(snap, { dias: 45 }).filtros.dias).toBe(30);
  });

  it('más vendidos: avisa cuando el "quedan 0" es falso', () => {
    const agua = vistaMasVendidos(snap, { dias: 30 }).productos.find(p => p.codigo === '555555555555');
    expect(agua.piezasEnTienda).toBe(0);
    expect(agua.desfase).toBe(20);
    expect(agua.desfaseEn).toBe('Casita 2');
    const enCasita1 = vistaMasVendidos(snap, { dias: 30, area: 'Casita 1' }).productos.find(p => p.codigo === '333333333333');
    expect(enCasita1.desfase).toBe(0);
  });

  it('resurtido: los desfasados van en su propio grupo, no en urgentes', () => {
    const v = vistaResurtido(snap, {});
    expect(v.desfasados.map(r => r.codigo)).toEqual(['555555555555']);
    expect(v.cuentas.desfasados).toBe(1);
    expect(v.urgentes.map(r => r.codigo)).not.toContain('555555555555');
    expect(v.desfasados[0].accionTipo).toBe('contar');
    expect(v.desfasados[0].sugerido).toBe(0);
  });

  it('ficha: explica el desfase y en qué área', () => {
    const p = vistaProducto(snap, '555555555555');
    expect(p.desfase.texto).toBe('En Casita 2 el sistema dice 0, pero se han vendido 20 piezas desde el 2 sep. Hay que contarlo con la TC52.');
    expect(p.areasTodas.find(a => a.area === 'Casita 2').desfase).toBe(20);
    expect(vistaProducto(snap, '333333333333').desfase).toBeNull();
  });

  it('buscar: por código y por nombre', () => {
    expect(vistaBuscar(snap, { q: '098733' }).productos[0].codigo).toBe('098733');
    expect(vistaBuscar(snap, { q: 'pepsi' }).productos[0].codigo).toBe('012000809996');
    expect(vistaBuscar(snap, { q: 'z' }).cuantos).toBe(0);
  });

  it('ficha: muestra TODAS las áreas y separa "sin contar" de cero', () => {
    const p = vistaProducto(snap, '555555555555');
    const casita2 = p.areasTodas.find(a => a.area === 'Casita 2');
    const bodega = p.areasTodas.find(a => a.area === 'Bodega');
    expect(casita2).toMatchObject({ contado: true, piezas: 0 });
    expect(bodega).toMatchObject({ contado: false, piezas: null });
  });

  it('ficha: un código que no existe devuelve null', () => {
    expect(vistaProducto(snap, 'no-existe')).toBeNull();
  });

  it('los textos vienen listos para el celular', () => {
    const v = vistaSinVenta(snap, { clase: 'duplicado_probable' }, OPCIONES);
    expect(v.productos[0].ventaTexto).toBe('Nunca se ha vendido');
    const lento = vistaSinVenta(snap, { clase: 'lento' }, OPCIONES).productos[0];
    expect(lento.ventaTexto).toBe('Última venta: hace 45 días');
  });

  it('la hora de "actualizado" sale del reloj de la caja', () => {
    expect(snap.generado).toBe('2026-09-11T14:30:00-06:00');
    expect(AHORA.getUTCHours()).toBe(14);
  });
});

// ── Regresiones de la revisión adversarial ──────────────────────────────────
describe('regresiones', () => {
  it('la fecha de entrada por área no se corre un día si llegó de tarde', () => {
    // La tienda recibe de tarde: 19:15 hora de la tienda. Antes salía "30 ago".
    const tarde = new Date(Date.UTC(2026, 7, 29, 19, 15));
    const s = armarSnapshot(datosCompletos({
      inventario: [{ codigo: '777', ubicacion: 'Casita 1', cantidad: 5, ultima_entrada: tarde, ultima_salida: null, creado: tarde, nombre: 'PRODUCTO DE TARDE' }],
    }), OPCIONES);
    const p = vistaSinVenta(s, { clase: 'todos' }, OPCIONES).productos.find(x => x.codigo === '777');
    expect(p.areas[0].entradaTexto).toBe('29 ago');
    expect(p.entradaTexto).toBe('Última entrada: 29 ago');
  });

  it('las ventas por código de caja también llegan al área (si no, el resurtido no las ve)', () => {
    const s = armarSnapshot(datosCompletos({
      inventario: [
        { codigo: '888', ubicacion: 'Casita 1', cantidad: 2, ultima_entrada: haceDias(3), ultima_salida: null, creado: haceDias(300), nombre: 'PRODUCTO CON CAJA' },
        { codigo: '888', ubicacion: 'Bodega', cantidad: 60, ultima_entrada: haceDias(3), ultima_salida: null, creado: haceDias(300), nombre: 'PRODUCTO CON CAJA' },
      ],
      // Se vende SOLO con el código de la caja, que trae 12 piezas.
      ventasArea: [{ area: 'Casita 1', codigo: '888CAJA', v7: 2, v14: 4, v30: 8 }],
      historial: [{ codigo: '888CAJA', ultima: haceDias(1), v120: 30 }],
      equivalencias: [{ codigo: '888CAJA', codigo_base: '888', unidades: 12 }],
      catalogo: [{ codigo: '888', art_codigo: '888', descripcion: 'PRODUCTO CON CAJA', categoria: 'ABARROTES', marca: null }],
    }), OPCIONES);
    const fila = s.resurtido.find(r => r.codigo === '888' && r.area === 'Casita 1');
    expect(fila, 'el producto debe entrar al resurtido por lo vendido en cajas').toBeTruthy();
    expect(fila.vendidas14).toBe(48);          // 4 cajas × 12 piezas
    expect(fila.estado).toBe('urgente');       // vende 3.4 al día y quedan 2
  });

  it('el orden de la lista no depende del orden en que venga el inventario', () => {
    const datos = datosCompletos();
    const alReves = { ...datos, inventario: [...datos.inventario].reverse() };
    const a = vistaSinVenta(armarSnapshot(datos, OPCIONES), { clase: 'todos' }, OPCIONES);
    const b = vistaSinVenta(armarSnapshot(alReves, OPCIONES), { clase: 'todos' }, OPCIONES);
    expect(b.productos.map(p => p.codigo)).toEqual(a.productos.map(p => p.codigo));
  });

  it('la lista de resurtido trae un tope pero dice cuántos hay en total', () => {
    const v = vistaResurtido(snap, {}, { tope: 1 });
    expect(v.urgentes.length).toBeLessThanOrEqual(1);
    expect(v.cuentas.urgentes).toBeGreaterThanOrEqual(v.urgentes.length);
  });
});
