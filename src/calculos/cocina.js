// Comida hecha en la casa: manda en las ventas pero NO se resurte.
//
// Los 7 códigos más vendidos de la tienda son comida preparada sin inventario
// (ALIMENTOS LA CASITA 4,041 piezas en 30 días, baguette, empanada, paella…).
// Si no se separa, la app diría "resurte paella" y taparía lo que de verdad hay
// que surtir. Por eso las vistas de resurtido y de más vendidos la ocultan por
// defecto (con un switch para volver a verla).
//
// OJO medido en la base real: la categoría NO alcanza — `0` ALIMENTOS LA CASITA
// y `003` ORDEN PAELLA COMPLETA están en "ABARROTES", igual que 8,912 productos
// normales. Por eso hay tres reglas: categoría, lista de códigos y sufijo " LC".

import { normalizar } from './texto.js';

/**
 * @param {{codigo?: string, categoria?: string, nombre?: string}} producto
 * @param {{categorias?: string[], codigos?: string[], sufijos?: string[]}} [reglas]
 */
export function esCocina(producto, reglas = {}) {
  if (!producto) return false;
  const categorias = (reglas.categorias ?? []).map(c => normalizar(c));
  const codigos = new Set((reglas.codigos ?? []).map(c => String(c).trim()));
  const sufijos = (reglas.sufijos ?? [' LC']).map(s => normalizar(s));

  const codigo = String(producto.codigo ?? '').trim();
  if (codigo && codigos.has(codigo)) return true;

  const categoria = normalizar(producto.categoria);
  if (categoria && categorias.includes(categoria)) return true;

  const nombre = normalizar(producto.nombre);
  if (nombre) {
    for (const suf of sufijos) {
      if (!suf) continue;
      // " LC" pega con "EMPANADA ARGENTINA LC" pero no con "PAN BLANCO".
      if (nombre === suf.trim() || nombre.endsWith(` ${suf.trim()}`)) return true;
    }
  }
  return false;
}
