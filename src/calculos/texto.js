// Utilidades de texto para comparar nombres de productos.
// Los nombres de NovaCaja vienen en MAYÚSCULAS, cortados a ~30 caracteres y con
// errores de dedo ("ATARBUCKS" por "STARBUCKS"), así que todo se compara
// normalizado y con una medida tolerante a typos (Dice sobre bigramas).

/** Quita acentos, signos y espacios de más; deja MAYÚSCULAS y números. */
export function normalizar(s) {
  return (s ?? '')
    .toString()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Solo los dígitos de un código ('ABC-0123' -> '0123'). */
export function soloDigitos(codigo) {
  return (codigo ?? '').toString().replace(/\D/g, '');
}

/** Quita los ceros de la izquierda ('00987339' -> '987339'). */
export function sinCerosIzquierda(digitos) {
  const s = (digitos ?? '').replace(/^0+/, '');
  return s;
}

/**
 * Prepara un texto normalizado para compararlo muchas veces (se arma una sola vez
 * y se reusa: armarlo en cada comparación era lo que hacía lento el detector).
 */
export function prepararTexto(textoNormalizado) {
  const t = ` ${textoNormalizado} `;
  const mapa = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    mapa.set(b, (mapa.get(b) ?? 0) + 1);
  }
  let total = 0;
  for (const v of mapa.values()) total += v;
  return { texto: textoNormalizado, mapa, total };
}

/** Parecido (Dice) entre dos textos ya preparados: 0 a 1. */
export function parecidoPreparado(a, b) {
  if (!a || !b || !a.total || !b.total) return 0;
  if (a.texto === b.texto) return 1;
  // Recorre el chico contra el grande: menos vueltas.
  const [chico, grande] = a.mapa.size <= b.mapa.size ? [a, b] : [b, a];
  let comunes = 0;
  for (const [k, v] of chico.mapa) {
    const w = grande.mapa.get(k);
    if (w) comunes += v < w ? v : w;
  }
  return (2 * comunes) / (a.total + b.total);
}

/**
 * Parecido entre dos textos YA normalizados: 0 (nada que ver) a 1 (idénticos).
 * Coeficiente de Dice sobre bigramas: aguanta typos y truncamientos.
 */
export function parecido(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return parecidoPreparado(prepararTexto(a), prepararTexto(b));
}

/** Palabras de al menos `min` letras/números, sin repetir. */
export function palabras(textoNormalizado, min = 4) {
  return [...new Set(textoNormalizado.split(' ').filter(p => p.length >= min))];
}
