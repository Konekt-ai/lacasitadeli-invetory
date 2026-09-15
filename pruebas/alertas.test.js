import { describe, expect, it } from 'vitest';
import {
  GRUPOS_ALERTA, TIPOS_ALERTA, alertasDeProducto, calcularAlertas, contarAlertas, pareceRefrigerado,
} from '../src/calculos/alertas.js';
import { armarSnapshot } from '../src/calculos/armar.js';
import { AHORA, OPCIONES, datosCompletos, haceDias } from './datos-de-prueba.js';

// Las mismas reglas de privacidad que pruebas/api.test.js: ni llaves ni textos
// de dinero. Además, aquí "proveedor" tampoco puede aparecer en ningún texto.
const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$/i;
const DINERO_EN_TEXTO = /\$|\bpesos\b|\bmxn\b|precio|costo|proveedor/i;
function revisarDinero(valor, donde, problemas = []) {
  if (Array.isArray(valor)) valor.forEach((v, i) => revisarDinero(v, `${donde}[${i}]`, problemas));
  else if (valor instanceof Map) for (const [k, v] of valor) revisarDinero(v, `${donde}.${k}`, problemas);
  else if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    for (const [k, v] of Object.entries(valor)) {
      if (LLAVES_PROHIBIDAS.test(k)) problemas.push(`llave de dinero: ${donde}.${k}`);
      revisarDinero(v, `${donde}.${k}`, problemas);
    }
  } else if (typeof valor === 'string' && DINERO_EN_TEXTO.test(valor)) problemas.push(`texto con dinero en ${donde}: ${valor.slice(0, 60)}`);
  return problemas;
}

const snap = armarSnapshot(datosCompletos(), OPCIONES);
const alerta = (tipo, codigo) => snap.alertas.find(a => a.id === `${tipo}:${codigo}`);
const tiposDe = codigo => snap.alertas.filter(a => a.codigo === codigo).map(a => a.tipo).sort();

describe('calcularAlertas — forma', () => {
  it('cada alerta trae id "tipo:codigo", grupo, prioridad, título, texto, código, nombre, foto y piezas', () => {
    expect(snap.alertas.length).toBeGreaterThan(0);
    for (const a of snap.alertas) {
      expect(a.id).toBe(`${a.tipo}:${a.codigo}`);
      expect(TIPOS_ALERTA[a.tipo], a.id).toBeTruthy();
      expect(a.grupo).toBe(TIPOS_ALERTA[a.tipo].grupo);
      expect(GRUPOS_ALERTA).toContain(a.grupo);
      expect(['alta', 'media', 'baja']).toContain(a.prioridad);
      expect(a.titulo).toBe(TIPOS_ALERTA[a.tipo].titulo);
      expect(typeof a.texto).toBe('string');
      expect(a.texto.length).toBeGreaterThan(20);
      expect(typeof a.nombre).toBe('string');
      expect(a).toHaveProperty('foto');
      expect(typeof a.piezas).toBe('number');
    }
  });

  it('una alerta por tipo y producto; ids únicos', () => {
    const ids = snap.alertas.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('primero las urgentes (prioridad alta), luego por piezas', () => {
    const pesos = snap.alertas.map(a => ({ alta: 0, media: 1, baja: 2 }[a.prioridad]));
    expect([...pesos].sort((a, b) => a - b)).toEqual(pesos);
    expect(snap.alertas[0]).toMatchObject({ id: 'duplicado:098733', prioridad: 'alta', piezas: 507 });
  });

  it('ni una llave ni un texto de dinero (ni "proveedor") en ninguna alerta', () => {
    expect(revisarDinero(snap.alertas, 'alertas')).toEqual([]);
  });

  it('el conteo del encabezado cuadra con la lista', () => {
    expect(contarAlertas(snap.alertas)).toEqual({ todas: 12, urgentes: 4, codigos: 2, caja: 1, catalogo: 2, inventario: 7 });
    expect(snap.resumenDia.alertas).toBe(12);
    expect(snap.resumenDia.alertasUrgentes).toBe(4);
  });

  it('cada producto sabe qué alertas tiene (p.alertas)', () => {
    expect(snap.porCodigo.get('098733').alertas).toEqual(['duplicado', 'entradas_sin_ventas']);
    expect(snap.porCodigo.get('333333333333').alertas).toEqual([]);
  });
});

describe('calcularAlertas — cada regla', () => {
  it('duplicado (códigos, alta): Kinder Joy 098733 → 00987339 y Starbucks 126490 → 01264904', () => {
    expect(alerta('duplicado', '098733')).toMatchObject({
      grupo: 'codigos', prioridad: 'alta', piezas: 507, titulo: 'Posible código duplicado',
      texto: 'Se vende como 00987339 KINDER JOY. Revisa si son el mismo producto y corrige el código en la TC52.',
    });
    expect(alerta('duplicado', '126490').texto).toMatch(/^Se vende como 01264904 STARBUCKS FRAPUCCINO MOCHA 281ML\./);
  });

  it('sin alta (caja): alta con 10+ piezas, media con menos, nada sin piezas', () => {
    expect(alerta('sin_alta', '444444444444')).toMatchObject({
      grupo: 'caja', prioridad: 'alta',
      texto: 'Hay 18 piezas contadas, pero la caja no conoce este código: no se puede cobrar bien. Dalo de alta en NovaCaja (Admin → Inventario → Dar de alta).',
    });
    const pocas = alertasDeProducto({ codigo: 'x', alta: false, piezas: 5, condiciones: ['sin_alta'], porArea: new Map() }, { ahora: AHORA });
    expect(pocas.find(a => a.tipo === 'sin_alta').prioridad).toBe('media');
    const cero = alertasDeProducto({ codigo: 'x', alta: false, piezas: 0, condiciones: ['sin_alta'], porArea: new Map() }, { ahora: AHORA });
    expect(cero.find(a => a.tipo === 'sin_alta')).toBeUndefined();
  });

  it('sin categoría (catálogo, baja): ABARROTES no cuenta como categoría; sin piezas o sin alta no molesta', () => {
    // Solo para lo que SÍ se vende (10+ piezas en 30 días): en la tienda casi todo
    // es ABARROTES y sin este piso salían 9 mil alertas de puro ruido.
    expect(alerta('sin_categoria', '555555555555')).toMatchObject({ grupo: 'catalogo', prioridad: 'baja', texto: 'Sin categoría no entra en los análisis por categoría. Asígnale una en el Admin.' });
    expect(alerta('sin_categoria', '00987339'), 'vende aunque no tenga piezas').toBeTruthy();
    expect(alerta('sin_categoria', '098733'), 'parado: no estorba en ningún análisis').toBeUndefined();
    expect(alerta('sin_categoria', '012000809996'), 'parado').toBeUndefined();
    expect(alerta('sin_categoria', '444444444444'), 'sin alta ya tiene su alerta').toBeUndefined();
    expect(alerta('sin_categoria', '222222222222'), 'con categoría del Admin').toBeUndefined();
    expect(alerta('sin_categoria', '0'), 'cocina').toBeUndefined();
  });

  it('ubicación incorrecta (inventario, media): el queso contado en Casita 1', () => {
    expect(alerta('ubicacion_incorrecta', '666666666666')).toMatchObject({
      grupo: 'inventario', prioridad: 'media',
      texto: 'Parece producto refrigerado y está contado en Casita 1. Verifica dónde está físicamente.',
    });
    expect(pareceRefrigerado({ categoriaCaja: 'CARNES', nombre: 'ARRACHERA' })).toBe(true);
    expect(pareceRefrigerado({ categoriaCaja: 'ABARROTES', nombre: 'HELADO FROZEN YOGURT' })).toBe(true);
    expect(pareceRefrigerado({ categoriaCaja: 'ABARROTES', nombre: 'GALLETA', tipoShopify: 'Refrigerados - Postres' })).toBe(true);
    expect(pareceRefrigerado({ categoriaCaja: 'CHOCOLATES', nombre: 'CHOCOLATE QUE VUELA' })).toBe(false);
    // Contado en un área que no está en la lista de sospechosas: sin alerta.
    const enRefri = alertasDeProducto({
      codigo: 'q', alta: true, piezas: 6, categoriaCaja: 'QUESOS Y LACTEOS', nombre: 'QUESO', categoria: 'QUESOS Y LACTEOS',
      condiciones: [], porArea: new Map([['Refrigerador', { area: 'Refrigerador', cantidad: 6 }]]),
    }, { ahora: AHORA });
    expect(enRefri.find(a => a.tipo === 'ubicacion_incorrecta')).toBeUndefined();
  });

  it('entradas sin ventas (inventario, media): llegó hace 30+ días y nada desde entonces', () => {
    expect(alerta('entradas_sin_ventas', '098733')).toMatchObject({
      prioridad: 'media',
      texto: 'Llegó el 24 jul y no se ha vendido ni una pieza. ¿Está exhibido? ¿Se vende con otro código?',
    });
    expect(alerta('entradas_sin_ventas', '999000000000').texto).toMatch(/^Llegó el 4 oct 2025 /);
    expect(alerta('entradas_sin_ventas', '222222222222'), 'vendió después de la entrada').toBeUndefined();
    expect(alerta('entradas_sin_ventas', '111111111111'), 'llegó hace 5 días').toBeUndefined();
    expect(alerta('entradas_sin_ventas', '012000809996'), 'entrada hace 29 días: todavía no').toBeUndefined();
  });

  it('sobrestock crítico (inventario, media): más de 180 días de cobertura', () => {
    expect(alerta('sobrestock_critico', '888888888888')).toMatchObject({
      prioridad: 'media', texto: 'Con lo que se vende, este stock alcanza para más de 6 meses. Conviene no comprar más.',
    });
    // Sobrestock sin venta (cobertura desconocida) no es "crítico": no se sabe cuánto dura.
    expect(alerta('sobrestock_critico', '012000809996')).toBeUndefined();
  });

  it('estancado (inventario, baja): 180+ días con piezas y NO descontinuado', () => {
    expect(alerta('estancado', '999000000000')).toMatchObject({
      prioridad: 'baja', texto: 'Sin movimiento en 180+ días. Decidan si se descontinúa (se marca en el Admin) o se promociona.',
    });
    expect(alerta('estancado', '098733'), 'tramo 60').toBeUndefined();
    const pepsi = snap.porCodigo.get('012000809996');
    const comoSiFuera180 = alertasDeProducto({ ...pepsi, tramoSinMovimiento: 180 }, { ahora: AHORA });
    expect(comoSiFuera180.find(a => a.tipo === 'estancado'), 'descontinuada: el dueño ya decidió').toBeUndefined();
    const sinMarcar = alertasDeProducto({ ...pepsi, tramoSinMovimiento: 180, descontinuado: false }, { ahora: AHORA });
    expect(sinMarcar.find(a => a.tipo === 'estancado')).toBeTruthy();
  });

  it('desfasado (inventario, alta): el sistema dice 0 y se sigue vendiendo (GHIRARDELLI)', () => {
    expect(alerta('desfasado', '555555555555')).toMatchObject({
      prioridad: 'alta',
      texto: 'En Casita 2 el sistema dice 0, pero se han vendido 20 piezas desde el 2 sep. Hay que contarlo con la TC52.',
    });
    expect(alerta('desfasado', '333333333333'), 'hoy ya tiene piezas').toBeUndefined();
  });

  it('nombre inconsistente (catálogo, baja): SOLO cuando hay título de Shopify', () => {
    expect(snap.alertas.some(a => a.tipo === 'nombre_inconsistente')).toBe(false);
    const conShopify = armarSnapshot(datosCompletos({
      tiposShopify: new Map([
        ['555555555555', { tipo: null, titulo: 'Botella retornable vidrio' }],
        ['333333333333', { tipo: 'Chocolates - Barras', titulo: 'Chocolate que vuela 90 g' }],
      ]),
    }), OPCIONES);
    const agua = conShopify.alertas.find(a => a.id === 'nombre_inconsistente:555555555555');
    expect(agua).toMatchObject({
      grupo: 'catalogo', prioridad: 'baja',
      texto: 'En caja dice AGUA MINERAL y en la página dice Botella retornable vidrio. Revisa que sea el mismo producto.',
    });
    expect(conShopify.alertas.find(a => a.id === 'nombre_inconsistente:333333333333')).toBeUndefined();
  });

  it('un producto puede tener varias alertas (una por tipo)', () => {
    expect(tiposDe('098733')).toEqual(['duplicado', 'entradas_sin_ventas']);
    expect(tiposDe('999000000000')).toEqual(['entradas_sin_ventas', 'estancado']);
    expect(tiposDe('444444444444')).toEqual(['entradas_sin_ventas', 'sin_alta']);
  });

  it('el umbral de "estancado" y la lista de áreas sospechosas se pueden cambiar por opciones', () => {
    const s = armarSnapshot(datosCompletos(), {
      ...OPCIONES, sinMovimientoAlertaDias: 90, refrigerado: { areasSospechosas: ['Bodega'] },
    });
    expect(s.alertas.some(a => a.id === 'estancado:012000809996'), 'sigue descontinuada').toBe(false);
    expect(s.alertas.some(a => a.tipo === 'ubicacion_incorrecta'), 'Casita 1 ya no es sospechosa').toBe(false);
    const soloBodega = calcularAlertas(snap, { refrigerado: { areasSospechosas: ['Casita 1'] } });
    expect(soloBodega.some(a => a.id === 'ubicacion_incorrecta:666666666666')).toBe(true);
  });

  it('con un snapshot vacío no truena', () => {
    expect(calcularAlertas({ productos: [], ahora: AHORA })).toEqual([]);
    expect(calcularAlertas(null)).toEqual([]);
    expect(contarAlertas([])).toEqual({ todas: 0, urgentes: 0, codigos: 0, caja: 0, catalogo: 0, inventario: 0 });
  });

  it('las fechas del texto salen del reloj del snapshot, no del reloj de la máquina', () => {
    const p = { codigo: 'x', alta: true, piezas: 3, nombre: 'ALGO', categoria: 'X', condiciones: [], porArea: new Map(), ultimaEntrada: haceDias(45), ultimaVenta: null };
    const [a] = alertasDeProducto(p, { ahora: AHORA });
    expect(a.tipo).toBe('entradas_sin_ventas');
    expect(a.texto).toMatch(/^Llegó el 28 jul /);
  });
});
