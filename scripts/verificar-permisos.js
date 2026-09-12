// Comprueba que el login de la app NO pueda ver dinero y SÍ pueda ver lo que necesita.
//
//   node scripts/verificar-permisos.js
//
// Se conecta con lo que diga el .env (debe ser inventory_ro, no sa) y:
//   · da por BUENO que fallen las consultas a columnas de dinero;
//   · da por BUENO que funcionen las consultas de la app.
// Devuelve código de salida 1 si algo no cuadra, para poder usarlo en pruebas.
import { config } from '../src/config.js';
import { cerrar, consultar } from '../src/db/mssql.js';

const DEBEN_FALLAR = [
  ['Tickets.T_ImporteTotal', 'SELECT TOP 1 T_ImporteTotal FROM dbo.Tickets WITH (NOLOCK)'],
  ['Tickets.T_Cajero', 'SELECT TOP 1 T_Cajero FROM dbo.Tickets WITH (NOLOCK)'],
  ['Tickets.T_Cliente', 'SELECT TOP 1 T_Cliente FROM dbo.Tickets WITH (NOLOCK)'],
  ['TicketsPS.ValorUnitario', 'SELECT TOP 1 ValorUnitario FROM dbo.TicketsPS WITH (NOLOCK)'],
  ['TicketsPS.Importe', 'SELECT TOP 1 Importe FROM dbo.TicketsPS WITH (NOLOCK)'],
  ['VArticulosUnificados.Art_UltimoCosto', 'SELECT TOP 1 Art_UltimoCosto FROM dbo.VArticulosUnificados WITH (NOLOCK)'],
  ['VArticulosUnificados.Art_CodProv', 'SELECT TOP 1 Art_CodProv FROM dbo.VArticulosUnificados WITH (NOLOCK)'],
  ['SELECT * (trae todo, incluido el dinero)', 'SELECT TOP 1 * FROM dbo.TicketsPS WITH (NOLOCK)'],
  ['escribir en el inventario', 'UPDATE dbo.inventario_bodega SET cantidad = cantidad WHERE 1 = 0'],
  ['borrar ventas', 'DELETE FROM dbo.TicketsPS WHERE 1 = 0'],
  ['ListaPreciosArt (precios de venta)', 'SELECT TOP 1 LPA_PrecioVenta FROM dbo.ListaPreciosArt WITH (NOLOCK)'],
];

const DEBEN_FUNCIONAR = [
  ['última venta por código', 'SELECT TOP 1 Codigo, FechaHora, Cantidad, Concepto FROM dbo.TicketsPS WITH (NOLOCK)'],
  ['encabezado de tickets', 'SELECT TOP 1 FolTda_Codigo, FolEst_Codigo, FolDoc_Codigo, FolConsecutivo, T_Fecha FROM dbo.Tickets WITH (NOLOCK)'],
  ['catálogo', 'SELECT TOP 1 Art_Codigo, Art_Descripcion, Org_Descripcion, Mar_Nombre FROM dbo.VArticulosUnificados WITH (NOLOCK)'],
  ['inventario de la TC52', 'SELECT TOP 1 codigo_barras, ubicacion, cantidad, ultima_entrada, creado FROM dbo.inventario_bodega WITH (NOLOCK)'],
  ['áreas', 'SELECT TOP 1 nombre, color, activa, orden FROM dbo.ubicaciones_bodega WITH (NOLOCK)'],
  ['mapa de cajas', 'SELECT TOP 1 est_codigo, area FROM dbo.estacion_area_map WITH (NOLOCK)'],
  ['códigos de caja', 'SELECT TOP 1 codigo, codigo_base, unidades, tipo FROM dbo.codigos_producto WITH (NOLOCK)'],
  ['apartados', 'SELECT TOP 1 codigo_barras, ubicacion, cantidad, activa FROM dbo.reservas_bodega WITH (NOLOCK)'],
  ['tabla temporal', 'CREATE TABLE #prueba (a int); INSERT INTO #prueba VALUES (1); SELECT a FROM #prueba;'],
];

let malos = 0;
console.log(`\nRevisando permisos con el usuario "${config.sql.user}" en ${config.sql.server}/${config.sql.database}\n`);

if (config.sql.user.toLowerCase() === 'sa') {
  console.log('  ⚠  Estás usando "sa". La app debe usar inventory_ro. Esta prueba no sirve así.\n');
  malos++;
}

for (const [nombre, sql] of DEBEN_FALLAR) {
  try {
    await consultar(sql);
    console.log(`  ✗ PUEDE ver/hacer "${nombre}"  <-- NO debería`);
    malos++;
  } catch (e) {
    const permiso = /permission|permiso|denied|denegado|Invalid column|no válido|no es válido/i.test(e.message);
    console.log(`  ✓ bloqueado: ${nombre}${permiso ? '' : `  (falló por otra razón: ${e.message.slice(0, 60)})`}`);
    if (!permiso) malos++;
  }
}

console.log('');
for (const [nombre, sql] of DEBEN_FUNCIONAR) {
  try {
    await consultar(sql);
    console.log(`  ✓ puede leer: ${nombre}`);
  } catch (e) {
    console.log(`  ✗ NO puede leer "${nombre}": ${e.message.slice(0, 90)}`);
    malos++;
  }
}

await cerrar();
console.log(malos === 0
  ? '\nTodo bien: el login solo lee lo que la app necesita y no ve nada de dinero.\n'
  : `\nHay ${malos} problema(s) arriba.\n`);
process.exit(malos === 0 ? 0 : 1);
