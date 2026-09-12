// Genera el hash de una contraseña para pegarlo en USUARIOS del .env.
//
//   npm run hash-contrasena -- dueno
//   npm run hash-contrasena -- dueno "la contraseña que quieras"
//
// Si no le das contraseña, inventa una fácil de dictar por teléfono. El hash
// (bcrypt costo 12) es lo ÚNICO que se guarda; la contraseña no queda en ningún
// archivo. Cópiala en un lugar seguro antes de cerrar la ventana.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const PALABRAS = [
  'canela', 'jamon', 'queso', 'aceituna', 'baguette', 'paella', 'cafe', 'nuez',
  'romero', 'albahaca', 'mostaza', 'trufa', 'higo', 'durazno', 'menta', 'chile',
];

function contrasenaFacil() {
  const dado = n => crypto.randomInt(0, n);
  const palabras = Array.from({ length: 3 }, () => PALABRAS[dado(PALABRAS.length)]);
  return `${palabras.join('-')}-${String(crypto.randomInt(10, 100))}`;
}

const usuario = (process.argv[2] ?? '').trim().toLowerCase();
if (!usuario) {
  console.log('Uso: npm run hash-contrasena -- <usuario> [contraseña]');
  process.exit(1);
}
const contrasena = process.argv[3] ?? contrasenaFacil();
const hash = await bcrypt.hash(contrasena, 12);

console.log('');
console.log('  Usuario:     ', usuario);
console.log('  Contraseña:  ', contrasena, '   <- apúntala, no se vuelve a mostrar');
console.log('');
console.log('  Pega esto en el .env de la caja (junta los usuarios con comas):');
console.log('');
console.log(`  USUARIOS=${usuario}:${hash}`);
console.log('');
