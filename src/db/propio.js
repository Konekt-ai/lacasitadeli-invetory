// El SQLite PROPIO de la app: data/invetory.db. Es el único archivo que esta app
// escribe (todo lo demás es solo lectura: NovaCaja, el SQLite del admin).
//
// Hoy guarda una sola cosa: las alertas que el dueño descartó, con quién y cuándo
// (tabla alertas_descartadas). Se puede deshacer.
//
// Reglas:
//   · un error aquí NUNCA tumba la app: si el archivo no se puede abrir (disco
//     lleno, carpeta sin permisos, better-sqlite3 sin compilar para ese Node), se
//     sigue trabajando en memoria y se avisa UNA vez en el log; lo descartado se
//     pierde al reiniciar, pero todo lo demás funciona;
//   · las lecturas son síncronas y salen de un Map en memoria que es espejo de la
//     tabla: las vistas no esperan al disco;
//   · WAL para que una lectura no bloquee a una escritura (y al revés).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ahoraNaive, naiveAIso } from '../calculos/fechas.js';
import { log } from '../log.js';

/** @typedef {{tipo: string, codigo: string, usuario: string, cuando: string}} Descartada */

let db = null;
let sentencias = null;
/** @type {Map<string, Descartada>} espejo de la tabla (id -> fila) */
let memoria = new Map();
let avisoSinDisco = false;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS alertas_descartadas (
  id      TEXT PRIMARY KEY,   -- "tipo:codigo", igual que en las alertas
  tipo    TEXT,
  codigo  TEXT,
  usuario TEXT,
  cuando  TEXT                -- ISO con -06:00 (hora de la tienda)
);`;

function avisar(mensaje, e) {
  if (avisoSinDisco) return;
  avisoSinDisco = true;
  log.aviso('propio', `${mensaje} (la app sigue; lo descartado se guarda solo en memoria hasta reiniciar)`, e);
}

/**
 * Abre (o crea) data/invetory.db y carga las descartadas a memoria. Se llama una
 * vez al arrancar; si falla, la app sigue sin disco.
 * @returns {Promise<boolean>} true si el archivo quedó abierto
 */
export async function abrirPropio() {
  if (db) return true;
  try {
    const { default: Database } = await import('better-sqlite3');
    fs.mkdirSync(config.rutas.datos, { recursive: true });
    const ruta = path.join(config.rutas.datos, 'invetory.db');
    const abierta = new Database(ruta);
    abierta.pragma('journal_mode = WAL');
    abierta.exec(ESQUEMA);
    sentencias = {
      todas: abierta.prepare('SELECT id, tipo, codigo, usuario, cuando FROM alertas_descartadas'),
      poner: abierta.prepare('INSERT OR REPLACE INTO alertas_descartadas (id, tipo, codigo, usuario, cuando) VALUES (?, ?, ?, ?, ?)'),
      quitar: abierta.prepare('DELETE FROM alertas_descartadas WHERE id = ?'),
    };
    const cargadas = new Map();
    for (const f of sentencias.todas.all()) {
      cargadas.set(String(f.id), { tipo: f.tipo ?? '', codigo: f.codigo ?? '', usuario: f.usuario ?? '', cuando: f.cuando ?? '' });
    }
    // Lo que se descartó mientras el disco no estaba se conserva encima.
    for (const [id, fila] of memoria) cargadas.set(id, fila);
    memoria = cargadas;
    db = abierta;
    log.info('propio', `${memoria.size} alertas descartadas en ${ruta}`);
    return true;
  } catch (e) {
    avisar('no se pudo abrir data/invetory.db', e);
    db = null;
    sentencias = null;
    return false;
  }
}

/**
 * Descarta una alerta. Devuelve la marca {usuario, cuando} que verá el celular.
 * @param {string} id  "tipo:codigo"
 * @param {{tipo?: string, codigo?: string, usuario?: string}} datos
 * @returns {Descartada}
 */
export function descartar(id, { tipo = '', codigo = '', usuario = '' } = {}) {
  const fila = {
    tipo: String(tipo ?? ''),
    codigo: String(codigo ?? ''),
    usuario: String(usuario ?? ''),
    cuando: naiveAIso(ahoraNaive()),
  };
  memoria.set(String(id), fila);
  if (sentencias) {
    try {
      sentencias.poner.run(String(id), fila.tipo, fila.codigo, fila.usuario, fila.cuando);
    } catch (e) {
      avisar('no se pudo escribir en data/invetory.db', e);
    }
  }
  return fila;
}

/**
 * Deshace un descarte. Devuelve true si había algo que deshacer.
 * @param {string} id
 */
export function deshacer(id) {
  const habia = memoria.delete(String(id));
  if (sentencias) {
    try {
      sentencias.quitar.run(String(id));
    } catch (e) {
      avisar('no se pudo escribir en data/invetory.db', e);
    }
  }
  return habia;
}

/** Todas las descartadas (Map id -> {tipo, codigo, usuario, cuando}), sin tocar el disco. */
export function descartadas() {
  return memoria;
}

export function cerrarPropio() {
  try { db?.close(); } catch { /* ya estaba cerrada */ }
  db = null;
  sentencias = null;
}

/** Solo para pruebas: cierra, olvida todo y vuelve a permitir el aviso. */
export function _reiniciarPropio() {
  cerrarPropio();
  memoria = new Map();
  avisoSinDisco = false;
}
