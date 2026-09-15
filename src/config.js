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
    // Estado propio de la app (alertas descartadas): data/invetory.db. Es el ÚNICO
    // archivo que esta app escribe; se crea solo en la caja.
    datos: texto('CARPETA_DATOS') || path.join(RAIZ, 'data'),
  },

  // API del panel admin (lacasitadeli-admin). Solo se usa para las solicitudes de
  // resurtido (proxy) y para saber si el admin está vivo. En la caja los dos
  // corren en la misma máquina: 127.0.0.1:3002. Otra dirección solo tiene
  // sentido en desarrollo (revisarConfig avisa).
  admin: {
    api: texto('ADMIN_API', 'http://127.0.0.1:3002').replace(/\/+$/, ''),
    timeoutMs: entero('ADMIN_TIMEOUT_MS', 10_000),
    // Cada cuánto se vuelve a preguntar si el admin contesta (capacidades.solicitudes)
    revisarMin: numero('ADMIN_REVISAR_MIN', 5),
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
    // "Sin movimiento" a partir de estos días sin venta (antes se llamaba
    // DESCONTINUADO_DIAS; se acepta el nombre viejo). OJO: esto NO marca nada
    // como "Descontinuado": eso solo lo decide el dueño en el Admin.
    sinMovimientoDias: entero('SIN_MOVIMIENTO_DIAS', entero('DESCONTINUADO_DIAS', 90)),
    descontinuadoDias: entero('SIN_MOVIMIENTO_DIAS', entero('DESCONTINUADO_DIAS', 90)),
    lentoDias: entero('LENTO_DIAS', 30),
    nuevoDias: entero('NUEVO_DIAS', 30),
    coberturaUrgenteDias: numero('COBERTURA_URGENTE_DIAS', 2),
    coberturaBajaDias: numero('COBERTURA_BAJA_DIAS', 7),
    diasSugeridos: numero('DIAS_SUGERIDOS', 7),
    ventanaVentaDiariaDias: entero('VENTANA_VENTA_DIARIA_DIAS', 14),
    duplicadosDias: entero('DUPLICADOS_DIAS', 120),
    // Cuántos días atrás se buscan ventas registradas con existencia en 0. La tabla
    // no tiene índice por fecha: 90 cuesta lo mismo que 30 y dice bien "desde cuándo".
    desfaseDias: entero('DESFASE_DIAS', 90),
    // Sobrestock: alcanza para más de estos días (con al menos estas piezas)
    sobrestockDias: numero('SOBRESTOCK_DIAS', 120),
    sobrestockMin: entero('SOBRESTOCK_MIN', 24),
    // "Más vendido": los N primeros por piezas de 30 días (sin cocina)
    topMasVendidos: entero('TOP_MAS_VENDIDOS', 50),
    // Alerta "estancado": sin movimiento desde este tramo (30/60/90/180)
    sinMovimientoAlertaDias: entero('SIN_MOVIMIENTO_ALERTA_DIAS', 180),
    // Alerta "entradas sin ventas": llegó hace estos días y no ha vendido nada
    entradasSinVentaDias: entero('ENTRADAS_SIN_VENTA_DIAS', 30),
    // Alerta "sin categoría": solo si vende al menos estas piezas en 30 días (en
    // la tienda casi todo es "ABARROTES"; sin este piso salían 9 mil alertas)
    sinCategoriaMinVentas30: entero('SIN_CATEGORIA_MIN_VENTAS_30', 10),
    // Ventas por día (mapas de calor de Movimiento): cuántos días atrás. Si en la
    // caja #dias tarda más de 4 s, aquí se baja a 30.
    ventasDiaDias: entero('VENTAS_DIA_DIAS', 90),
  },

  // Alerta "posible ubicación incorrecta": qué parece refrigerado y en qué áreas
  // no debería estar contado.
  refrigerado: {
    categorias: lista('REFRIGERADO_CATEGORIAS', ['QUESOS Y LACTEOS', 'CARNES', 'LACTEOS', 'CONGELADOS']),
    palabras: lista('REFRIGERADO_PALABRAS', ['REFRIGERAD', 'FROZEN', 'CONGELAD']),
    areasSospechosas: lista('REFRIGERADO_AREAS_SOSPECHOSAS', ['Bodega', 'Casita 1', 'Casita 2']),
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
  // "localhost" tampoco vale: en Windows se va a IPv6 (::1) y los scripts de la
  // caja, que buscan 127.0.0.1:PUERTO con netstat, no verían la app arriba.
  if (c.host !== '127.0.0.1') problemas.push(`HOST=${c.host}: la app debe escuchar solo en 127.0.0.1 (ni "localhost" ni "::1").`);
  // En la caja el admin corre en la misma máquina. Otra dirección en producción
  // casi seguro es un .env copiado de desarrollo (Tailscale), y las solicitudes
  // de resurtido se irían a otra tienda.
  if (c.entorno === 'production' && c.admin.api !== 'http://127.0.0.1:3002') {
    problemas.push(`ADMIN_API=${c.admin.api}: en la caja el admin está en http://127.0.0.1:3002.`);
  }
  return problemas;
}
