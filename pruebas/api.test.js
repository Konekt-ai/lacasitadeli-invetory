// Pruebas del servidor: seguridad, privacidad y que solo se pueda LEER.
// No toca SQL Server: se le mete una foto ya armada con datos de mentiras.
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

const { config } = await import('../src/config.js');
const { armarSnapshot } = await import('../src/calculos/armar.js');
const { _ponerSnapshotDePrueba } = await import('../src/servicios/inventario.js');
const { limpiarIntentos } = await import('../src/web/auth.js');
const { crearApp } = await import('../src/web/app.js');
const { OPCIONES, datosCompletos } = await import('./datos-de-prueba.js');

let app;
let cookie;

// Palabras que NO pueden salir como LLAVE de ningún dato.
const LLAVES_PROHIBIDAS = /precio|costo|importe|total|iva|ieps|margen|ganancia|cajero|cliente|proveedor|\$/i;
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

beforeAll(() => {
  _ponerSnapshotDePrueba(armarSnapshot(datosCompletos(), OPCIONES));
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
    for (const ruta of ['/sin-venta', '/resurtir', '/mas-vendidos', '/buscar', '/producto/098733']) {
      const r = await request(app).get(ruta);
      expect(r.status, ruta).toBe(302);
    }
  });

  it('el API contesta 401 y no suelta datos', async () => {
    for (const ruta of ['/api/estado', '/api/sin-venta', '/api/resurtido', '/api/mas-vendidos', '/api/buscar?q=coca', '/api/producto/098733']) {
      const r = await request(app).get(ruta);
      expect(r.status, ruta).toBe(401);
      expect(JSON.stringify(r.body)).not.toMatch(/KINDER|PEPSI|piezas/i);
    }
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

  it('estado trae el encabezado y los umbrales', async () => {
    const r = await request(app).get('/api/estado').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.listo).toBe(true);
    expect(r.body.usuario).toBe('dueno');
    expect(r.body.areas.length).toBe(4);
    expect(r.body.umbrales.descontinuadoDias).toBe(90);
  });

  it('sin-venta trae tarjetas y productos', async () => {
    const r = await request(app).get('/api/sin-venta?clase=duplicado_probable').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.productos[0].duplicado.codigo).toBe('00987339');
  });

  it('resurtido, más vendidos, buscar y ficha responden', async () => {
    for (const ruta of ['/api/resurtido', '/api/mas-vendidos?dias=7', '/api/buscar?q=kinder', '/api/producto/098733']) {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect(r.status, ruta).toBe(200);
    }
  });

  it('un producto que no existe da 404', async () => {
    const r = await request(app).get('/api/producto/xxxx').set('Cookie', cookie);
    expect(r.status).toBe(404);
  });
});

describe('esta app NO escribe', () => {
  beforeEach(async () => { await entrar(); });

  it('no existe ningún PUT, PATCH ni DELETE', async () => {
    const rutas = ['/api/estado', '/api/producto/098733', '/api/sin-venta', '/api/resurtido', '/api/login'];
    for (const metodo of ['put', 'patch', 'delete']) {
      for (const ruta of rutas) {
        const r = await request(app)[metodo](ruta).set('Cookie', cookie);
        expect([404, 405], `${metodo} ${ruta} devolvió ${r.status}`).toContain(r.status);
      }
    }
  });

  it('tampoco se puede hacer POST a las rutas de datos', async () => {
    for (const ruta of ['/api/sin-venta', '/api/resurtido', '/api/producto/098733']) {
      const r = await request(app).post(ruta).set('Cookie', cookie).send({});
      expect(r.status, ruta).toBe(404);
    }
  });
});

describe('nada de dinero', () => {
  beforeEach(async () => { await entrar(); });

  it('ninguna respuesta trae llaves ni textos de dinero', async () => {
    const rutas = [
      '/api/estado', '/api/sin-venta?clase=todos', '/api/sin-venta?clase=sin_alta',
      '/api/sin-venta?clase=duplicado_probable', '/api/sin-venta?clase=nuevo',
      '/api/resurtido', '/api/resurtido?cocina=1&sinConteo=1',
      '/api/mas-vendidos?dias=7', '/api/mas-vendidos?dias=30',
      '/api/buscar?q=kinder', '/api/buscar?q=agua', '/api/producto/098733',
      '/api/producto/333333333333', '/api/producto/444444444444',
      '/api/producto/0', '/api/producto/555555555555', '/api/producto/012000809996',
      '/api/mas-vendidos?dias=30&cocina=1', '/api/sin-venta?clase=lento&orden=dias',
      '/api/sin-venta?clase=todos&area=Casita%201&dias=90',
    ];
    const problemas = [];
    for (const ruta of rutas) {
      const r = await request(app).get(ruta).set('Cookie', cookie);
      expect(r.status, ruta).toBe(200);
      problemas.push(...revisarPrivacidad(r.body, ruta));
      // Y sobre el texto crudo, por si algo se cuela fuera del árbol de objetos.
      if (DINERO_EN_TEXTO.test(r.text)) problemas.push(`dinero en el texto de ${ruta}`);
    }
    expect(problemas).toEqual([]);
  });

  it('el texto "Pedir al proveedor" es una acción, no un dato del proveedor', async () => {
    const r = await request(app).get('/api/resurtido').set('Cookie', cookie);
    const json = JSON.stringify(r.body);
    expect(json).not.toMatch(/"proveedor"\s*:/);
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
