// Envío de correo de la app de inventario.
//
// Dos caminos, en este orden:
//   1) Resend (recomendado): una sola llamada HTTP con el fetch nativo de Node 20.
//      No se usa el paquete "resend" a propósito: una dependencia menos que instalar
//      en la computadora de la tienda.
//   2) Gmail con nodemailer (import dinámico, así nadie carga la librería si no se usa).
//
// Si NO hay ninguna credencial la app NO truena: se anota el aviso en el log y se
// devuelve { enviado: false, motivo }. Un correo que no sale jamás debe tumbar la
// consulta de inventario.
//
// Regla firme: aquí nunca se imprime la llave de Resend ni la contraseña de Gmail.
// Todo lo que se manda al log pasa por sinSecretos().
import { config } from './config.js';

const URL_RESEND = 'https://api.resend.com/emails';
const TIEMPO_MAX_MS = 15_000; // si Resend no contesta en 15 s, se corta

/** Escribe en el log con una etiqueta para ubicarlo fácil. */
function registrar(mensaje) {
  console.log(`[correo] ${mensaje}`);
}

/**
 * Quita de cualquier texto la llave de Resend y la contraseña de Gmail.
 * Red de seguridad: algunos errores de red o de SMTP repiten lo que se les mandó.
 */
function sinSecretos(texto) {
  let limpio = String(texto ?? '');
  for (const secreto of [config.correo.resendKey, config.correo.passGmail]) {
    if (secreto && secreto.length > 3) limpio = limpio.split(secreto).join('***');
  }
  // Por si el secreto viajaba dentro de un encabezado Authorization.
  return limpio.replace(/Bearer\s+\S+/gi, 'Bearer ***');
}

/** ¿Hay con qué mandar correo? Sirve para avisar en el arranque. */
export function correoConfigurado() {
  const hayResend = Boolean(config.correo.resendKey);
  const hayGmail = Boolean(config.correo.usuarioGmail && config.correo.passGmail);
  return hayResend || hayGmail;
}

/** Qué camino se va a usar: 'resend', 'gmail' o null si no hay nada configurado. */
function medioDisponible() {
  if (config.correo.resendKey) return 'resend';
  if (config.correo.usuarioGmail && config.correo.passGmail) return 'gmail';
  return null;
}

/** Manda por Resend con el fetch nativo de Node 20. Devuelve el id del envío. */
async function enviarPorResend({ asunto, html, para }) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MAX_MS);
  try {
    const respuesta = await fetch(URL_RESEND, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.correo.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.correo.remitente,
        to: para,
        subject: asunto,
        html,
      }),
      signal: corte.signal,
    });

    const cuerpo = await respuesta.text();
    let datos = null;
    try { datos = cuerpo ? JSON.parse(cuerpo) : null; } catch { /* Resend contestó algo que no es JSON */ }

    if (!respuesta.ok) {
      const detalle = datos?.message || datos?.error?.message || cuerpo || `HTTP ${respuesta.status}`;
      throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`);
    }
    if (datos?.error) throw new Error(`Resend rechazó el correo: ${datos.error.message ?? 'sin detalle'}`);

    return datos?.id ?? '';
  } finally {
    clearTimeout(reloj);
  }
}

/** Manda por Gmail con nodemailer. La librería se carga solo si hace falta. */
async function enviarPorGmail({ asunto, html, para }) {
  const modulo = await import('nodemailer');
  const nodemailer = modulo.default ?? modulo;

  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.correo.usuarioGmail, pass: config.correo.passGmail },
    // Topes de tiempo, como el camino de Resend. Sin esto nodemailer espera hasta
    // 2 minutos por la conexión y 10 por el socket: con el internet a medias de la
    // tienda, un solo intento dejaría tomado el aviso del túnel muchísimo rato.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    // Gmail obliga a que el remitente sea la misma cuenta que se autenticó,
    // por eso aquí NO se usa config.correo.remitente (ese es para Resend).
    const info = await transporte.sendMail({
      from: `"${config.nombreApp}" <${config.correo.usuarioGmail}>`,
      to: para,
      subject: asunto,
      html,
    });

    return info?.messageId ?? '';
  } finally {
    // Que no quede la conexión SMTP abierta hasta que el sistema la tire.
    try { transporte.close(); } catch { /* ya estaba cerrada */ }
  }
}

/**
 * Manda un correo. NUNCA lanza excepción: siempre devuelve un resumen.
 *
 * @param {{ asunto: string, html: string, para?: string }} opciones
 * @returns {Promise<{ enviado: boolean, via?: string, id?: string, motivo?: string, reintentable?: boolean }>}
 *   reintentable dice si vale la pena volver a intentar (falla de red sí, falta de
 *   credenciales no).
 */
export async function enviarCorreo({ asunto, html, para } = {}) {
  const destino = (para || config.correo.destino || '').trim();
  const titulo = (asunto || '').trim();

  if (!destino) {
    const motivo = 'No hay a quién mandarle el correo (falta CORREO_URL en el .env).';
    registrar(motivo);
    return { enviado: false, motivo, reintentable: false };
  }
  if (!titulo) {
    const motivo = 'El correo no lleva asunto: no se manda.';
    registrar(motivo);
    return { enviado: false, motivo, reintentable: false };
  }

  const medio = medioDisponible();
  if (!medio) {
    const motivo = 'No hay correo configurado: agrega RESEND_API_KEY, o EMAIL_USER y EMAIL_PASS, en el .env.';
    registrar(motivo);
    return { enviado: false, motivo, reintentable: false };
  }

  try {
    const id = medio === 'resend'
      ? await enviarPorResend({ asunto: titulo, html, para: destino })
      : await enviarPorGmail({ asunto: titulo, html, para: destino });

    registrar(`Correo enviado por ${medio} a ${destino}.`);
    return { enviado: true, via: medio, id };
  } catch (error) {
    const motivo = sinSecretos(error?.message || error);
    registrar(`No se pudo enviar por ${medio}: ${motivo}`);
    return { enviado: false, via: medio, motivo, reintentable: true };
  }
}
