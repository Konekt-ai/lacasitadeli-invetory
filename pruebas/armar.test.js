import { describe, expect, it } from 'vitest';
import {
  armarSnapshot, esCategoriaGenerica, limpiarCategoria, limpiarNombre, mediana, resolverCategoria,
} from '../src/calculos/armar.js';
import { AHORA, OPCIONES, OVERRIDES, VENTAS_AREA_90, datosCompletos, haceDias } from './datos-de-prueba.js';

// Las pruebas de las vistas (src/servicios/vistas.js) viven en pruebas/vistas.test.js:
// aquí solo se prueba la función pura armarSnapshot.

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

  it('clasifica cada caso donde va (la clase v1 se conserva; "descontinuado" ya no es clase)', () => {
    expect(dame('098733').clase).toBe('duplicado_probable');
    expect(dame('126490').clase).toBe('duplicado_probable');
    expect(dame('012000809996').clase).toBe('sin_movimiento');
    expect(dame('999000000000').clase).toBe('sin_movimiento');
    expect(dame('111111111111').clase).toBe('nuevo');
    expect(dame('222222222222').clase).toBe('lento');
    expect(dame('333333333333').clase).toBe('activo');
    expect(dame('444444444444').clase).toBe('sin_alta');
    expect(snap.productos.some(p => p.clase === 'descontinuado')).toBe(false);
  });

  it('la fila en cero cuenta como "contado", no como "sin contar"', () => {
    const p = dame('555555555555');
    expect(p.piezas).toBe(0);
    expect(p.porArea.get('Casita 2').cantidad).toBe(0);
    expect(p.porArea.get('Casita 2').disponible).toBe(0);
    expect(p.porArea.has('Bodega')).toBe(false);
  });

  it('marca la comida de cocina', () => {
    expect(dame('0').esCocina).toBe(true);
    expect(dame('333333333333').esCocina).toBe(false);
  });

  it('quita el IVA del nombre de la categoría y el dinero de los nombres', () => {
    expect(dame('555555555555').categoriaCaja).toBe('ABARROTES');
    expect(dame('222222222222').categoriaCaja).toBe('TÉS E INFUSIONES');
    expect(limpiarCategoria('TÉS E INFUSIONES SIN IVA')).toBe('TÉS E INFUSIONES');
    expect(limpiarNombre('SEGUNDA PIEZA GOMAS POR $40 PESOS LAS DOS')).not.toMatch(/\$|40/);
    expect(limpiarNombre('Celery seed Morton $ bassett')).toBe('Celery seed Morton bassett');
  });

  it('cuenta piezas paradas y por área', () => {
    expect(snap.resumen.conPiezas).toBe(10);
    const casita1 = snap.resumen.porArea.find(a => a.area === 'Casita 1');
    expect(casita1.piezas).toBe(118);
    expect(snap.resumen.porClase.sin_movimiento).toMatchObject({ productos: 2, piezas: 719 });
    expect(snap.resumen.porClase.descontinuado).toBeUndefined();
  });

  it('los códigos de caja heredan sus ventas al producto suelto', () => {
    const conCaja = armarSnapshot(datosCompletos({
      equivalencias: [{ codigo: '00987339', codigo_base: '098733', unidades: 1 }],
    }), OPCIONES);
    // Ahora 098733 "vende" por su código de caja: ya no es un duplicado sin ventas.
    expect(conCaja.porCodigo.get('098733').ultimaVenta).not.toBeNull();
    expect(conCaja.porCodigo.get('098733').clase).not.toBe('duplicado_probable');
    expect(conCaja.porCodigo.get('098733').condiciones).not.toContain('duplicado_probable');
    expect(conCaja.porCodigo.get('098733').vendidas.d180).toBe(700);
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

  it('detecta el urgente con respaldo en Bodega (menos lo apartado): "Mover N de Bodega (hay N)"', () => {
    const fila = snap.resurtido.find(r => r.codigo === '333333333333' && r.area === 'Casita 1');
    expect(fila.estado).toBe('urgente');
    expect(fila.accion.texto).toBe('Mover 32 de Bodega (hay 32)');
    expect(fila).toMatchObject({ sugerido: 32, enBodega: 32, prioridad: 'alta', categoria: 'CHOCOLATES', descontinuado: false, foto: null });
  });

  it('el sugerido se topa con lo que hay en Bodega', () => {
    const poco = armarSnapshot(datosCompletos({ reservas: [{ codigo: '333333333333', ubicacion: 'Bodega', apartado: 35 }] }), OPCIONES);
    const fila = poco.resurtido.find(r => r.codigo === '333333333333' && r.area === 'Casita 1');
    expect(fila.accion.tipo).toBe('surtir_parcial');
    expect(fila.accion.texto).toBe('Mover 5 de Bodega (hay 5)');
    expect(fila.accion.nota).toBe('Faltan 27: en Bodega no hay más, hay que comprarlos');
  });

  it('sin respaldo en Bodega la acción es comprarlo (nunca "pedir al proveedor")', () => {
    const queso = snap.resurtido.find(r => r.codigo === '666666666666' && r.area === 'Casita 1');
    expect(queso.estado).toBe('bajo');
    expect(queso.accion.texto).toBe('Sin respaldo en bodega: hay que comprarlo');
    expect(queso.enBodega).toBeNull();
    for (const r of snap.resurtido) {
      expect(`${r.accion.texto} ${r.accion.nota ?? ''}`).not.toMatch(/proveedor|pedir|surte/i);
    }
  });

  it('un producto descontinuado NO va en la lista de resurtido', () => {
    const overrides = new Map(OVERRIDES);
    overrides.set('333333333333', { foto: null, categoria: null, descontinuado: true, descontinuadoDesde: haceDias(2) });
    const s = armarSnapshot(datosCompletos({ overrides }), OPCIONES);
    expect(s.resurtido.some(r => r.codigo === '333333333333')).toBe(false);
    expect(s.porCodigo.get('333333333333').descontinuado).toBe(true);
    expect(snap.resurtido.some(r => r.codigo === '333333333333')).toBe(true);
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

  it('las ventas largas (60/90/180) se suman aparte, por área', () => {
    expect(dame('333333333333').vendidas).toEqual({ d7: 35, d14: 70, d30: 150, d60: 250, d90: 420, d120: 300, d180: 600 });
    expect(dame('222222222222').vendidas.d90).toBe(3);
    expect(dame('222222222222').vendidas.d30).toBe(0);
    expect(dame('555555555555').porArea.get('Casita 2')).toMatchObject({ v7: 14, v14: 28, v30: 60, v60: 100, v90: 170, v180: 170 });
  });

  it('acepta el nombre viejo ventasArea90 (solo v90): d60 y d180 quedan en 0 y las tendencias en null', () => {
    const viejo = armarSnapshot(datosCompletos({ ventasAreaLargo: undefined, ventasArea90: VENTAS_AREA_90 }), OPCIONES);
    const p = viejo.porCodigo.get('333333333333');
    expect(p.vendidas).toMatchObject({ d60: 0, d90: 420, d180: 0 });
    expect(p.tendencia).toEqual({ d7: 0, d30: null, d90: null });
  });

  it('marca lo que nunca se contó en ninguna área (comida preparada)', () => {
    const fila = snap.resurtido.find(r => r.codigo === '0' && r.area === 'Casita 1');
    expect(fila.nuncaContado).toBe(true);
    expect(fila.esCocina).toBe(true);
  });
});

describe('armarSnapshot v2: overrides, categorías, números por producto', () => {
  it('"Descontinuado" SOLO viene de overrides (Pepsi sí; 342 días sin venta no)', () => {
    const pepsi = dame('012000809996');
    expect(pepsi.descontinuado).toBe(true);
    expect(pepsi.descontinuadoDesde).toEqual(haceDias(20));
    expect(pepsi.foto).toMatch(/^https:\/\/cdn\.shopify\.com\//);
    expect(dame('999000000000')).toMatchObject({ descontinuado: false, descontinuadoDesde: null, tramoSinMovimiento: 180 });
    expect(dame('098733')).toMatchObject({ descontinuado: false, descontinuadoDesde: null });
    expect(snap.resumenDia.descontinuados).toBe(1);
  });

  it('sin overrides (admin viejo) nada es descontinuado y las fotos viejas (datos.fotos) siguen sirviendo', () => {
    const s = armarSnapshot(datosCompletos({ overrides: undefined, fotos: new Map([['012000809996', 'https://cdn.shopify.com/x.jpg']]) }), OPCIONES);
    expect(s.productos.some(p => p.descontinuado)).toBe(false);
    expect(s.porCodigo.get('012000809996').foto).toBe('https://cdn.shopify.com/x.jpg');
    expect(s.porCodigo.get('222222222222').categoria).toBe('TÉS E INFUSIONES');
  });

  it('categoría final: Admin → Shopify → caja salvo ABARROTES → "Sin categoría", con su fuente', () => {
    expect(dame('222222222222')).toMatchObject({ categoria: 'Tés', categoriaPropia: 'Tés', categoriaCaja: 'TÉS E INFUSIONES', categoriaFuente: 'admin', subcategoria: null });
    expect(dame('333333333333')).toMatchObject({ categoria: 'CHOCOLATES', categoriaPropia: null, categoriaFuente: 'caja' });
    expect(dame('555555555555')).toMatchObject({ categoria: 'Sin categoría', categoriaCaja: 'ABARROTES', categoriaFuente: 'ninguna' });
    expect(dame('444444444444')).toMatchObject({ categoria: 'Sin categoría', categoriaCaja: null, categoriaFuente: 'ninguna' });
    const conShopify = armarSnapshot(datosCompletos({
      tiposShopify: new Map([['333333333333', { tipo: 'Chocolates - Barras', titulo: 'Chocolate que vuela' }], ['222222222222', { tipo: 'Bebidas', titulo: 'Té' }]]),
    }), OPCIONES);
    expect(conShopify.porCodigo.get('333333333333')).toMatchObject({ categoria: 'Chocolates', subcategoria: 'Barras', categoriaFuente: 'shopify' });
    expect(conShopify.porCodigo.get('222222222222').categoriaFuente).toBe('admin');   // la del dueño manda
    expect(resolverCategoria({ propia: null, tipoShopify: null, caja: 'ABARROTES' })).toEqual({ categoria: 'Sin categoría', subcategoria: null, categoriaFuente: 'ninguna' });
    expect(esCategoriaGenerica('abarrotes')).toBe(true);
    expect(esCategoriaGenerica('CHOCOLATES')).toBe(false);
  });

  it('cada producto trae condiciones, prioridad, rotación, tendencia, venta diaria, cobertura y días sin movimiento', () => {
    const p = dame('333333333333');
    expect(p).toMatchObject({
      condiciones: ['bajo_stock', 'mas_vendidos'], prioridad: 'alta', rotacion: 3.49,
      tendencia: { d7: 0, d30: 50, d90: 133.3 }, ventaDiaria: 5, coberturaDias: 0.6,
      diasSinMovimiento: 0, tramoSinMovimiento: 0,
    });
    expect(dame('012000809996')).toMatchObject({ diasSinMovimiento: 95, tramoSinMovimiento: 90, rotacion: 0, coberturaDias: null, tendencia: { d7: null, d30: null, d90: null } });
    expect(dame('555555555555').tendencia.d90).toBeNull();   // entre 90 y 180 días no vendió: anterior 0
  });

  it('por área: v7…v180, venta diaria, disponible y cobertura (Bodega solo disponible)', () => {
    const c1 = dame('333333333333').porArea.get('Casita 1');
    expect(c1).toMatchObject({ v7: 35, v14: 70, v30: 150, v60: 250, v90: 420, v180: 600, ventaDiaria: 5, disponible: 3, cobertura: 0.6 });
    const bodega = dame('333333333333').porArea.get('Bodega');
    expect(bodega).toMatchObject({ cantidad: 40, apartado: 8, disponible: 32, cobertura: null, ventaDiaria: 0 });
    const enAreas = dame('333333333333').areas.find(a => a.area === 'Casita 1');
    expect(enAreas).toMatchObject({ cantidad: 3, disponible: 3, cobertura: 0.6, ventaDiaria: 5, v180: 600 });
  });

  it('el resumen del día cuadra con las condiciones (sin cocina ni códigos genéricos)', () => {
    expect(snap.resumenDia).toEqual({
      urgentes: 2, piezasAMover: 32, agotados: 0, sinStock: 0, bajoStock: 2, sobrestock: 4,
      sinMovimiento90: 2, descontinuados: 1, alertas: 12, alertasUrgentes: 4, conPiezas: 10, piezas: 1549,
    });
  });

  it('cobertura por sucursal: mediana de los que se venden ahí y cuántos urgentes', () => {
    expect(snap.coberturaSucursal).toEqual([
      { area: 'Casita 1', medianaDias: 6, productosQueVenden: 3, urgentes: 1 },    // 0.6, 6 y 140 días
      { area: 'Casita 2', medianaDias: null, productosQueVenden: 1, urgentes: 1 }, // solo el agua, desfasada
    ]);
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it('las categorías para el filtro: productos con piezas y piezas, ordenadas', () => {
    expect(snap.categorias[0]).toEqual({ nombre: 'Sin categoría', productos: 4, piezas: 885 });
    expect(snap.categorias.map(c => c.nombre)).toContain('Tés');
    expect(snap.categorias.find(c => c.nombre === 'CHOCOLATES')).toEqual({ nombre: 'CHOCOLATES', productos: 1, piezas: 43 });
  });

  it('el catálogo completo de la caja solo sirve al buscador: la mostaza no entra a productos', () => {
    expect(snap.catalogoCompleto.size).toBe(14);
    expect(snap.catalogoCompleto.get('777777777777')).toMatchObject({ codigo: '777777777777', nombre: 'MOSTAZA DIJON', categoria: 'Sin categoría', marca: 'MAILLE' });
    expect(snap.porCodigo.has('777777777777')).toBe(false);
    expect(snap.catalogoCompleto.get('222222222222').categoria).toBe('Tés');   // también respeta al Admin
    const sucio = armarSnapshot(datosCompletos({
      catalogoCompleto: [{ art_codigo: '1', descripcion: 'GOMAS POR $40 PESOS', categoria: 'DULCES CON IVA', marca: null }],
    }), OPCIONES);
    expect(sucio.catalogoCompleto.get('1')).toMatchObject({ nombre: 'GOMAS POR', categoria: 'DULCES', marca: null });
  });

  it('las ventas por día quedan indexadas por código → área → día', () => {
    expect(snap.ventasDiaIndice).toBeInstanceOf(Map);
    expect(snap.ventasDiaIndice.get('333333333333').get('Casita 1').get('2026-09-05')).toBe(12);
  });

  it('el snapshot trae alertas y el movimiento precalculado', () => {
    expect(snap.alertas.length).toBe(12);
    expect(snap.movimiento.filtros).toEqual({ dias: 30, area: '', incluirCocina: false });
    expect(dame('098733').alertas).toContain('duplicado');
  });

  it('Kinder Joy y Starbucks siguen saliendo como duplicados', () => {
    expect(dame('098733').duplicado).toMatchObject({ codigo: '00987339', nombre: 'KINDER JOY' });
    expect(dame('126490').duplicado).toMatchObject({ codigo: '01264904' });
    expect(dame('126490').condiciones).toEqual(['nuevo_sin_venta', 'duplicado_probable']);
  });

  it('la hora de "generado" sale del reloj de la caja', () => {
    expect(snap.generado).toBe('2026-09-11T14:30:00-06:00');
    expect(AHORA.getUTCHours()).toBe(14);
  });
});

// ── Regresiones de la revisión adversarial (las de vistas están en vistas.test.js) ──
describe('regresiones', () => {
  it('la fecha de entrada por área no se corre un día si llegó de tarde', () => {
    // La tienda recibe de tarde: 19:15 hora de la tienda. Antes salía "30 ago".
    const tarde = new Date(Date.UTC(2026, 7, 29, 19, 15));
    const s = armarSnapshot(datosCompletos({
      inventario: [{ codigo: '777', ubicacion: 'Casita 1', cantidad: 5, ultima_entrada: tarde, ultima_salida: null, creado: tarde, nombre: 'PRODUCTO DE TARDE' }],
    }), OPCIONES);
    const area = s.porCodigo.get('777').areas[0];
    expect(area.ultimaEntrada).toBe('2026-08-29T19:15:00-06:00');
    expect(area.entradaDate.getUTCDate()).toBe(29);
  });

  it('las ventas por código de caja también llegan al área (si no, el resurtido no las ve)', () => {
    const s = armarSnapshot(datosCompletos({
      inventario: [
        { codigo: '888', ubicacion: 'Casita 1', cantidad: 2, ultima_entrada: haceDias(3), ultima_salida: null, creado: haceDias(300), nombre: 'PRODUCTO CON CAJA' },
        { codigo: '888', ubicacion: 'Bodega', cantidad: 60, ultima_entrada: haceDias(3), ultima_salida: null, creado: haceDias(300), nombre: 'PRODUCTO CON CAJA' },
      ],
      // Se vende SOLO con el código de la caja, que trae 12 piezas.
      ventasArea: [{ area: 'Casita 1', codigo: '888CAJA', v7: 2, v14: 4, v30: 8 }],
      ventasAreaLargo: [],
      ventasDia: [{ area: 'Casita 1', dia: '2026-09-10', codigo: '888CAJA', piezas: 1 }],
      historial: [{ codigo: '888CAJA', ultima: haceDias(1), v120: 30 }],
      equivalencias: [{ codigo: '888CAJA', codigo_base: '888', unidades: 12 }],
      catalogo: [{ codigo: '888', art_codigo: '888', descripcion: 'PRODUCTO CON CAJA', categoria: 'ABARROTES', marca: null }],
    }), OPCIONES);
    const fila = s.resurtido.find(r => r.codigo === '888' && r.area === 'Casita 1');
    expect(fila, 'el producto debe entrar al resurtido por lo vendido en cajas').toBeTruthy();
    expect(fila.vendidas14).toBe(48);          // 4 cajas × 12 piezas
    expect(fila.estado).toBe('urgente');       // vende 3.4 al día y quedan 2
    expect(s.ventasDiaIndice.get('888').get('Casita 1').get('2026-09-10')).toBe(12);
  });

  it('el orden de los productos no depende del orden en que venga el inventario', () => {
    const datos = datosCompletos();
    const alReves = { ...datos, inventario: [...datos.inventario].reverse() };
    const a = armarSnapshot(datos, OPCIONES);
    const b = armarSnapshot(alReves, OPCIONES);
    expect(b.alertas.map(x => x.id)).toEqual(a.alertas.map(x => x.id));
    expect(b.movimiento.ranking.map(x => x.codigo)).toEqual(a.movimiento.ranking.map(x => x.codigo));
    expect(b.resumenDia).toEqual(a.resumenDia);
  });
});
