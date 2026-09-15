// Fotos de los productos: envoltura compatible sobre src/db/overrides.js.
//
// Antes este archivo leía él solo `image_url` del SQLite del admin. Ahora esa
// lectura (fotos + categoría propia + descontinuado) la hace overrides.js en una
// sola pasada; aquí solo se deriva el Map código -> url para quien siga llamando
// a obtenerFotos() (el motor viejo, scripts, pruebas).
import { obtenerOverrides, overridesEnMemoria } from './overrides.js';

/** @param {Map<string, {foto: string|null}>} overrides */
function soloFotos(overrides) {
  const fotos = new Map();
  for (const [llave, o] of overrides) {
    if (o?.foto) fotos.set(llave, o.foto);
  }
  return fotos;
}

/**
 * Devuelve un Map con las ligas de fotos: la llave puede ser el Art_Codigo o el
 * código de barras tal cual (el admin guarda una u otra según el producto).
 * @param {{forzar?: boolean}} [opciones]
 */
export async function obtenerFotos({ forzar = false } = {}) {
  return soloFotos(await obtenerOverrides({ forzar }));
}

export function fotosEnMemoria() {
  return soloFotos(overridesEnMemoria());
}
