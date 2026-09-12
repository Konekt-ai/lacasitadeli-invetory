// Vigilancia de la dirección del túnel de Cloudflare.
//
// El túnel rápido ("quick tunnel") genera una dirección NUEVA cada vez que arranca
// cloudflared. Por eso cloudflared corre APARTE de esta app y aquí NUNCA se reinicia:
// reiniciarlo sin necesidad le cambiaría la dirección al dueño. Este módulo solo MIRA
// y, cuando la dirección cambia, la guarda y manda un correo con la nueva.
//
// Cómo se averigua la dirección:
//   1) cloudflared expone http://127.0.0.1:3011/quicktunnel -> {"hostname":"algo.trycloudflare.com"}
//      (ese endpoint existe pero NO está documentado, así que puede desaparecer).
//   2) Si eso falla, se busca en logs/cloudflared.log, del final hacia atrás, la
//      ÚLTIMA dirección https://...trycloudflare.com que aparezca.
//      OJO: cloudflared escribe el recuadro de la dirección por la salida de errores y
//      una sola vez, al arrancar. Para que ese respaldo sirva, cloudflared debe escribir
//      el log él mismo:
//        cloudflared tunnel --url http://127.0.0.1:3010 --metrics 127.0.0.1:3011 --logfile "...\logs\cloudflared.log"
//      (con comillas: la ruta trae paréntesis y espacios). Si se prefiere redirección,
//      tiene que ser  >> "...\logs\cloudflared.log" 2>&1  , nunca solo  >  .
//
// Si ningún camino da la dirección, aquí NO se toca cloudflared (eso le cambiaría la
// dirección al dueño): solo se anota y se sigue con la de logs/url-actual.txt.
//
// Que no haya túnel NO es un error: se anota y ya. Todo va con try/catch porque una
// falla del túnel jamás debe tumbar la consulta de inventario.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { enviarCorreo } from './correo.js';

const ARCHIVO_ACTUAL = 'url-actual.txt';
const ARCHIVO_AVISADA = 'url-avisada.txt';   // SOLO se escribe cuando el correo ya salió
const ARCHIVO_HISTORIAL = 'url-historial.txt';
const ARCHIVO_LOG_CLOUDFLARED = 'cloudflared.log';

const TIEMPO_MAX_MS = 3_000;          // la consulta a las métricas es local: 3 s de sobra
const COLA_LOG_BYTES = 64 * 1024;     // el log se lee por bloques, del final hacia atrás
const MAX_LOG_BYTES = 4 * 1024 * 1024; // hasta dónde se busca hacia atrás en el log
const TRASLAPE_BYTES = 512;           // los bloques se enciman por si la dirección quedó partida
const ESPERAS_REINTENTO_MS = [15_000, 60_000, 180_000]; // 3 intentos de correo, espaciados

const PATRON_DIRECCION = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;

// Estado en memoria (no se expone al frontend).
const estado = {
  url: null,        // dirección vigente, con https://
  desde: null,      // cuándo se vio por primera vez esta dirección (ISO)
  listo: false,     // el correo con esta dirección ya salió (el dueño ya la tiene)
};

let vigilando = false;   // evita arrancar la vigilancia dos veces
let revisando = false;   // evita que dos revisiones se encimen
let avisando = false;    // hay un aviso por correo en curso
let urlAvisada = null;   // última dirección por la que ya se avisó (no se repite)
let urlPendiente = null; // dirección que falta avisar (la toma el ciclo que ya corre)
let urlFalloAnotado = null; // dirección que ya quedó anotada en el historial como "no se pudo avisar"
let logRevisado = null;  // { tam, url } de la última búsqueda en el log de cloudflared
let temporizador = null;

/** Escribe en el log con una etiqueta para ubicarlo fácil. */
function registrar(mensaje) {
  console.log(`[tunel] ${mensaje}`);
}

/** Espera sin bloquear (para los reintentos del correo). Con unref: si algo apaga
 *  la app en medio de un reintento, el proceso no se queda esperando el reloj. */
const esperar = (ms) => new Promise((listo) => {
  const reloj = setTimeout(listo, ms);
  reloj.unref?.();
});

/** Fecha y hora de la Ciudad de México, legible. */
function fechaCdmx(cuando = new Date()) {
  try {
    return cuando.toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return cuando.toISOString();
  }
}

const rutaLogs = (archivo) => path.join(config.rutas.logs, archivo);

/** Crea la carpeta de logs si falta. */
async function asegurarCarpeta() {
  await fs.mkdir(config.rutas.logs, { recursive: true });
}

/** Deja la dirección siempre con https:// y sin diagonal al final. */
function normalizar(direccion) {
  const limpio = String(direccion ?? '').trim().replace(/\/+$/, '');
  if (!limpio) return null;
  const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
  // SOLO el dominio del túnel rápido (el mismo que exige PATRON_DIRECCION). Aceptar
  // cualquier dominio sería peligroso: la dirección de las métricas sale de un puerto
  // local sin contraseña, y si otro programa contesta ahí, la app le mandaría al dueño
  // un correo invitándolo a teclear su usuario y contraseña en un sitio ajeno.
  // Si algún día se usa un túnel con dominio propio, ese dominio debe salir del .env.
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(conEsquema)) return null;
  return conEsquema;
}

/** Camino 1: preguntarle a las métricas de cloudflared. */
async function direccionDesdeMetricas() {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MAX_MS);
  try {
    const base = String(config.tunel.metricas || '').replace(/\/+$/, '');
    if (!base) return null;
    const respuesta = await fetch(`${base}/quicktunnel`, { signal: corte.signal });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    // Viene SIN https://, por eso pasa por normalizar().
    return normalizar(datos?.hostname);
  } catch {
    // Sin cloudflared arriba esto falla siempre: no es error, hay respaldo.
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Camino 2: buscar la ÚLTIMA dirección en logs/cloudflared.log.
 *
 * cloudflared imprime el recuadro con la dirección UNA SOLA VEZ, al arrancar, y luego
 * sigue escribiendo (reconexiones, avisos). Con el túnel arriba varios días ese recuadro
 * ya no cabe en los últimos 64 KB, así que se busca del final hacia atrás por bloques.
 * Lo que ya se revisó NO se vuelve a leer: solo lo que el log creció desde la vez
 * pasada, para no estar leyendo megabytes cada minuto en la computadora de la caja.
 */
async function direccionDesdeLog() {
  let manejador = null;
  try {
    const ruta = rutaLogs(ARCHIVO_LOG_CLOUDFLARED);
    manejador = await fs.open(ruta, 'r');
    const { size } = await manejador.stat();
    if (!size) return null;

    // Si el log encogió, es otro archivo (se rotó): se busca todo otra vez.
    // Si no, basta con mirar lo que creció desde la revisión pasada: lo de arriba ya
    // se revisó y una dirección más nueva solo puede estar al final.
    const anterior = logRevisado && logRevisado.tam <= size ? logRevisado : null;
    const piso = anterior ? Math.max(0, anterior.tam - TRASLAPE_BYTES) : 0;
    const limite = Math.max(piso, size - MAX_LOG_BYTES, 0);

    let fin = size;
    let restante = size - limite;
    while (restante > 0) {
      const largo = Math.min(restante, COLA_LOG_BYTES);
      const bloque = Buffer.alloc(largo);
      await manejador.read(bloque, 0, largo, fin - largo);

      const encontradas = bloque.toString('utf8').match(PATRON_DIRECCION);
      if (encontradas?.length) {
        const hallada = normalizar(encontradas[encontradas.length - 1]);
        logRevisado = { tam: size, url: hallada };
        return hallada;
      }

      // Se retrocede un poco menos de un bloque: así una dirección partida en dos
      // bloques aparece completa en el siguiente.
      const salto = largo > TRASLAPE_BYTES ? largo - TRASLAPE_BYTES : largo;
      fin -= salto;
      restante -= salto;
    }

    // En lo nuevo no había nada: vale lo que se encontró la vez pasada.
    logRevisado = { tam: size, url: anterior?.url ?? null };
    return logRevisado.url;
  } catch {
    // Puede no existir el log todavía: no es error.
    return null;
  } finally {
    await manejador?.close().catch(() => {});
  }
}

/** Averigua la dirección vigente por los dos caminos. null = no hay túnel. */
async function detectarDireccion() {
  return (await direccionDesdeMetricas()) ?? (await direccionDesdeLog());
}

/** Lee la dirección que quedó guardada de la vez pasada. */
async function leerUrlGuardada() {
  try {
    const texto = await fs.readFile(rutaLogs(ARCHIVO_ACTUAL), 'utf8');
    return normalizar(texto);
  } catch {
    return null; // arranque en frío: todavía no hay archivo
  }
}

/** Guarda la dirección vigente. */
async function guardarUrlActual(url) {
  await asegurarCarpeta();
  await fs.writeFile(rutaLogs(ARCHIVO_ACTUAL), `${url}\n`, 'utf8');
}

/** Lee la última dirección que SÍ salió por correo. */
async function leerUrlAvisada() {
  try {
    return normalizar(await fs.readFile(rutaLogs(ARCHIVO_AVISADA), 'utf8'));
  } catch {
    return null; // todavía no se ha avisado ninguna
  }
}

/** Anota que esta dirección ya salió por correo (guardada NO es lo mismo que avisada). */
async function marcarAvisada(url) {
  try {
    await asegurarCarpeta();
    await fs.writeFile(rutaLogs(ARCHIVO_AVISADA), `${url}\n`, 'utf8');
  } catch (error) {
    registrar(`No se pudo anotar la dirección avisada: ${error?.message ?? error}`);
  }
}

/** Agrega una línea al historial (nunca borra lo anterior). */
async function agregarHistorial(linea) {
  try {
    await asegurarCarpeta();
    await fs.appendFile(rutaLogs(ARCHIVO_HISTORIAL), `${fechaCdmx()} ${linea}\n`, 'utf8');
  } catch (error) {
    registrar(`No se pudo escribir el historial: ${error?.message ?? error}`);
  }
}

/** Texto del correo: sencillo, sin datos de la tienda. */
function armarCorreo(url) {
  const asunto = 'Nueva dirección para entrar al inventario';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333;line-height:1.6">
      <p>La dirección para entrar al inventario desde el celular cambió.</p>
      <p><strong>Nueva dirección:</strong><br>
        <a href="${url}" style="font-size:18px">${url}</a>
      </p>
      <p>Ábrela en el celular. El usuario y la contraseña son los de siempre.</p>
      <p style="color:#777;font-size:13px">
        La dirección anterior ya no funciona. Si vuelve a cambiar, llega otro correo como este.
      </p>
    </div>`;
  return { asunto, html };
}

/**
 * Avisa por correo la nueva dirección. Hasta 3 intentos espaciados.
 * No bloquea nada: se llama sin await.
 *
 * Si ya hay un aviso en curso, la dirección nueva queda PENDIENTE y el ciclo que
 * corre se pasa a ella: así una dirección nunca se pierde en silencio. Y mientras
 * el correo no salga de verdad, la dirección NO se marca como avisada: la revisión
 * siguiente lo vuelve a intentar (en cuanto regresa el internet, el dueño la recibe).
 */
async function avisarPorCorreo(url) {
  urlPendiente = url;
  if (avisando) return; // el ciclo que ya corre va a tomar la pendiente
  avisando = true;
  try {
    while (urlPendiente && urlPendiente !== urlAvisada) {
      const actual = urlPendiente;
      const { asunto, html } = armarCorreo(actual);

      for (let intento = 1; intento <= ESPERAS_REINTENTO_MS.length; intento++) {
        const resultado = await enviarCorreo({ asunto, html, para: config.correo.destino });

        if (resultado.enviado) {
          urlAvisada = actual;
          await marcarAvisada(actual);
          // Si mientras tanto llegó otra dirección, todavía falta avisar esa.
          estado.listo = (urlPendiente === actual);
          registrar(`Aviso de nueva dirección enviado (intento ${intento}).`);
          break;
        }
        if (resultado.reintentable === false) {
          // Sin credenciales no sirve reintentar: la dirección queda en el archivo.
          urlAvisada = actual;
          await marcarAvisada(actual);
          registrar(`No se avisó por correo: ${resultado.motivo} La dirección quedó en logs/${ARCHIVO_ACTUAL}.`);
          await agregarHistorial('(sin correo configurado: revisa la dirección en el archivo)');
          break;
        }

        registrar(`Falló el aviso por correo (intento ${intento} de ${ESPERAS_REINTENTO_MS.length}): ${resultado.motivo}`);
        if (urlPendiente !== actual) break; // llegó una dirección más nueva: se abandona esta
        if (intento < ESPERAS_REINTENTO_MS.length) await esperar(ESPERAS_REINTENTO_MS[intento - 1]);
        if (urlPendiente !== actual) break;
      }

      if (urlPendiente === actual && urlAvisada !== actual) {
        // Se agotaron los intentos y sigue pendiente: NO se da por avisada. La
        // revisión siguiente lo reintenta sola.
        registrar(`No se pudo avisar la nueva dirección después de ${ESPERAS_REINTENTO_MS.length} intentos; se reintenta en la revisión siguiente.`);
        if (urlFalloAnotado !== actual) {
          urlFalloAnotado = actual; // una sola línea de historial por dirección, no una cada rato
          await agregarHistorial('(todavía no se puede avisar por correo; se sigue intentando)');
        }
        return;
      }
    }
  } catch (error) {
    registrar(`Problema al avisar por correo: ${error?.message ?? error}`);
  } finally {
    avisando = false;
  }
}

/** Una revisión: mira la dirección y, si cambió, la guarda y avisa. */
async function revisar() {
  if (revisando) return;
  revisando = true;
  try {
    const url = await detectarDireccion();
    if (!url) {
      // Sin túnel no pasa nada malo: la app sigue sirviendo en 127.0.0.1. Y aquí
      // NUNCA se toca cloudflared: reiniciarlo le cambiaría la dirección al dueño.
      if (!estado.url) estado.url = await leerUrlGuardada(); // se sigue con la última guardada
      if (estado.url) registrar('Por ahora no se ve la dirección del túnel; se sigue con la última guardada.');
      return;
    }

    const guardada = await leerUrlGuardada();
    const avisada = await leerUrlAvisada();
    const nuevaEnMemoria = estado.url !== url;

    estado.url = url;
    if (nuevaEnMemoria) estado.desde = new Date().toISOString();

    if (url !== guardada) {
      // Cambió (o es la primera vez, sin archivo previo).
      await guardarUrlActual(url);
      await agregarHistorial(url);
      registrar(guardada ? 'La dirección del túnel cambió; se avisa por correo.' : 'Primera dirección del túnel detectada; se avisa por correo.');
    } else if (nuevaEnMemoria) {
      registrar('Dirección del túnel sin cambios.');
    }

    // Estar GUARDADA no es estar AVISADA: mientras el correo no haya salido, cada
    // revisión lo vuelve a intentar. Sin await: el correo no debe frenar la vigilancia.
    if (url !== avisada) {
      estado.listo = false;
      avisarPorCorreo(url);
    } else {
      estado.listo = true;
    }
  } catch (error) {
    registrar(`No se pudo revisar el túnel: ${error?.message ?? error}`);
  } finally {
    revisando = false;
  }
}

/**
 * Arranca la vigilancia: una revisión de inmediato y luego cada
 * config.tunel.revisarSegundos. Nunca lanza excepción ni bloquea el arranque.
 *
 * @returns {() => void} función para detener la vigilancia (útil en pruebas)
 */
export function iniciarVigilanciaTunel() {
  const detener = () => {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    vigilando = false;
  };

  try {
    if (!config.tunel.activo) {
      registrar('Vigilancia del túnel apagada por configuración.');
      return detener;
    }
    if (vigilando) return detener;
    vigilando = true;

    const segundos = Math.max(10, Number(config.tunel.revisarSegundos) || 60);

    // Primera revisión sin await: la app termina de arrancar aunque el túnel tarde.
    revisar();

    temporizador = setInterval(revisar, segundos * 1000);
    temporizador.unref?.(); // que este reloj no mantenga vivo al proceso

    registrar(`Vigilando la dirección del túnel cada ${segundos} segundos.`);
  } catch (error) {
    registrar(`No se pudo iniciar la vigilancia: ${error?.message ?? error}`);
  }
  return detener;
}

/**
 * Estado del túnel para uso INTERNO (logs, diagnóstico). No se expone al frontend:
 * la dirección es la puerta de entrada a la tienda.
 *
 * @returns {{ url: string|null, desde: string|null, listo: boolean }}
 */
export function estadoTunel() {
  return { url: estado.url, desde: estado.desde, listo: estado.listo };
}
