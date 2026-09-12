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
