// Pruebas de las vistas de la versión 2 (src/servicios/vistas.js): Inventario,
// buscador, ficha, Resurtir, Movimiento, Alertas y el encabezado. Trabajan sobre
// la foto armada con los datos de mentiras (pruebas/datos-de-prueba.js); nada de
// SQL. Los números esperados salen de esos datos, caso por caso.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { armarSnapshot } from '../src/calculos/armar.js';
import {
  productoJson, vistaAlertas, vistaBuscar, vistaEstado, vistaInventario, vistaMovimiento, vistaProducto, vistaResurtir,
} from '../src/servicios/vistas.js';
import { AHORA, INVENTARIO, OPCIONES, datosCompletos } from './datos-de-prueba.js';

const snap = armarSnapshot(datosCompletos(), OPCIONES);
const codigos = v => v.productos.map(p => p.codigo);

// Palabras que NO pueden salir como llave, ni dinero en ningún texto.
const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$/i;
const DINERO_EN_TEXTO = /\$|\bpesos\b|\bmxn\b/i;
function problemasDePrivacidad(valor, donde = '') {
  const problemas = [];
  const mirar = (v, ruta) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => mirar(x, `${ruta}[${i}]`)); return; }
    if (v instanceof Date) return;
    if (typeof v === 'object') {
      for (const [k, sub] of Object.entries(v)) {
        if (LLAVES_PROHIBIDAS.test(k)) problemas.push(`llave de dinero: ${ruta}.${k}`);
        mirar(sub, `${ruta}.${k}`);
      }
      return;
    }
    if (typeof v === 'string' && DINERO_EN_TEXTO.test(v)) problemas.push(`texto con dinero en ${ruta}: ${v.slice(0, 60)}`);
  };
  mirar(valor, donde);
  return problemas;
}

// Los textos ("hace 45 días", "hoy") se escriben contra el reloj: se fija para
// que las pruebas no caduquen. AHORA es hora de pared de CDMX (6 h después en UTC).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AHORA.getTime() + 6 * 3_600_000));
});
afterAll(() => { vi.useRealTimers(); });

describe('vistaInventario', () => {
  it('por defecto: solo con piezas, sin cocina, ordenado por piezas con desempate fijo', () => {
    const v = vistaInventario(snap, {});
    expect(v.cuantos).toBe(10);
    expect(v.pagina).toBe(1);
    expect(v.porPagina).toBe(60);
    expect(v.hayMas).toBe(false);
    expect(codigos(v)).toEqual([
      '098733', '999000000000', '012000809996', '888888888888', '333333333333',
      '111111111111', '444444444444', '126490', '222222222222', '666666666666',
    ]);
    expect(codigos(v)).not.toContain('0');            // cocina fuera
    expect(codigos(v)).not.toContain('555555555555'); // contado en 0
  });

  it('las condiciones filtran y se cumplen TODAS a la vez', () => {
    expect(codigos(vistaInventario(snap, { condiciones: 'descontinuado' }))).toEqual(['012000809996']);
    expect(codigos(vistaInventario(snap, { condiciones: 'sin_alta' }))).toEqual(['444444444444']);
    expect(codigos(vistaInventario(snap, { condiciones: 'bajo_stock' }))).toEqual(['333333333333', '666666666666']);
    expect(codigos(vistaInventario(snap, { condiciones: 'sin_stock' }))).toEqual([]);
    expect(codigos(vistaInventario(snap, { condiciones: 'agotado' }))).toEqual([]);
    // Al pedir agotados se ven aunque tengan 0 piezas (si no, la tarjeta "N agotados" abría una lista vacía).
    const sinDesfase = armarSnapshot(datosCompletos({ desfases: [] }), OPCIONES);
    const agotados = vistaInventario(sinDesfase, { condiciones: 'agotado' });
    expect(codigos(agotados)).toEqual(['555555555555']);
    expect(agotados.filtros.soloConPiezas).toBe(false);
    expect(agotados.productos[0].faltaEn).toEqual(['Casita 2']);
    expect(agotados.productos[0].hayEn).toEqual([]);
    // Pepsi tiene sobrestock Y sin movimiento 90+; el pumpkin pie es 180+ (tramo mayor), no 90.
    expect(codigos(vistaInventario(snap, { condiciones: 'sobrestock,sin_movimiento_90' }))).toEqual(['012000809996']);
    expect(codigos(vistaInventario(snap, { condiciones: ['sobrestock', 'sin_movimiento_180'] }))).toEqual(['999000000000']);
    // Una condición inventada se ignora (no filtra nada).
    expect(vistaInventario(snap, { condiciones: 'inventada' }).cuantos).toBe(10);
  });

  it('descontinuado es SOLO el que marcó el dueño: los parados de 90+ días no lo son', () => {
    const parados = vistaInventario(snap, { condiciones: 'sin_movimiento_90' });
    expect(codigos(parados)).toEqual(['012000809996']);
    expect(parados.productos[0].descontinuado).toBe(true);
    const pumpkin = vistaInventario(snap, { condiciones: 'sin_movimiento_180' }).productos[0];
    expect(pumpkin.codigo).toBe('999000000000');
    expect(pumpkin.descontinuado).toBe(false);
    expect(pumpkin.condiciones).not.toContain('descontinuado');
  });

  it('prioridad, área, categoría y texto', () => {
    expect(codigos(vistaInventario(snap, { prioridad: 'alta' }))).toEqual(['333333333333']);
    expect(codigos(vistaInventario(snap, { area: 'Casita 2' }))).toEqual(['098733']);
    // La categoría propia del Admin manda sobre la de NovaCaja (el té es "Tés").
    expect(codigos(vistaInventario(snap, { categoria: 'Tés' }))).toEqual(['222222222222']);
    expect(codigos(vistaInventario(snap, { q: 'pepsi' }))).toEqual(['012000809996']);
    expect(codigos(vistaInventario(snap, { q: '3333' }))).toEqual(['333333333333']);
  });

  it('"incluir contados en 0" y "ver cocina" abren la lista completa', () => {
    expect(vistaInventario(snap, { soloConPiezas: '0' }).cuantos).toBe(13);
    expect(vistaInventario(snap, { soloConPiezas: '0', cocina: '1' }).cuantos).toBe(14);
    expect(codigos(vistaInventario(snap, { soloConPiezas: '0' }))).toContain('555555555555');
  });

  it('orden por cobertura: lo más urgente primero, sin cobertura al final', () => {
    const v = vistaInventario(snap, { orden: 'cobertura' });
    expect(v.productos.slice(0, 3).map(p => `${p.codigo}:${p.coberturaDias}`)).toEqual(['333333333333:0.6', '666666666666:6', '888888888888:140']);
    expect(v.productos.at(-1).coberturaDias).toBeNull();
  });

  it('paginación estable', () => {
    expect(vistaInventario(snap, { porPagina: 3, pagina: 1 }).hayMas).toBe(true);
    expect(codigos(vistaInventario(snap, { porPagina: 3, pagina: 2 }))).toEqual(['888888888888', '333333333333', '111111111111']);
    expect(vistaInventario(snap, { porPagina: 999 }).porPagina).toBe(200);
  });

  it('el orden no depende del orden en que venga el inventario', () => {
    const revuelto = armarSnapshot(datosCompletos({ inventario: [...INVENTARIO].reverse() }), OPCIONES);
    expect(codigos(vistaInventario(revuelto, {}))).toEqual(codigos(vistaInventario(snap, {})));
  });

  it('cada producto trae la forma del contrato', () => {
    const p = vistaInventario(snap, { q: 'chocolate' }).productos[0];
    expect(p).toMatchObject({
      codigo: '333333333333', artCodigo: '333333333333', categoria: 'CHOCOLATES', categoriaFuente: 'caja',
      alta: true, esCocina: false, descontinuado: false, piezas: 43, apartadas: 8,
      clase: 'activo', prioridad: 'alta', enCatalogoSolo: false,
    });
    expect(p.condiciones).toEqual(expect.arrayContaining(['bajo_stock', 'mas_vendidos']));
    expect(p.ventaDiaria).toBe(5);
    expect(p.coberturaDias).toBe(0.6);
    expect(p.rotacion).toBe(3.49);
    expect(p.tendencia).toEqual({ d7: 0, d30: 50, d90: 133.3 });
    expect(p.areas.find(a => a.area === 'Casita 1')).toMatchObject({ piezas: 3, vendidas14: 70, cobertura: 0.6 });
    expect(p.areas.find(a => a.area === 'Bodega')).toMatchObject({ piezas: 40, apartadas: 8 });
    expect(p.ventaTexto).toBe('Última venta: hoy');
  });
});

describe('vistaBuscar', () => {
  it('encuentra lo de la tienda primero y cae al catálogo completo', () => {
    const v = vistaBuscar(snap, { q: 'mostaza' });
    expect(v.cuantos).toBe(1);
    expect(v.deCatalogo).toBe(1);
    expect(v.productos[0]).toMatchObject({ codigo: '777777777777', nombre: 'MOSTAZA DIJON', enCatalogoSolo: true, piezas: 0, areas: [], condiciones: [] });
  });

  it('por nombre y por código, con piezas primero', () => {
    expect(codigos(vistaBuscar(snap, { q: 'kinder' }))).toEqual(['098733', '00987339']);
    expect(codigos(vistaBuscar(snap, { q: '012000809996' }))[0]).toBe('012000809996');
    expect(vistaBuscar(snap, { q: 'k' })).toEqual({ q: 'k', cuantos: 0, productos: [], deCatalogo: 0 });
  });
});

describe('vistaProducto', () => {
  const movimientos = [{
    fecha: new Date(Date.UTC(2026, 8, 10, 15, 0)), tipo: 'traslado', motivo: null, cantidad: 5,
    ubicacion: 'Casita 1', area: 'Bodega', stock_antes: 30, stock_despues: 35,
  }];
  const solicitudes = [{
    id: 1, codigo_barras: '012000809996', nombre_mostrar: 'PEPSI', de_ubicacion: 'Bodega', a_ubicacion: 'Casita 1',
    cantidad: 3, estado: 'pendiente', creado: '2026-09-10T10:00:00-06:00', total: 99,
  }];

  it('la ficha del descontinuado lo dice, sin resurtido, con movimientos y solicitudes explicados', () => {
    const p = vistaProducto(snap, '012000809996', { movimientos, solicitudes });
    expect(p.descontinuado).toBe(true);
    expect(p.descontinuadoDesde).toBe('2026-08-22T14:30:00-06:00');
    expect(p.condiciones).toContain('descontinuado');
    expect(p.resurtido).toEqual([]);
    expect(p.areasTodas.map(a => a.area)).toEqual(['Bodega', 'Casita 1', 'Casita 2', 'Cocina']);
    expect(p.areasTodas.find(a => a.area === 'Cocina')).toMatchObject({ contado: false, piezas: null });
    expect(p.movimientos[0]).toMatchObject({
      fecha: '2026-09-10T15:00:00-06:00', fechaTexto: '10 sep 15:00', tipo: 'traslado', cantidad: 5,
      area: 'Casita 1', areaOrigen: 'Bodega', stockAntes: 30, stockDespues: 35, texto: 'Traslado de 5 de Bodega a Casita 1',
    });
    // Las solicitudes del admin salen solo con los campos del contrato (nada de "total").
    expect(p.solicitudes[0]).toMatchObject({ id: 1, estado: 'pendiente', cantidad: 3, a_ubicacion: 'Casita 1' });
    expect(p.solicitudes[0]).not.toHaveProperty('total');
    expect(p.vendidas).toMatchObject({ d14: 0, d60: 0, d180: 0 });
  });

  it('un producto que solo está en el catálogo tiene ficha mínima; uno inexistente, no', () => {
    const p = vistaProducto(snap, '777777777777');
    expect(p.enCatalogoSolo).toBe(true);
    expect(p.areasTodas.every(a => !a.contado)).toBe(true);
    expect(p.movimientos).toEqual([]);
    expect(vistaProducto(snap, 'no-existe')).toBeNull();
  });

  it('la fecha de entrada por área no se corre un día si llegó de tarde', () => {
    const tarde = armarSnapshot(datosCompletos({
      inventario: [{ codigo: '333333333333', ubicacion: 'Casita 1', cantidad: 3, ultima_entrada: new Date(Date.UTC(2026, 8, 9, 19, 30)), ultima_salida: null, creado: new Date(Date.UTC(2026, 7, 1)), nombre: 'CHOCOLATE' }],
    }), OPCIONES);
    const p = productoJson(tarde.porCodigo.get('333333333333'), { ahora: AHORA });
    expect(p.areas[0].entradaTexto).toBe('9 sep');
    expect(p.entradaTexto).toBe('Última entrada: 9 sep');
  });
});

describe('vistaResurtir', () => {
  const pendientes = [{ id: 7, codigo_barras: '333333333333', a_ubicacion: 'Casita 1', cantidad: 20, estado: 'pendiente', creado: '2026-09-11T09:00:00-06:00' }];
  const conteo = { pendiente: 1, hecha: 2, cancelada: 0 };

  it('tarjetas, filas ordenadas por urgencia, acción en texto y la solicitud pendiente del admin', () => {
    const v = vistaResurtir(snap, {}, { pendientes, conteo });
    expect(v.tarjetas).toEqual({ urgentes: 1, piezasAMover: 32, transferencias: 1, sinRespaldo: 1, sucursalMasUrgente: 'Casita 1', desfasados: 1, sinConteo: 1 });
    expect(v.cuantos).toBe(3);
    expect(v.filas.map(f => `${f.codigo}|${f.area}|${f.estado}`)).toEqual([
      '333333333333|Casita 1|urgente', '555555555555|Casita 2|desfasado', '666666666666|Casita 1|bajo',
    ]);
    const choco = v.filas[0];
    expect(choco).toMatchObject({ accionTipo: 'surtir', accion: 'Mover 32 de Bodega (hay 32)', sugerido: 32, enBodega: 32, prioridad: 'alta', piezasArea: 3, categoria: 'CHOCOLATES' });
    expect(choco.solicitud).toEqual({ id: 7, estado: 'pendiente', cantidad: 20, creado: '2026-09-11T09:00:00-06:00' });
    expect(v.filas[1]).toMatchObject({ accionTipo: 'contar', accion: 'Cuéntalo con la TC52: el sistema dice 0 y se sigue vendiendo', solicitud: null });
    expect(v.filas[2]).toMatchObject({ accionTipo: 'revisar_respaldo', accion: 'Sin respaldo en bodega: hay que comprarlo' });
    expect(v.historial).toEqual({ pendientes: 1, hechas: 2, canceladas: 0 });
    expect(JSON.stringify(v)).not.toMatch(/proveedor/i);
  });

  it('horizonte, condición y "ver lo no contado"', () => {
    expect(vistaResurtir(snap, { horizonte: 'hoy' }).filas.map(f => f.codigo)).toEqual(['333333333333', '555555555555']);
    expect(vistaResurtir(snap, { condicion: 'bajo_stock' }).filas.map(f => f.codigo)).toEqual(['333333333333', '666666666666']);
    expect(vistaResurtir(snap, { condicion: 'sin_stock' }).filas).toEqual([]);
    const conTodo = vistaResurtir(snap, { sinConteo: '1', cocina: '1' }).filas.map(f => `${f.codigo}|${f.estado}`);
    expect(conTodo).toContain('0|sin_conteo');
    expect(conTodo).toContain('00987339|sin_conteo');
    expect(vistaResurtir(snap, {}).filas.map(f => f.codigo)).not.toContain('0');
  });

  it('sin admin: historial null y ninguna solicitud marcada', () => {
    const v = vistaResurtir(snap, {});
    expect(v.historial).toBeNull();
    expect(v.filas.every(f => f.solicitud === null)).toBe(true);
  });
});

describe('vistaMovimiento', () => {
  it('KPIs con el periodo anterior, top, categorías, sucursales y mapas de calor', () => {
    const m = vistaMovimiento(snap, { dias: 30 });
    expect(m.filtros).toEqual({ dias: 30, area: '', incluirCocina: false });
    expect(m.kpis).toEqual({
      d7: { piezas: 56, anterior: 57, cambio: -1.8 },
      d30: { piezas: 242, anterior: 175, cambio: 38.3 },
      d90: { piezas: 689, anterior: 276, cambio: 149.6 },
    });
    expect(m.top[0]).toMatchObject({ codigo: '333333333333', piezas: 150 });
    expect(m.top.map(t => t.codigo)).not.toContain('0');
    expect(m.categorias[0]).toEqual({ nombre: 'CHOCOLATES', piezas: 150, porcentaje: 62 });
    expect(m.sucursales.map(s => s.area).sort()).toEqual(['Casita 1', 'Casita 2']);
    expect(m.calor.dias).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
    expect(m.calor.nota).toMatch(/sábado y domingo/i);
    expect(m.calor.categoriaDia.length).toBeGreaterThan(0);
    expect(m.calor.fechas.length).toBe(30);
    expect(m.ranking.length).toBeGreaterThan(0);
    expect(m.ranking[0]).toHaveProperty('rotacion');
  });

  it('por sucursal y periodo corto; anterior en 0 da cambio null', () => {
    const m = vistaMovimiento(snap, { dias: 7, area: 'Casita 2' });
    expect(m.kpis.d7).toEqual({ piezas: 14, anterior: 14, cambio: 0 });
    expect(m.kpis.d90).toEqual({ piezas: 170, anterior: 0, cambio: null });
  });

  it('la misma pregunta dos veces devuelve el mismo objeto (caché por foto)', () => {
    expect(vistaMovimiento(snap, { dias: 90 })).toBe(vistaMovimiento(snap, { dias: 90 }));
  });
});

describe('vistaAlertas', () => {
  const descartadas = new Map([['duplicado:098733', { usuario: 'dueno', cuando: '2026-09-11T10:00:00-06:00' }]]);

  it('cuenta por grupo, esconde las descartadas y filtra', () => {
    const v = vistaAlertas(snap, {}, { descartadas });
    expect(v.conteo).toEqual({ todas: 11, urgentes: 3, codigos: 1, caja: 1, catalogo: 2, inventario: 7, descartadas: 1 });
    expect(v.cuantos).toBe(11);
    expect(v.alertas.map(a => a.id)).not.toContain('duplicado:098733');
    expect(v.alertas.every(a => a.descartada === null)).toBe(true);
    // Primero las urgentes y, entre ellas, las de más piezas.
    expect(vistaAlertas(snap, { filtro: 'urgentes' }).alertas.map(a => a.id)).toEqual([
      'duplicado:098733', 'sin_alta:444444444444', 'duplicado:126490', 'desfasado:555555555555',
    ]);
    expect(vistaAlertas(snap, { filtro: 'caja' }).alertas.map(a => a.id)).toEqual(['sin_alta:444444444444']);
    expect(vistaAlertas(snap, { filtro: 'inventada' }).conteo.todas).toBe(12);
  });

  it('la lista se topa pero cuantos dice el total', () => {
    const v = vistaAlertas(snap, { limite: 2 });
    expect(v.alertas.length).toBe(2);
    expect(v.cuantos).toBe(12);
    expect(v.alertas.every(a => a.prioridad === 'alta')).toBe(true);
  });

  it('con descartadas=1 salen marcadas con quién y cuándo', () => {
    const v = vistaAlertas(snap, { descartadas: '1' }, { descartadas });
    const d = v.alertas.find(a => a.id === 'duplicado:098733');
    expect(d.descartada).toEqual({ usuario: 'dueno', cuando: '2026-09-11T10:00:00-06:00' });
  });

  it('cada alerta explica qué hacer, en sencillo y sin dinero', () => {
    const v = vistaAlertas(snap, {});
    const sinAlta = v.alertas.find(a => a.id === 'sin_alta:444444444444');
    expect(sinAlta).toMatchObject({ grupo: 'caja', prioridad: 'alta', codigo: '444444444444', piezas: 18 });
    expect(sinAlta.texto).toMatch(/no se puede cobrar bien/);
    const dup = v.alertas.find(a => a.id === 'duplicado:098733');
    expect(dup.texto).toMatch(/Se vende como 00987339 KINDER JOY/);
    const estancado = v.alertas.find(a => a.id === 'estancado:999000000000');
    expect(estancado.texto).toMatch(/180\+ días/);
    expect(v.alertas.find(a => a.id === 'estancado:012000809996')).toBeUndefined(); // descontinuado: no se le pide decidir
    // "Sin categoría" solo para lo que sí se vende (el agua vende 60 en 30 días; la Pepsi parada, no).
    expect(v.alertas.find(a => a.id === 'sin_categoria:555555555555')).toBeDefined();
    expect(v.alertas.find(a => a.id === 'sin_categoria:012000809996')).toBeUndefined();
  });
});

describe('vistaEstado', () => {
  it('trae resumen del día, cobertura, categorías, capacidades y umbrales', () => {
    const e = vistaEstado(snap, { calculando: false }, 'dueno', { capacidades: { solicitudes: true, fotos: true, overrides: true }, umbrales: { ...OPCIONES, sobrestockDias: 120, sobrestockMin: 24, topMasVendidos: 50 } });
    expect(e.listo).toBe(true);
    expect(e.usuario).toBe('dueno');
    expect(e.resumenDia).toEqual({ urgentes: 2, piezasAMover: 32, agotados: 0, sinStock: 0, bajoStock: 2, sobrestock: 4, sinMovimiento90: 2, descontinuados: 1, alertas: 12, alertasUrgentes: 4 });
    expect(e.coberturaSucursal).toEqual([
      { area: 'Casita 1', medianaDias: 6, productosQueVenden: 3, urgentes: 1 },
      { area: 'Casita 2', medianaDias: null, productosQueVenden: 1, urgentes: 1 },
    ]);
    expect(e.categorias[0]).toEqual({ nombre: 'Sin categoría', productos: 4 });
    expect(e.capacidades).toEqual({ solicitudes: true, fotos: true, overrides: true, shopify: false });
    expect(e.umbrales).toMatchObject({ coberturaBajaDias: 7, sobrestockDias: 120, sobrestockMin: 24, topMasVendidos: 50 });
    expect(e.areasVenta).toEqual(['Casita 1', 'Casita 2']);
  });

  it('sin foto todavía', () => {
    const e = vistaEstado(null, { calculando: true }, null, {});
    expect(e).toMatchObject({ listo: false, calculando: true, resumen: null, resumenDia: null, coberturaSucursal: [], categorias: [] });
  });
});

describe('privacidad de todas las vistas', () => {
  it('ninguna vista trae llaves ni textos de dinero', () => {
    const salidas = [
      vistaEstado(snap, {}, 'dueno', { capacidades: {}, umbrales: OPCIONES }),
      vistaInventario(snap, { soloConPiezas: '0', cocina: '1', porPagina: 200 }),
      vistaBuscar(snap, { q: 'a' }), vistaBuscar(snap, { q: 'mostaza' }),
      vistaProducto(snap, '333333333333', { movimientos: [], solicitudes: [] }),
      vistaProducto(snap, '777777777777'),
      vistaResurtir(snap, { sinConteo: '1', cocina: '1' }),
      vistaMovimiento(snap, { dias: 7 }), vistaMovimiento(snap, { dias: 30, cocina: '1' }), vistaMovimiento(snap, { dias: 90, area: 'Casita 1' }),
      vistaAlertas(snap, { descartadas: '1' }),
    ];
    const problemas = salidas.flatMap((s, i) => problemasDePrivacidad(s, `vista${i}`));
    expect(problemas).toEqual([]);
    expect(JSON.stringify(salidas)).not.toMatch(/proveedor/i);
  });
});
