// Arranque de la app "Inventario La Casita" (solo lectura).
//
// IMPORTANTE en la computadora de la tienda: esto NO se arranca con `npm start`
// ni con `node server.js`. Se arranca con la copia renombrada:
//     bin\invetory-node.exe server.js
// porque el sistema admin hace `taskkill /F /IM node.exe` varias veces al día y se
// llevaría esta app por delante. Lo hace scripts\iniciar-app.bat.
import { config, revisarConfig } from './src/config.js';
import { log } from './src/log.js';
import { crearApp } from './src/web/app.js';
import { arrancarMotor, detenerMotor } from './src/servicios/inventario.js';
import { cerrar as cerrarSql } from './src/db/mssql.js';
import { iniciarVigilanciaTunel } from './src/tunel.js';

process.env.TZ = process.env.TZ || 'America/Mexico_City';

const problemas = revisarConfig();
for (const p of problemas) log.aviso('config', p);
if (problemas.length && config.entorno === 'production') {
  log.aviso('config', 'La app arranca igual, pero revisa el .env de la caja.');
}

// Esto NO es un aviso más: si el HOST no es 127.0.0.1 la app no arranca. Con
// HOST=0.0.0.0 quedaría escuchando en todas las tarjetas de red de la caja y
// cualquiera en el wifi de la tienda llegaría al formulario de entrada sin pasar
// por el túnel. Tampoco vale "localhost" ni "::1": en Windows se van a IPv6 y los
// scripts (que buscan 127.0.0.1:PUERTO con netstat) nunca verían la app arriba y
// la estarían arrancando otra vez cada 2 minutos.
if (config.host !== '127.0.0.1') {
  log.error('web', `HOST=${config.host}: esta app solo puede escuchar en 127.0.0.1 (a internet se sale por el túnel). No se arranca.`);
  process.exit(1);
}

const app = crearApp();
const servidor = app.listen(config.puerto, config.host, () => {
  log.info('web', `escuchando en http://${config.host}:${config.puerto} (solo local; a internet sale por el túnel)`);
});

servidor.on('error', e => {
  log.error('web', `no se pudo abrir el puerto ${config.puerto}`, e);
  process.exit(1);
});

// Primer cálculo y refrescos programados (no bloquean el arranque del servidor).
arrancarMotor().catch(e => log.error('motor', 'falló el arranque del motor', e));

// Vigila la URL del túnel y avisa por correo cuando cambia.
if (config.tunel.activo) {
  try {
    iniciarVigilanciaTunel();
  } catch (e) {
    log.aviso('tunel', 'no se pudo iniciar la vigilancia del túnel', e);
  }
}

let cerrando = false;
async function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  log.info('web', `cerrando (${senal})`);
  detenerMotor();
  servidor.close(() => {});
  await cerrarSql();
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

// Que un error suelto no deje la app muerta sin explicación en el log: el
// vigilante la levanta en menos de 2 minutos, pero el motivo tiene que quedar.
process.on('uncaughtException', e => log.error('app', 'excepción no atrapada', e));
process.on('unhandledRejection', e => log.error('app', 'promesa rechazada sin atrapar', e));
