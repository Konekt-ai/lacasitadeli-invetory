// Pruebas del servidor (v2): seguridad, privacidad y que solo existan las cuatro
// escrituras permitidas (login, logout, crear solicitud, descartar alerta).
// No toca SQL Server: se le mete una foto ya armada con datos de mentiras. El
// admin aquí NO existe (ADMIN_API apunta a un puerto muerto): el proxy con admin
// vivo se prueba en solicitudes.test.js.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Antes de importar la config: dotenv NO pisa lo que ya está en process.env.
const CONTRASENA = 'prueba-de-la-casita-123';
process.env.USUARIOS = `dueno:${bcrypt.hashSync(CONTRASENA, 4)},resurte:${bcrypt.hashSync('otra-contrasena-456', 4)}`;
process.env.SESSION_SECRET = 'secreto-de-pruebas-largo-de-mas-de-24';
process.env.COOKIE_SEGURA = '1';
process.env.TUNEL_ACTIVO = '0';
process.env.LOGIN_BCRYPT_POR_MINUTO = '500';
process.env.ADMIN_API = 'http://127.0.0.1:9';
process.env.ADMIN_TIMEOUT_MS = '1000';

const { config } = await import('../src/config.js');
const { armarSnapshot } = await import('../src/calculos/armar.js');
const { _ponerAdminDePrueba, _ponerSnapshotDePrueba } = await import('../src/servicios/inventario.js');
const { _reiniciarPropio } = await import('../src/db/propio.js');
const { limpiarIntentos } = await import('../src/web/auth.js');
const { crearApp } = await import('../src/web/app.js');
const { OPCIONES, datosCompletos } = await import('./datos-de-prueba.js');

let app;
let cookie;

// Palabras que NO pueden salir como LLAVE de ningún dato.
const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|utilidad|cajero|cliente|proveedor|\$/i;
// Y ningún texto puede traer dinero.
const DINERO_EN_TEXTO = /\$|\bpesos\b|\bmxn\b/i;

function revisarPrivacidad(valor, ruta = '') {
  const problemas = [];
  const mirar = (v, donde) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { v.forEach((x, i) => mirar(x, `${donde}[${i}]`)); return; }
    if (typeof v === 'object') {
      for (const [k, sub] of Object.entries(v)) {
        if (LLAVES_PROHIBIDAS.test(k)) problemas.push(`llave de dinero: ${donde}.${k}`);
        mirar(sub, `${donde}.${k}`);
      }
      return;
    }
    if (typeof v === 'string' && DINERO_EN_TEXTO.test(v)) problemas.push(`texto con dinero en ${donde}: ${v.slice(0, 60)}`);
  };
  mirar(valor, ruta);
  return problemas;
}

const PANTALLAS = ['/', '/inventario', '/resurtir', '/movimiento', '/alertas', '/buscar?q=coca', '/producto/098733'];
const RUTAS_DATOS = [
  '/api/estado', '/api/inventario', '/api/inventario?condiciones=descontinuado', '/api/inventario?soloConPiezas=0&cocina=1&porPagina=200',
  '/api/inventario?condiciones=sin_alta,sin_movimiento_30&orden=dias', '/api/inventario?prioridad=alta&area=Casita%201&orden=cobertura',
  '/api/inventario?categoria=T%C3%A9s', '/api/inventario?q=kinder', '/api/inventario?pagina=2&porPagina=3',
  '/api/buscar?q=kinder', '/api/buscar?q=mostaza', '/api/buscar?q=agua',
  '/api/producto/098733', '/api/producto/012000809996', '/api/producto/333333333333', '/api/producto/555555555555', '/api/producto/444444444444', '/api/producto/0', '/api/producto/777777777777',
  '/api/resurtir', '/api/resurtir?horizonte=hoy', '/api/resurtir?horizonte=3&condicion=bajo_stock&area=Casita%201', '/api/resurtir?cocina=1&sinConteo=1&q=kinder',
  '/api/movimiento', '/api/movimiento?dias=7', '/api/movimiento?dias=90&area=Casita%202', '/api/movimiento?dias=30&cocina=1',
  '/api/alertas', '/api/alertas?filtro=urgentes', '/api/alertas?filtro=codigos', '/api/alertas?filtro=caja', '/api/alertas?filtro=catalogo', '/api/alertas?filtro=inventario', '/api/alertas?descartadas=1',
];

beforeAll(() => {
  _ponerSnapshotDePrueba(armarSnapshot(datosCompletos(), OPCIONES));
  _ponerAdminDePrueba({ responde: false });
  _reiniciarPropio();
  app = crearApp();
});

beforeEach(() => {
  limpiarIntentos();
  config.sesion.bcryptPorMinuto = 500;
});

async function entrar(usuario = 'dueno', contrasena = CONTRASENA) {
  const r = await request(app).post('/api/login').send({ usuario, contrasena });
  cookie = r.headers['set-cookie']?.[0] ?? '';
  return r;
}

describe('sin sesión no se ve nada', () => {
  it('la página manda al login', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/entrar');
  });

  it('cualquier pantalla manda al login', async () => {
    for (const ruta of PANTALLAS) {
      const r = await request(app).get(ruta);
      expect(r.status, ruta).toBe(302);
    }
  });

  it('el API contesta 401 y no suelta datos (incluido el proxy de solicitudes)', async () => {
    for (const ruta of [...RUTAS_DATOS, '/api/solicitudes', '/api/solicitudes/pendientes', '/api/solicitudes/ubicaciones']) {
      const r = await request(app).get(ruta);
      expect(r.status, ruta).toBe(401);
      expect(JSON.stringify(r.body)).not.toMatch(/KINDER|PEPSI|piezas/i);
    }
    const p = await request(app).post('/api/alertas/sin_alta:444444444444/descartar').send({});
    expect(p.status).toBe(401);
  });

  it('el formulario de entrar sí se puede abrir', async () => {
    const r = await request(app).get('/entrar');
    expect([200, 503]).toContain(r.status); // 503 solo si no se ha compilado dist/
  });
});

describe('login', () => {
  it('con la contraseña buena entra y deja cookie segura', async () => {
    const r = await entrar();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, usuario: 'dueno' });
    const set = r.headers['set-cookie'][0];
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/Max-Age=43200/);
  });

  it('con la contraseña mala da un error genérico', async () => {
    const r = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: 'no-es' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Usuario o contraseña incorrectos');
  });

  it('con un usuario que no existe dice EXACTAMENTE lo mismo', async () => {
    const r = await request(app).post('/api/login').send({ usuario: 'nadie', contrasena: 'x' });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Usuario o contraseña incorrectos');
  });

  it('al sexto intento fallido contesta 429', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: `mala${i}` });
      expect(r.status, `intento ${i + 1}`).toBe(401);
    }
    const sexto = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: 'mala6' });
    expect(sexto.status).toBe(429);
    // Y ni con la buena, hasta que pase el rato.
    const buena = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: CONTRASENA });
    expect(buena.status).toBe(429);
  });

  it('hay un tope de bcrypt por minuto (que un bot no queme la CPU de la caja)', async () => {
    config.sesion.bcryptPorMinuto = 1;
    await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: 'una' });
    const segundo = await request(app).post('/api/login').send({ usuario: 'otro', contrasena: 'dos' });
    expect(segundo.status).toBe(429);
  });

  it('una cookie inventada no sirve', async () => {
    const r = await request(app).get('/api/estado').set('Cookie', 'invetory_sesion=dueno.99999999999999.firmafalsa');
    expect(r.status).toBe(401);
  });

  it('salir borra la cookie', async () => {
    await entrar();
    const r = await request(app).post('/api/logout').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.headers['set-cookie'][0]).toMatch(/Max-Age=0/);
  });
});

describe('con sesión', () => {
  beforeEach(async () => { await entrar(); });

  it('estado trae el encabezado, el resumen del día, capacidades y umbrales', async () => {
    const r = await request(app).get('/api/estado').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.listo).toBe(true);
    expect(r.body.usuario).toBe('dueno');
    expect(r.body.areas.length).toBe(4);
    expect(r.body.areasVenta).toEqual(['Casita 1', 'Casita 2']);
    expect(r.body.resumenDia).toMatchObject({ descontinuados: 1, sinMovimiento90: 2, urgentes: 2 });
    expect(r.body.resumenDia.alertas).toBeGreaterThan(0);
    expect(r.body.coberturaSucursal[0]).toMatchObject({ area: 'Casita 1', medianaDias: 6 });
    expect(r.body.capacidades).toEqual({ solicitudes: false, fotos: false, overrides: false, shopify: false });
    expect(r.body.umbrales).toMatchObject({ coberturaBajaDias: 7, sobrestockDias: 120, sobrestockMin: 24, topMasVendidos: 50 });
  });

  it('inventario, buscar, ficha, resurtir, movimiento y alertas responden', async () => {
    for (const ruta of RUTAS_DATOS) {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect(r.status, ruta).toBe(200);
    }
  });

  it('inventario: la condición "descontinuado" solo trae lo marcado en el Admin', async () => {
    const r = await request(app).get('/api/inventario?condiciones=descontinuado').set('Cookie', cookie);
    expect(r.body.productos.map(p => p.codigo)).toEqual(['012000809996']);
    expect(r.body.productos[0].descontinuado).toBe(true);
  });

  it('el buscador encuentra un producto que no cae en ningún filtro (solo está en la caja)', async () => {
    const r = await request(app).get('/api/buscar?q=mostaza').set('Cookie', cookie);
    expect(r.body.deCatalogo).toBe(1);
    expect(r.body.productos[0]).toMatchObject({ codigo: '777777777777', enCatalogoSolo: true });
    const ficha = await request(app).get('/api/producto/777777777777').set('Cookie', cookie);
    expect(ficha.status).toBe(200);
    expect(ficha.body.producto.enCatalogoSolo).toBe(true);
  });

  it('un producto que no existe da 404 (y un código raro también)', async () => {
    expect((await request(app).get('/api/producto/xxxx').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).get('/api/producto/%3Cscript%3E').set('Cookie', cookie)).status).toBe(404);
  });

  it('las rutas de la versión 1 ya no existen', async () => {
    for (const ruta of ['/api/sin-venta', '/api/mas-vendidos', '/api/resurtido']) {
      expect((await request(app).get(ruta).set('Cookie', cookie)).status, ruta).toBe(404);
    }
  });

  it('sin admin, el proxy contesta 503 y Resurtir sale sin historial', async () => {
    const r = await request(app).get('/api/solicitudes/ubicaciones').set('Cookie', cookie);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/no responde/);
    const rs = await request(app).get('/api/resurtir').set('Cookie', cookie);
    expect(rs.status).toBe(200);
    expect(rs.body.historial).toBeNull();
  });
});

describe('descartar alertas (la única escritura propia)', () => {
  beforeEach(async () => { await entrar(); _reiniciarPropio(); });

  it('descarta con usuario y fecha, desaparece de la lista y se puede deshacer', async () => {
    const antes = await request(app).get('/api/alertas?filtro=caja').set('Cookie', cookie);
    expect(antes.body.alertas.map(a => a.id)).toEqual(['sin_alta:444444444444']);

    const d = await request(app).post('/api/alertas/sin_alta:444444444444/descartar').set('Cookie', cookie).send({});
    expect(d.status).toBe(200);
    expect(d.body.ok).toBe(true);
    expect(d.body.descartada.usuario).toBe('dueno');
    expect(d.body.descartada.cuando).toMatch(/-06:00$/);

    const despues = await request(app).get('/api/alertas?filtro=caja').set('Cookie', cookie);
    expect(despues.body.alertas).toEqual([]);
    expect(despues.body.conteo.descartadas).toBe(1);
    const conDescartadas = await request(app).get('/api/alertas?filtro=caja&descartadas=1').set('Cookie', cookie);
    expect(conDescartadas.body.alertas[0].descartada.usuario).toBe('dueno');

    const u = await request(app).post('/api/alertas/sin_alta:444444444444/descartar').set('Cookie', cookie).send({ deshacer: true });
    expect(u.status).toBe(200);
    expect(u.body.descartada).toBeNull();
    const otraVez = await request(app).get('/api/alertas?filtro=caja').set('Cookie', cookie);
    expect(otraVez.body.alertas.map(a => a.id)).toEqual(['sin_alta:444444444444']);
  });

  it('ids raros o inexistentes no se guardan', async () => {
    expect((await request(app).post('/api/alertas/basura/descartar').set('Cookie', cookie).send({})).status).toBe(400);
    expect((await request(app).post('/api/alertas/sin_alta:no-existe/descartar').set('Cookie', cookie).send({})).status).toBe(404);
    expect((await request(app).post('/api/alertas/' + encodeURIComponent('x:../../etc') + '/descartar').set('Cookie', cookie).send({})).status).toBe(400);
  });
});

describe('esta app escribe SOLO lo permitido', () => {
  beforeEach(async () => { await entrar(); });

  it('no existe ningún PUT, PATCH ni DELETE', async () => {
    const rutas = ['/api/estado', '/api/producto/098733', '/api/inventario', '/api/resurtir', '/api/movimiento', '/api/alertas', '/api/alertas/sin_alta:444444444444/descartar', '/api/solicitudes', '/api/solicitudes/7', '/api/login'];
    for (const metodo of ['put', 'patch', 'delete']) {
      for (const ruta of rutas) {
        const r = await request(app)[metodo](ruta).set('Cookie', cookie);
        expect([404, 405], `${metodo} ${ruta} devolvió ${r.status}`).toContain(r.status);
      }
    }
  });

  it('tampoco se puede hacer POST a las rutas de datos ni a acciones del admin', async () => {
    for (const ruta of ['/api/inventario', '/api/resurtir', '/api/movimiento', '/api/alertas', '/api/producto/098733', '/api/buscar', '/api/estado',
      '/api/solicitudes/7/hecha', '/api/solicitudes/7/cancelar', '/api/solicitudes/conciliar', '/api/sin-venta']) {
      const r = await request(app).post(ruta).set('Cookie', cookie).send({});
      expect(r.status, ruta).toBe(404);
    }
  });

  it('la lista de escrituras registradas en Express es exactamente la permitida', () => {
    // Se recorre el árbol de routers de Express y se apuntan todas las rutas que
    // aceptan algo que no sea GET/HEAD. Si alguien agrega una escritura, esta
    // prueba se entera.
    const escrituras = new Set();
    const recorrer = (pila, prefijo) => {
      for (const capa of pila ?? []) {
        if (capa.route) {
          for (const m of Object.keys(capa.route.methods)) {
            if (m !== 'get' && m !== 'head' && m !== '_all') escrituras.add(`${m.toUpperCase()} ${prefijo}${capa.route.path}`);
          }
        } else if (capa.handle?.stack) {
          // El prefijo de un router montado sale de su regexp: /^\/api\/?(?=\/|$)/i -> "/api".
          const origen = capa.regexp?.source ?? '';
          const m = origen.match(/^\^((?:\\\/[^\\?]+)+)\\\/\?\(\?=\\\/\|\$\)/);
          const trozo = m ? m[1].replace(/\\\//g, '/') : '';
          recorrer(capa.handle.stack, prefijo + trozo);
        }
      }
    };
    recorrer(app._router.stack, '');
    expect([...escrituras].sort()).toEqual([
      'POST /api/alertas/:id/descartar',
      'POST /api/login',
      'POST /api/logout',
      'POST /api/solicitudes/',
    ]);
  });
});

describe('nada de dinero', () => {
  beforeEach(async () => { await entrar(); });

  it('ninguna respuesta trae llaves ni textos de dinero', async () => {
    const problemas = [];
    for (const ruta of RUTAS_DATOS) {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect(r.status, ruta).toBe(200);
      problemas.push(...revisarPrivacidad(r.body, ruta));
      // Y sobre el texto crudo, por si algo se cuela fuera del árbol de objetos.
      if (DINERO_EN_TEXTO.test(r.text)) problemas.push(`dinero en el texto de ${ruta}`);
      if (/proveedor/i.test(r.text)) problemas.push(`"proveedor" en ${ruta}`);
    }
    expect(problemas).toEqual([]);
  });
});

describe('cabeceras', () => {
  it('van en todas las respuestas', async () => {
    const r = await request(app).get('/entrar');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-robots-tag']).toMatch(/noindex/);
    expect(r.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(r.headers['content-security-policy']).toMatch(/img-src 'self' https:\/\/cdn\.shopify\.com/);
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('el API nunca se guarda en caché', async () => {
    await entrar();
    const r = await request(app).get('/api/estado').set('Cookie', cookie);
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('robots.txt prohíbe todo', async () => {
    const r = await request(app).get('/robots.txt');
    expect(r.text).toContain('Disallow: /');
  });
});

describe('regresiones de la revisión', () => {
  it('una cookie mal formada no tumba la app (antes lanzaba URIError)', async () => {
    const r = await request(app).get('/api/estado').set('Cookie', 'basura=%; otra=100%');
    expect(r.status).toBe(401);       // sin sesión, pero contesta
    const r2 = await request(app).get('/entrar').set('Cookie', 'x=%E0%A4%A');
    expect([200, 503]).toContain(r2.status);
  });

  it('si al usuario lo quitan del .env, su cookie deja de servir', async () => {
    await entrar();
    const antes = config.sesion.usuarios;
    config.sesion.usuarios = antes.filter(u => u.usuario !== 'dueno');
    try {
      const r = await request(app).get('/api/estado').set('Cookie', cookie);
      expect(r.status).toBe(401);
    } finally {
      config.sesion.usuarios = antes;
    }
  });

  it('el señuelo del usuario inexistente sí cuesta tiempo (no delata qué usuarios hay)', async () => {
    // Si el hash de adorno fuera inválido, bcryptjs contestaría en microsegundos.
    const t0 = Date.now();
    await request(app).post('/api/login').send({ usuario: 'no-existe-nadie', contrasena: 'x' });
    const conUsuarioFalso = Date.now() - t0;
    expect(conUsuarioFalso).toBeGreaterThan(30);
  });

  it('el tope global de bcrypt no le cierra la puerta a quien no ha fallado', async () => {
    config.sesion.bcryptPorMinuto = 1;
    // Un "bot" quema el cupo desde su IP.
    await request(app).post('/api/login').set('X-Forwarded-For', '9.9.9.9').send({ usuario: 'dueno', contrasena: 'mala' });
    // El dueño, desde otra IP y sin fallos, SÍ puede entrar.
    const r = await request(app).post('/api/login').send({ usuario: 'dueno', contrasena: CONTRASENA });
    expect(r.status).toBe(200);
  });
});
