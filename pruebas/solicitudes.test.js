// El proxy de solicitudes de resurtido (src/web/solicitudes.js) contra un admin
// de MENTIRAS (pruebas/admin-falso.js). Es la única escritura sobre el negocio
// que sale de esta app, así que se prueba con lupa: qué manda, qué deja pasar,
// qué esconde y qué contesta cuando el admin no está.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { SOLICITUD_PENDIENTE, iniciarAdminFalso } from './admin-falso.js';

const admin = await iniciarAdminFalso();

// Antes de importar la config: dotenv NO pisa lo que ya está en process.env.
const CONTRASENA = 'prueba-de-la-casita-123';
process.env.USUARIOS = `dueno:${bcrypt.hashSync(CONTRASENA, 4)}`;
process.env.SESSION_SECRET = 'secreto-de-pruebas-largo-de-mas-de-24';
process.env.COOKIE_SEGURA = '0';
process.env.TUNEL_ACTIVO = '0';
process.env.LOGIN_BCRYPT_POR_MINUTO = '500';
process.env.ADMIN_API = admin.url;
process.env.ADMIN_TIMEOUT_MS = '2000';

const { config } = await import('../src/config.js');
const { armarSnapshot } = await import('../src/calculos/armar.js');
const { _ponerAdminDePrueba, _ponerSnapshotDePrueba } = await import('../src/servicios/inventario.js');
const { limpiarIntentos } = await import('../src/web/auth.js');
const { crearApp } = await import('../src/web/app.js');
const { _limpiarCachePendientes } = await import('../src/web/rutas.js');
const { OPCIONES, datosCompletos } = await import('./datos-de-prueba.js');

const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$/i;
const DINERO_EN_TEXTO = /\$|\bpesos\b|\bmxn\b/i;
function problemasDePrivacidad(valor, donde = '') {
  const problemas = [];
  const mirar = (v, ruta) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => mirar(x, `${ruta}[${i}]`)); return; }
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

let app;
let cookie;

beforeAll(() => {
  _ponerSnapshotDePrueba(armarSnapshot(datosCompletos(), OPCIONES));
  _ponerAdminDePrueba({ responde: true });
  app = crearApp();
});
afterAll(async () => { await admin.cerrar(); });

beforeEach(async () => {
  limpiarIntentos();
  _limpiarCachePendientes();
  admin.recibido.length = 0;
  const r = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: CONTRASENA });
  cookie = r.headers['set-cookie'][0];
});

describe('sin sesión', () => {
  it('ni leer ni crear', async () => {
    expect((await request(app).get('/api/solicitudes')).status).toBe(401);
    expect((await request(app).post('/api/solicitudes').send({ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 1 })).status).toBe(401);
    expect(admin.recibido).toEqual([]);   // ni siquiera se molestó al admin
  });
});

describe('crear una solicitud', () => {
  it('manda al admin el usuario de la sesión y origen "invetory", con Bodega como origen por defecto', async () => {
    const r = await request(app).post('/api/solicitudes').set('Cookie', cookie)
      .send({ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 5, nota: '  para el fin de semana  ' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.id).toBe(100);
    expect(r.body.solicitud).toMatchObject({ id: 100, codigo_barras: '098733', a_ubicacion: 'Casita 1', de_ubicacion: 'Bodega', cantidad: 5, estado: 'pendiente' });
    const mandado = admin.ultimo();
    expect(mandado.metodo).toBe('POST');
    expect(mandado.ruta).toBe('/api/resurtido');
    expect(mandado.cuerpo).toEqual({ codigo_barras: '098733', a_ubicacion: 'Casita 1', de_ubicacion: 'Bodega', cantidad: 5, nota: 'para el fin de semana', usuario: 'dueno', origen: 'invetory' });
    // Lo que contesta el admin viene limpio y con fechas de la tienda.
    expect(problemasDePrivacidad(r.body)).toEqual([]);
    expect(r.body.solicitud.creado).toBe('2026-09-11T09:00:00-06:00');
  });

  it('el 409 del admin pasa tal cual, con la solicitud existente', async () => {
    const r = await request(app).post('/api/solicitudes').set('Cookie', cookie)
      .send({ codigo_barras: '333333333333', a_ubicacion: 'Casita 1', cantidad: 10 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Ya hay una solicitud pendiente/);
    expect(r.body.existente).toMatchObject({ id: 7, cantidad: 20 });
    expect(r.body.existente).not.toHaveProperty('precio');
  });

  it('el aviso del admin (menos piezas que las pedidas) también pasa', async () => {
    const r = await request(app).post('/api/solicitudes').set('Cookie', cookie)
      .send({ codigo_barras: '098733', a_ubicacion: 'Casita 2', cantidad: 50 });
    expect(r.status).toBe(200);
    expect(r.body.aviso).toMatch(/solo hay 40/);
  });

  it('se valida aquí antes de molestar al admin', async () => {
    const casos = [
      [{ a_ubicacion: 'Casita 1', cantidad: 1 }, /código/i],
      [{ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 0 }, /entre 1 y 9999/],
      [{ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 2.5 }, /entero/],
      [{ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 10000 }, /entre 1 y 9999/],
      [{ codigo_barras: '098733', a_ubicacion: 'Marte', cantidad: 1 }, /destino/],
      [{ codigo_barras: '098733', a_ubicacion: 'Casita 1', de_ubicacion: 'Casita 1', cantidad: 1 }, /diferentes/],
      [{ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 1, nota: 'x'.repeat(201) }, /nota/i],
      [{ codigo_barras: '../products', a_ubicacion: 'Casita 1', cantidad: 1 }, /código/i],
    ];
    for (const [cuerpo, esperado] of casos) {
      const r = await request(app).post('/api/solicitudes').set('Cookie', cookie).send(cuerpo);
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
      expect(r.body.error, JSON.stringify(cuerpo)).toMatch(esperado);
    }
    expect(admin.recibido.filter(x => x.metodo === 'POST')).toEqual([]);
  });

  it('un producto descontinuado no se pide', async () => {
    const r = await request(app).post('/api/solicitudes').set('Cookie', cookie)
      .send({ codigo_barras: '012000809996', a_ubicacion: 'Casita 1', cantidad: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/descontinuado/);
    expect(admin.recibido.filter(x => x.metodo === 'POST')).toEqual([]);
  });
});

describe('leer solicitudes', () => {
  it('lista, pendientes, detalle, ubicaciones y sugerencia pasan limpias y con fechas de la tienda', async () => {
    const lista = await request(app).get('/api/solicitudes?estado=pendiente&limit=50').set('Cookie', cookie);
    expect(lista.status).toBe(200);
    expect(lista.body.conteo).toEqual({ pendiente: 1, hecha: 2, cancelada: 0 });
    expect(lista.body.solicitudes[0]).toMatchObject({ id: 7, creado: '2026-09-11T09:00:00-06:00' });
    expect(lista.body.solicitudes[0]).not.toHaveProperty('precio');
    expect(admin.ultimo().ruta).toBe('/api/resurtido?estado=pendiente&limit=50');

    const pend = await request(app).get('/api/solicitudes/pendientes').set('Cookie', cookie);
    expect(pend.status).toBe(200);
    expect(pend.body[0].id).toBe(7);

    const det = await request(app).get('/api/solicitudes/7').set('Cookie', cookie);
    expect(det.status).toBe(200);
    expect(det.body.eventos[0]).toMatchObject({ tipo: 'creada', fecha: '2026-09-11T09:00:00-06:00' });
    expect((await request(app).get('/api/solicitudes/8').set('Cookie', cookie)).status).toBe(404);

    const ub = await request(app).get('/api/solicitudes/ubicaciones').set('Cookie', cookie);
    expect(ub.body.venta).toEqual(['Casita 1', 'Casita 2']);

    const sug = await request(app).get('/api/solicitudes/sugerencia/098733?destino=Casita%201').set('Cookie', cookie);
    expect(sug.status).toBe(200);
    expect(sug.body).toMatchObject({ stock_origen: 40, sugerido: 32, ultima_venta: '2026-09-11T08:00:00-06:00' });
    expect(admin.ultimo().ruta).toBe('/api/resurtido/sugerencia/098733?destino=Casita+1&origen=Bodega');
    expect((await request(app).get('/api/solicitudes/sugerencia/098733').set('Cookie', cookie)).status).toBe(400);

    for (const r of [lista, pend, det, ub, sug]) expect(problemasDePrivacidad(r.body)).toEqual([]);
  });

  it('el limit se topa y el estado inválido se ignora', async () => {
    await request(app).get('/api/solicitudes?estado=rara&limit=9999').set('Cookie', cookie);
    expect(admin.ultimo().ruta).toBe('/api/resurtido?limit=500');
  });
});

describe('nada más del admin se expone', () => {
  it('rutas ajenas, ids raros y escrituras que no existen dan 404', async () => {
    for (const ruta of ['/api/products', '/api/novacaja', '/api/solicitudes/abc', '/api/solicitudes/7/eventos', '/api/solicitudes/..%2Fproducts', '/api/solicitudes/../products']) {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect([404, 400], ruta).toContain(r.status);
      expect(JSON.stringify(r.body), ruta).not.toMatch(/precio/);
    }
    for (const [metodo, ruta] of [['post', '/api/solicitudes/7/hecha'], ['post', '/api/solicitudes/7/cancelar'], ['post', '/api/solicitudes/conciliar'], ['put', '/api/solicitudes/7'], ['delete', '/api/solicitudes/7']]) {
      const r = await request(app)[metodo](ruta).set('Cookie', cookie).send({});
      expect([404, 405], `${metodo} ${ruta}`).toContain(r.status);
    }
    expect(admin.recibido.some(x => x.ruta.includes('products'))).toBe(false);
    expect(admin.recibido.some(x => x.metodo !== 'GET' && x.metodo !== 'POST')).toBe(false);
  });
});

describe('las pantallas cruzan con el admin', () => {
  it('Resurtir marca la fila que ya tiene solicitud pendiente y trae el historial', async () => {
    const r = await request(app).get('/api/resurtir').set('Cookie', cookie);
    expect(r.status).toBe(200);
    const choco = r.body.filas.find(f => f.codigo === '333333333333' && f.area === 'Casita 1');
    expect(choco.solicitud).toEqual({ id: 7, estado: 'pendiente', cantidad: 20, creado: '2026-09-11T09:00:00-06:00' });
    expect(r.body.historial).toEqual({ pendientes: 1, hechas: 2, canceladas: 0 });
    expect(problemasDePrivacidad(r.body)).toEqual([]);
  });

  it('la ficha trae las solicitudes del producto', async () => {
    const r = await request(app).get('/api/producto/333333333333').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.producto.solicitudes.map(s => s.id)).toEqual([7]);
    expect(admin.recibido.some(x => x.ruta === '/api/resurtido?codigo=333333333333&limit=10')).toBe(true);
    expect((await request(app).get('/api/producto/098733').set('Cookie', cookie)).body.producto.solicitudes).toEqual([]);
  });
});

describe('cuando el admin no contesta', () => {
  const vivo = config.admin.api;
  beforeEach(() => { config.admin.api = 'http://127.0.0.1:9'; _limpiarCachePendientes(); });
  afterAll(() => { config.admin.api = vivo; });

  it('el proxy contesta 503 con un mensaje que se entiende', async () => {
    const r = await request(app).get('/api/solicitudes/ubicaciones').set('Cookie', cookie);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('El sistema admin no responde. Inténtalo en un momento.');
    const p = await request(app).post('/api/solicitudes').set('Cookie', cookie).send({ codigo_barras: '098733', a_ubicacion: 'Casita 1', cantidad: 1 });
    expect(p.status).toBe(503);
  });

  it('Resurtir y la ficha siguen funcionando, solo sin la parte del admin', async () => {
    const r = await request(app).get('/api/resurtir').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.historial).toBeNull();
    expect(r.body.filas.every(f => f.solicitud === null)).toBe(true);
    const p = await request(app).get('/api/producto/333333333333').set('Cookie', cookie);
    expect(p.status).toBe(200);
    expect(p.body.producto.solicitudes).toEqual([]);
  });
});
