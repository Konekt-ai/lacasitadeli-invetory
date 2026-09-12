// ¿Este producto "nunca vendido" en realidad se vende con OTRO código?
//
// Caso real 1: la TC52 contó `098733` "Kinder Joy Stranger Things" (507 piezas,
// cero ventas) y la caja vende `00987339` "KINDER JOY" (587 piezas en 120 días).
// Caso real 2: `126490` "ATARBUCKS FRAPPUCCINO MOCHA" contra `01264904`
// "STARBUCKS FRAPUCCINO MOCHA".
//
// La pista es doble: el código que sí vende CONTIENE al que no vende (al capturar
// se perdió el dígito verificador o un cero), y/o el nombre es casi el mismo.
//
// Rendimiento: el índice se arma sobre los productos SIN ventas (~2,700) y los
// candidatos (~13,000) se recorren UNA vez. Al revés (indexar candidatos) son
// decenas de millones de comparaciones y tarda minutos.
//
// Medido contra la base real (2026-09-11): 2,723 sin ventas × 12,879 candidatos
// → 399 posibles duplicados.

import {
  normalizar, palabras, parecidoPreparado, prepararTexto, sinCerosIzquierda, soloDigitos,
} from './texto.js';

export const OPCIONES_DUPLICADOS = {
  minDigitos: 6,      // un código de menos de 6 dígitos es interno/genérico: no se busca
  minBase: 5,         // '098733' sin ceros queda '98733' (5) y ese caso es real
  simFuerte: 0.72,    // parecido de nombre que vale como prueba
  simMedia: 0.55,
  simSola: 0.88,      // parecido tan alto que basta por sí solo
  umbral: 9,          // puntos mínimos para declarar "posible duplicado"
  palabraMuyComun: 60, // una palabra que aparece en más de tantos productos no distingue nada
};

const PUNTOS = { codigo: 4, prefijo: 3, largo: 2, nombreFuerte: 4, nombreMedio: 2 };

/**
 * @typedef {{codigo: string, nombre?: string, piezasVendidas?: number}} Candidato
 * @typedef {{codigo: string, nombre?: string}} SinVentas
 * @typedef {{codigo: string, nombre: string, piezasVendidas: number, puntos: number,
 *            parecidoNombre: number, motivos: string[]}} Duplicado
 */

/**
 * Busca, para cada producto sin ventas, el código que sí se vende y que
 * probablemente es el mismo producto.
 *
 * Puntos: contener el código (4) + ser prefijo (3) + largo parecido (2) +
 * nombre casi igual (4) o parecido (2). Con 9 puntos se declara duplicado, así
 * que "el código va adentro y además es prefijo" NO alcanza solo (eso daba falsos
 * positivos tipo `00014892` → `148927060614`): hace falta también largo parecido
 * o el nombre.
 *
 * @param {SinVentas[]} sinVentas  productos que nunca se han vendido
 * @param {Candidato[]} candidatos productos CON ventas en la ventana (p. ej. 120 días)
 * @param {Partial<typeof OPCIONES_DUPLICADOS>} [opciones]
 * @returns {Map<string, Duplicado>} código sin ventas -> mejor candidato
 */
export function buscarDuplicados(sinVentas, candidatos, opciones = {}) {
  const o = { ...OPCIONES_DUPLICADOS, ...opciones };
  const resultado = new Map();
  if (!sinVentas?.length || !candidatos?.length) return resultado;

  // ── Índices sobre los productos SIN ventas (el lado chico) ────────────────
  const porDigitos = new Map();   // dígitos (y versión sin ceros) -> [item]
  const porPalabra = new Map();   // palabra del nombre -> [item]
  const items = [];

  for (const p of sinVentas) {
    const dig = soloDigitos(p.codigo);
    const base = sinCerosIzquierda(dig);
    const nom = normalizar(p.nombre);
    const item = { codigo: p.codigo, dig, base, nom, prep: nom ? prepararTexto(nom) : null, mejor: null };
    items.push(item);

    if (dig.length >= o.minDigitos) {
      for (const llave of new Set([dig, base])) {
        if (llave.length < o.minBase) continue;
        let lista = porDigitos.get(llave);
        if (!lista) porDigitos.set(llave, (lista = []));
        lista.push(item);
      }
    }
    for (const w of palabras(nom)) {
      let lista = porPalabra.get(w);
      if (!lista) porPalabra.set(w, (lista = []));
      lista.push(item);
    }
  }
  if (!porDigitos.size && !porPalabra.size) return resultado;

  // Palabras como "CHOCOLATE" salen en cientos de productos: no sirven para
  // acortar la búsqueda y costaban la mayor parte del tiempo.
  for (const [w, lista] of porPalabra) {
    if (lista.length > o.palabraMuyComun) porPalabra.delete(w);
  }

  const largoMin = o.minBase;
  const tocados = new Map(); // item -> {motivos, puntos, sim}  (se reusa por candidato)
  const conNombre = new Set();

  for (const c of candidatos) {
    const cdig = soloDigitos(c.codigo);
    const cbase = sinCerosIzquierda(cdig);
    const cnom = normalizar(c.nombre);
    const vendidas = Number(c.piezasVendidas) || 0;
    tocados.clear();
    conNombre.clear();

    const anotar = (item, motivo, puntos) => {
      if (item.codigo === c.codigo) return;
      let t = tocados.get(item);
      if (!t) tocados.set(item, (t = { motivos: [], puntos: 0, sim: 0 }));
      if (!t.motivos.includes(motivo)) { t.motivos.push(motivo); t.puntos += puntos; }
    };

    // 1) el código del candidato contiene al código sin ventas
    if (cdig.length >= largoMin) {
      for (let largo = largoMin; largo <= cdig.length; largo++) {
        for (let i = 0; i + largo <= cdig.length; i++) {
          const lista = porDigitos.get(cdig.slice(i, i + largo));
          if (!lista) continue;
          for (const item of lista) anotar(item, 'codigo', PUNTOS.codigo);
        }
      }
      // 2) pistas extra: el candidato empieza igual y mide casi lo mismo
      for (const [item, t] of tocados) {
        if (!t.motivos.includes('codigo')) continue;
        if (cbase.startsWith(item.base) || cdig.startsWith(item.dig)) anotar(item, 'prefijo', PUNTOS.prefijo);
        if (Math.abs(cdig.length - item.dig.length) <= 2) anotar(item, 'largo', PUNTOS.largo);
      }
    }

    // 3) nombres casi iguales (solo contra los que comparten alguna palabra poco común)
    if (cnom) {
      for (const item of tocados.keys()) conNombre.add(item);
      for (const w of palabras(cnom)) {
        const lista = porPalabra.get(w);
        if (!lista) continue;
        for (const item of lista) conNombre.add(item);
      }
      if (conNombre.size) {
        const prepC = prepararTexto(cnom);
        for (const item of conNombre) {
          if (item.codigo === c.codigo || !item.prep) continue;
          const sim = parecidoPreparado(item.prep, prepC);
          if (sim < o.simMedia) continue;
          if (sim >= o.simFuerte) anotar(item, 'nombre', PUNTOS.nombreFuerte);
          else anotar(item, 'nombre~', PUNTOS.nombreMedio);
          // Un nombre prácticamente idéntico basta por sí solo.
          if (sim >= o.simSola) anotar(item, 'nombre-igual', o.umbral - PUNTOS.nombreFuerte);
          const t = tocados.get(item);
          if (t) t.sim = sim;
        }
      }
    }

    for (const [item, t] of tocados) {
      if (t.puntos < o.umbral) continue;
      // Empata a favor del que más vende (es el código "bueno" del producto).
      const score = t.puntos + t.sim + Math.min(vendidas, 1000) / 100_000;
      if (!item.mejor || score > item.mejor.score) {
        item.mejor = {
          score,
          codigo: c.codigo,
          nombre: (c.nombre ?? '').trim(),
          piezasVendidas: vendidas,
          puntos: t.puntos,
          parecidoNombre: Math.round(t.sim * 100) / 100,
          motivos: [...t.motivos],
        };
      }
    }
  }

  for (const item of items) {
    if (item.mejor) {
      const { score, ...limpio } = item.mejor;
      resultado.set(item.codigo, limpio);
    }
  }
  return resultado;
}
