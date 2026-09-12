// Configuración: todo sale del .env de la caja (que NUNCA va en git).
// Cada valor trae un default sensato para poder desarrollar sin .env.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

export const RAIZ = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const texto = (llave, def = '') => (process.env[llave] ?? def).toString().trim();
const numero = (llave, def) => {
  const v = Number.parseFloat(process.env[llave]);
  return Number.isFinite(v) ? v : def;
};
const entero = (llave, def) => {
  const v = Number.parseInt(process.env[llave], 10);
  return Number.isFinite(v) ? v : def;
};
const lista = (llave, def = []) => {
  const v = texto(llave);
  if (!v) return def;
  return v.split(/[|,]/).map(s => s.trim()).filter(Boolean);
};

/** Usuarios: "dueno:$2b$12$hash,resurte:$2b$12$hash" */
function leerUsuarios() {
  const crudo = texto('USUARIOS');
  const usuarios = [];
  for (const par of crudo.split(',')) {
    const limpio = par.trim();
    if (!limpio) continue;
    const corte = limpio.indexOf(':');
    if (corte < 1) continue;
    const usuario = limpio.slice(0, corte).trim().toLowerCase();
    const hash = limpio.slice(corte + 1).trim();
    if (usuario && hash) usuarios.push({ usuario, hash });
  }
  return usuarios;
}

export const config = {
  nombreApp: 'Inventario La Casita',
  puerto: entero('PUERTO', 3010),
  // Solo 127.0.0.1: desde internet únicamente se llega por el túnel de Cloudflare.
  host: texto('HOST', '127.0.0.1'),
  entorno: texto('NODE_ENV', 'production'),

  rutas: {
    raiz: RAIZ,
    dist: path.join(RAIZ, 'dist'),
    logs: texto('CARPETA_LOGS') || path.join(RAIZ, 'logs'),
    sqliteFotos: texto('SQLITE_FOTOS', 'C:\\Users\\LACASITA\\Desktop\\lacasitadeli-admin\\apps\\api\\lacasita.db'),
  },

  sql: {
    server: texto('MSSQL_SERVER', 'localhost'),
    database: texto('MSSQL_DATABASE', 'compucaja'),
    user: texto('MSSQL_USER', 'inventory_ro'),
    password: process.env.MSSQL_PASSWORD ?? '',
    port: entero('MSSQL_PORT', 1433),
    timeoutMs: entero('MSSQL_TIMEOUT_MS', 120_000),
  },

  sesion: {
    usuarios: leerUsuarios(),
    secreto: texto('SESSION_SECRET'),
    horas: numero('SESION_HORAS', 12),
    cookieSegura: texto('COOKIE_SEGURA', '1') !== '0',
    intentosMax: entero('LOGIN_INTENTOS_MAX', 5),
    intentosVentanaMin: entero('LOGIN_VENTANA_MIN', 15),
    // Tope global de verificaciones bcrypt por minuto: un bot repartido en muchas
    // IPs no puede quemar la CPU de la caja (cada bcrypt de costo 12 cuesta entre
    // 0.4 y 0.8 s en esa computadora, y ahí mismo corre el punto de venta).
    bcryptPorMinuto: entero('LOGIN_BCRYPT_POR_MINUTO', 10),
  },

  umbrales: {
    descontinuadoDias: entero('DESCONTINUADO_DIAS', 90),
    lentoDias: entero('LENTO_DIAS', 30),
    nuevoDias: entero('NUEVO_DIAS', 30),
    coberturaUrgenteDias: numero('COBERTURA_URGENTE_DIAS', 2),
    coberturaBajaDias: numero('COBERTURA_BAJA_DIAS', 7),
    diasSugeridos: numero('DIAS_SUGERIDOS', 7),
    ventanaVentaDiariaDias: entero('VENTANA_VENTA_DIARIA_DIAS', 14),
    duplicadosDias: entero('DUPLICADOS_DIAS', 120),
  },

  areas: {
    // Áreas de respaldo de donde se surte el anaquel.
    respaldo: lista('AREAS_RESPALDO', ['Bodega']),
  },

  cocina: {
    categorias: lista('COCINA_CATEGORIAS', [
      'ESPECIALES LA CASITA', 'PASTELES Y POSTRES', 'CHAROLAS BAGUETTES Y CARNES',
      'RESTAURANT', 'INSUMOS DE COCINA NO VENTA', 'TERRAZA',
    ]),
    codigos: lista('COCINA_CODIGOS', ['0', '0505', '650082', '1000']),
    sufijos: lista('COCINA_SUFIJOS', [' LC']),
  },

  refresco: {
    rapidoMin: numero('REFRESCO_RAPIDO_MIN', 5),
    medioMin: numero('REFRESCO_MEDIO_MIN', 30),
    historialHoras: numero('REFRESCO_HISTORIAL_HORAS', 6),
    // Si nadie entra en este rato, la app deja de refrescar para no cargar la caja.
    ociosoMin: numero('REFRESCO_OCIOSO_MIN', 60),
    fotosMin: numero('REFRESCO_FOTOS_MIN', 30),
  },

  tunel: {
    metricas: texto('METRICAS_TUNEL', 'http://127.0.0.1:3011'),
    revisarSegundos: entero('TUNEL_REVISAR_SEG', 60),
    activo: texto('TUNEL_ACTIVO', '1') !== '0',
  },

  correo: {
    destino: texto('CORREO_URL', 'lacasitadeli2000@gmail.com'),
    resendKey: texto('RESEND_API_KEY'),
    remitente: texto('CORREO_REMITENTE', 'La Casita Deli <onboarding@resend.dev>'),
    usuarioGmail: texto('EMAIL_USER'),
    passGmail: texto('EMAIL_PASS'),
  },
};

/** Revisa lo mínimo para arrancar en producción. Devuelve lista de problemas. */
export function revisarConfig(c = config) {
  const problemas = [];
  if (!c.sesion.usuarios.length) problemas.push('USUARIOS está vacío: nadie podría entrar (usa npm run hash-contrasena).');
  if (c.sesion.secreto.length < 24) problemas.push('SESSION_SECRET debe tener al menos 24 caracteres.');
  if (!c.sql.password) problemas.push('MSSQL_PASSWORD está vacío.');
  if (c.sql.user.toLowerCase() === 'sa') problemas.push('MSSQL_USER es "sa": usa el login de solo lectura inventory_ro.');
  if (c.host !== '127.0.0.1' && c.host !== 'localhost') problemas.push(`HOST=${c.host}: la app debe escuchar solo en 127.0.0.1.`);
  return problemas;
}
