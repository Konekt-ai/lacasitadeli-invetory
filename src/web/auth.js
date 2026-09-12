// Login sencillo, pero de verdad: la app queda en internet con una URL que
// cualquiera puede probar, y corre en la computadora del punto de venta.
//
//  · Usuarios y contraseñas (hash bcrypt costo 12) en el .env de la caja.
//  · Cookie de sesión firmada (HMAC): httpOnly + Secure + SameSite=Lax, 12 horas.
//    Es "sin estado" a propósito: reiniciar la app no cierra la sesión del dueño.
//  · 5 intentos fallidos por IP cada 15 min y un tope global de bcrypt por minuto
//    (así un bot no se lleva la CPU de la caja aunque venga de muchas IPs).
//  · Respuesta genérica: nunca se dice si el usuario existe o si falló la contraseña.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { log } from '../log.js';

export const COOKIE = 'invetory_sesion';
// Hash de adorno: se compara contra él cuando el usuario no existe, para tardar
// lo mismo que con uno real y no delatar qué usuarios hay.
//
// OJO: tiene que ser un bcrypt VÁLIDO de 60 caracteres exactos. bcryptjs revisa el
// largo antes de hacer cuentas (`if (hashValue.length !== 60) return false`), así
// que un señuelo de 59 se rechaza al instante y el usuario inventado contesta en
// microsegundos mientras el real tarda medio segundo: justo la diferencia que
// delata qué usuarios existen. Este es el hash real de un texto al azar.
const HASH_FALSO = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5Et.PsQXY0i3bTdkbuJxHRtTwTQpGiy';

const intentos = new Map();   // ip -> [marcas de tiempo de fallos]
let bcryptEnElMinuto = [];    // marcas de tiempo de verificaciones

function secreto() {
  const s = config.sesion.secreto;
  if (s && s.length >= 24) return s;
  // Sin SESSION_SECRET no se puede firmar nada: se usa uno al azar en memoria
  // (las sesiones se caen al reiniciar, pero nadie puede falsificar una cookie).
  if (!globalThis.__secretoTemporal) {
    globalThis.__secretoTemporal = crypto.randomBytes(32).toString('hex');
    log.aviso('auth', 'SESSION_SECRET no está configurado: se usa uno temporal');
  }
  return globalThis.__secretoTemporal;
}

const firmar = datos => crypto.createHmac('sha256', secreto()).update(datos).digest('base64url');

/** Arma el valor de la cookie: usuario|vence|firma */
export function crearToken(usuario, ahora = Date.now()) {
  const vence = ahora + config.sesion.horas * 3_600_000;
  const datos = `${Buffer.from(usuario, 'utf8').toString('base64url')}.${vence}`;
  return `${datos}.${firmar(datos)}`;
}

/** Devuelve el usuario si el token es válido y no venció. */
export function leerToken(token, ahora = Date.now()) {
  if (typeof token !== 'string' || token.length > 500) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [usuario64, vence, firma] = partes;
  const datos = `${usuario64}.${vence}`;
  const esperada = firmar(datos);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(Number(vence)) || Number(vence) < ahora) return null;
  try {
    return Buffer.from(usuario64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function leerCookies(req) {
  const crudo = req.headers?.cookie;
  const salida = {};
  if (!crudo) return salida;
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i < 1) continue;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (!nombre) continue;
    // Un "%" suelto en cualquier cookie hace que decodeURIComponent lance URIError.
    // Sin este try, una cookie mal formada tumbaría TODAS las respuestas de la app
    // (usuarioDe se llama en cada pantalla y en cada ruta del API).
    try {
      salida[nombre] = decodeURIComponent(valor);
    } catch {
      salida[nombre] = valor;
    }
  }
  return salida;
}

export function usuarioDe(req) {
  const token = leerCookies(req)[COOKIE];
  return token ? leerToken(token) : null;
}

export function ponerCookie(res, usuario) {
  const partes = [
    `${COOKIE}=${crearToken(usuario)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.round(config.sesion.horas * 3600)}`,
  ];
  if (config.sesion.cookieSegura) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function borrarCookie(res) {
  const partes = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (config.sesion.cookieSegura) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

const PARECE_IP = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * La IP real del celular viene de Cloudflare; si no, la del socket.
 *
 * Esa cadena es la llave del candado de 5 intentos, así que no se cree cualquier
 * cosa: tiene que PARECER una IP y la petición tiene que venir de verdad por el
 * túnel (Cloudflare siempre agrega cf-ray y reescribe cf-connecting-ip en su
 * orilla, así que desde internet no se puede inventar). Si no se cumple, se usa
 * la del socket y todos los que entren por ahí comparten el mismo candado.
 */
export function ipDe(req) {
  const cf = req.headers?.['cf-connecting-ip'];
  if (typeof cf === 'string' && PARECE_IP.test(cf) && req.headers['cf-ray']) return cf;
  return req.ip || req.socket?.remoteAddress || 'desconocida';
}

function limpiar(lista, ventanaMs, ahora) {
  return lista.filter(t => ahora - t < ventanaMs);
}

/** ¿Esta IP ya quemó sus intentos? */
export function bloqueado(ip, ahora = Date.now()) {
  const ventana = config.sesion.intentosVentanaMin * 60_000;
  const fallos = limpiar(intentos.get(ip) ?? [], ventana, ahora);
  if (fallos.length) intentos.set(ip, fallos); else intentos.delete(ip);
  return fallos.length >= config.sesion.intentosMax;
}

function anotarFallo(ip, ahora = Date.now()) {
  const ventana = config.sesion.intentosVentanaMin * 60_000;
  const fallos = limpiar(intentos.get(ip) ?? [], ventana, ahora);
  fallos.push(ahora);
  intentos.set(ip, fallos);
  // No dejar crecer el mapa para siempre.
  if (intentos.size > 5000) {
    for (const [k, v] of intentos) if (!limpiar(v, ventana, ahora).length) intentos.delete(k);
  }
}

/**
 * Olvida los intentos fallidos. Con una IP, solo los de esa IP (se usa al entrar
 * bien). Sin argumentos, borra todo, incluido el contador global de bcrypt: esa
 * forma es para las pruebas, que si no arrastran el cupo de un caso a otro.
 */
export function limpiarIntentos(ip) {
  if (ip) { intentos.delete(ip); return; }
  intentos.clear();
  bcryptEnElMinuto = [];
}

/**
 * ¿Queda cupo para gastar CPU en un bcrypt?
 *
 * El tope global existe para que un bot no queme la CPU de la caja (ahí mismo
 * corre el punto de venta). Pero si fuera un tope duro, cualquiera con la URL
 * podría dejarlo en cero con usuarios inventados y el dueño ya no podría entrar.
 * Por eso a quien NO ha fallado en la ventana (el dueño desde su celular) se le
 * deja pasar aunque el tope esté lleno, hasta el triple: la puerta nunca se cierra
 * del todo y el gasto sigue acotado.
 */
function hayCupoBcrypt(ahora, ipSinFallos) {
  bcryptEnElMinuto = limpiar(bcryptEnElMinuto, 60_000, ahora);
  const tope = config.sesion.bcryptPorMinuto;
  if (bcryptEnElMinuto.length < tope || (ipSinFallos && bcryptEnElMinuto.length < tope * 3)) {
    bcryptEnElMinuto.push(ahora);
    return true;
  }
  return false;
}

/**
 * Revisa usuario y contraseña.
 * @returns {Promise<{ok: boolean, usuario?: string, motivo?: 'datos'|'muchos_intentos'|'ocupado'}>}
 */
export async function revisarLogin({ usuario, contrasena, ip }) {
  const ahora = Date.now();
  if (bloqueado(ip, ahora)) return { ok: false, motivo: 'muchos_intentos' };
  const sinFallos = !(intentos.get(ip)?.length);
  if (!hayCupoBcrypt(ahora, sinFallos)) return { ok: false, motivo: 'ocupado' };

  const nombre = String(usuario ?? '').trim().toLowerCase();
  const clave = String(contrasena ?? '');
  const cuenta = config.sesion.usuarios.find(u => u.usuario === nombre);
  let vale = false;
  try {
    vale = await bcrypt.compare(clave, cuenta?.hash || HASH_FALSO);
  } catch (e) {
    log.error('auth', 'error comparando la contraseña', e);
    vale = false;
  }
  if (!cuenta || !vale) {
    anotarFallo(ip, ahora);
    log.aviso('auth', `intento fallido desde ${ip}`);
    return { ok: false, motivo: 'datos' };
  }
  limpiarIntentos(ip);
  log.info('auth', `entró ${cuenta.usuario}`);
  return { ok: true, usuario: cuenta.usuario };
}

/**
 * Middleware para /api: sin sesión no se contesta nada.
 *
 * Además de la firma, se revisa que ese usuario SIGA existiendo en el .env. Así,
 * quitar a alguien del .env y reiniciar lo deja fuera de inmediato; si no, su
 * cookie serviría hasta que venciera (12 h).
 */
export function exigeSesion(req, res, siguiente) {
  const usuario = usuarioDe(req);
  const existe = usuario && config.sesion.usuarios.some(u => u.usuario === usuario);
  if (!existe) {
    res.status(401).json({ error: 'Necesitas entrar', entrar: true });
    return;
  }
  req.usuario = usuario;
  siguiente();
}
