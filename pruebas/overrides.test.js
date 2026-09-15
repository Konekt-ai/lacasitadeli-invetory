// src/db/overrides.js contra un SQLite de mentiras con la misma tabla del admin
// (product_overrides). Se prueba con y sin la columna `descontinuado` (admin viejo).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import {
  _ponerOverridesDePrueba, capacidadesOverrides, fechaSqliteANaive, obtenerOverrides, overridesEnMemoria,
} from '../src/db/overrides.js';
import { fotosEnMemoria, obtenerFotos } from '../src/db/fotos.js';

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'invetory-overrides-'));
const rutaOriginal = config.rutas.sqliteFotos;

function crearBase(nombre, { conEstatus }) {
  const ruta = path.join(carpeta, nombre);
  const db = new Database(ruta);
  db.exec(conEstatus
    ? `CREATE TABLE product_overrides (art_codigo TEXT PRIMARY KEY, image_url TEXT, min_stock INTEGER,
         updated_at TEXT, categoria TEXT, tipo TEXT, descontinuado INTEGER DEFAULT 0, descontinuado_desde TEXT)`
    : `CREATE TABLE product_overrides (art_codigo TEXT PRIMARY KEY, image_url TEXT, min_stock INTEGER,
         updated_at TEXT, categoria TEXT)`);
  const meter = db.prepare(conEstatus
    ? 'INSERT INTO product_overrides (art_codigo, image_url, categoria, descontinuado, descontinuado_desde) VALUES (?, ?, ?, ?, ?)'
    : 'INSERT INTO product_overrides (art_codigo, image_url, categoria) VALUES (?, ?, ?)');
  const filas = [
    ['012000809996', 'https://cdn.shopify.com/s/files/pepsi.jpg', null, 1, '2026-09-01T10:00:00.000Z'],
    ['644209411139', null, null, 1, '2026-09-01 10:00:00'],
    ['222222222222', ' https://cdn.shopify.com/te.jpg ', 'Tés ', 0, null],
    ['333333333333', 'http://no-segura.com/foto.jpg', null, 0, null],   // http: no pasa la CSP
    ['444444444444', '', null, 0, null],                                // nada útil: no se guarda
    ['  ', 'https://cdn.shopify.com/sin-codigo.jpg', null, 0, null],   // sin código: se ignora
  ];
  for (const f of filas) meter.run(...(conEstatus ? f : f.slice(0, 3)));
  db.close();
  return ruta;
}

afterAll(() => {
  config.rutas.sqliteFotos = rutaOriginal;
  _ponerOverridesDePrueba(new Map());
  fs.rmSync(carpeta, { recursive: true, force: true });
});

describe('fechaSqliteANaive', () => {
  it('el SQLite del admin guarda UTC: se convierte a naive CDMX (−6 h)', () => {
    expect(fechaSqliteANaive('2026-09-01T10:00:00.000Z')).toEqual(new Date(Date.UTC(2026, 8, 1, 4, 0, 0)));
    expect(fechaSqliteANaive('2026-09-01 10:00:00')).toEqual(new Date(Date.UTC(2026, 8, 1, 4, 0, 0)));
    expect(fechaSqliteANaive('2026-09-01')).toEqual(new Date(Date.UTC(2026, 7, 31, 18, 0, 0)));
    expect(fechaSqliteANaive(null)).toBeNull();
    expect(fechaSqliteANaive('')).toBeNull();
    expect(fechaSqliteANaive('ayer')).toBeNull();
  });
});

describe('obtenerOverrides con la tabla del admin nuevo', () => {
  beforeAll(() => { config.rutas.sqliteFotos = crearBase('nuevo.db', { conEstatus: true }); });

  it('lee foto, categoría y descontinuado por art_codigo', async () => {
    const o = await obtenerOverrides({ forzar: true });
    expect(o.size).toBe(3);
    expect(o.get('012000809996')).toEqual({
      foto: 'https://cdn.shopify.com/s/files/pepsi.jpg', categoria: null, descontinuado: true,
      descontinuadoDesde: new Date(Date.UTC(2026, 8, 1, 4, 0, 0)),
    });
    expect(o.get('644209411139')).toMatchObject({ foto: null, descontinuado: true, descontinuadoDesde: new Date(Date.UTC(2026, 8, 1, 4, 0, 0)) });
    expect(o.get('222222222222')).toEqual({ foto: 'https://cdn.shopify.com/te.jpg', categoria: 'Tés', descontinuado: false, descontinuadoDesde: null });
    expect(o.has('333333333333'), 'liga http no segura').toBe(false);
    expect(o.has('444444444444'), 'fila vacía').toBe(false);
    expect(overridesEnMemoria()).toBe(o);
    expect(capacidadesOverrides()).toMatchObject({ fotos: true, overrides: true, error: null });
  });

  it('fotos.js sigue devolviendo el Map código → url (compatibilidad)', async () => {
    const fotos = await obtenerFotos();
    expect(fotos).toEqual(new Map([
      ['012000809996', 'https://cdn.shopify.com/s/files/pepsi.jpg'],
      ['222222222222', 'https://cdn.shopify.com/te.jpg'],
    ]));
    expect(fotosEnMemoria()).toEqual(fotos);
  });

  it('usa la caché mientras no se fuerce', async () => {
    const antes = await obtenerOverrides();
    config.rutas.sqliteFotos = path.join(carpeta, 'no-existe.db');
    expect(await obtenerOverrides()).toBe(antes);
  });

  it('si el archivo no se puede leer, se queda con lo que ya tenía (nunca truena)', async () => {
    config.rutas.sqliteFotos = path.join(carpeta, 'no-existe.db');
    const o = await obtenerOverrides({ forzar: true });
    expect(o.size).toBe(3);
    expect(capacidadesOverrides().error).toBeTruthy();
  });
});

describe('obtenerOverrides con el admin viejo (sin columna descontinuado)', () => {
  beforeAll(() => { config.rutas.sqliteFotos = crearBase('viejo.db', { conEstatus: false }); });

  it('cae a solo fotos y categoría, sin descontinuados, y lo dice en capacidades', async () => {
    const o = await obtenerOverrides({ forzar: true });
    expect(o.size).toBe(2);
    expect(o.get('012000809996')).toEqual({ foto: 'https://cdn.shopify.com/s/files/pepsi.jpg', categoria: null, descontinuado: false, descontinuadoDesde: null });
    expect(o.get('222222222222').categoria).toBe('Tés');
    expect([...o.values()].some(x => x.descontinuado)).toBe(false);
    expect(capacidadesOverrides()).toMatchObject({ fotos: true, overrides: false });
  });
});
