-- ============================================================================
--  Login de SOLO LECTURA para la app de inventario del celular.
--
--  Por qué existe: hoy en esa computadora solo está `sa`. Si esta app —que queda
--  publicada en internet— usara `sa`, cualquier error tonto podría borrar las
--  ventas de NovaCaja. `inventory_ro` solo puede LEER, y ni siquiera todo: los
--  permisos son POR COLUMNA, así que las columnas de dinero (precio, costo,
--  importe, IVA, cajero, cliente, proveedor) le están negadas de raíz.
--
--  Cómo se corre (en la caja, una sola vez):
--    sqlcmd -S localhost -U sa -P <contraseña de sa> -i scripts\crear-login-ro.sql
--
--  Antes de correrlo, cambia <<<PONER-CONTRASENA-AQUI>>> por una contraseña larga
--  (24+ caracteres). Esa contraseña va SOLO al .env de la caja (MSSQL_PASSWORD).
--  Este archivo NO debe guardarse con la contraseña adentro.
-- ============================================================================

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'inventory_ro')
BEGIN
    CREATE LOGIN [inventory_ro]
        WITH PASSWORD = N'<<<PONER-CONTRASENA-AQUI>>>',
             CHECK_POLICY = ON,
             CHECK_EXPIRATION = OFF,
             DEFAULT_DATABASE = [compucaja];
END
GO

USE [compucaja];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'inventory_ro')
BEGIN
    CREATE USER [inventory_ro] FOR LOGIN [inventory_ro];
END
GO

-- Encabezado de cada venta: solo las 4 llaves y la fecha.
GRANT SELECT ON dbo.Tickets
    (FolTda_Codigo, FolEst_Codigo, FolDoc_Codigo, FolConsecutivo, T_Fecha)
    TO [inventory_ro];

-- Renglones vendidos: código, cantidad, fecha y la descripción con la que se vendió.
GRANT SELECT ON dbo.TicketsPS
    (FolTda_Codigo, FolEst_Codigo, FolDoc_Codigo, FolConsecutivo, Codigo, Cantidad, FechaHora, Concepto)
    TO [inventory_ro];

-- Catálogo: nombre, categoría y marca. NADA de Art_UltimoCosto ni Art_CodProv.
GRANT SELECT ON dbo.VArticulosUnificados
    (Art_Codigo, Art_GTIN, CodAlt_Codigo, Art_PLU, Art_Descripcion, Org_Descripcion, Mar_Nombre)
    TO [inventory_ro];

-- Existencia física contada con la TC52.
GRANT SELECT ON dbo.inventario_bodega
    (codigo_barras, ubicacion, cantidad, ultima_entrada, ultima_salida, creado, nombre)
    TO [inventory_ro];

GRANT SELECT ON dbo.ubicaciones_bodega (nombre, color, activa, orden)        TO [inventory_ro];
GRANT SELECT ON dbo.estacion_area_map  (est_codigo, area)                    TO [inventory_ro];
GRANT SELECT ON dbo.codigos_producto   (codigo, codigo_base, unidades, tipo) TO [inventory_ro];
GRANT SELECT ON dbo.reservas_bodega    (codigo_barras, ubicacion, cantidad, activa) TO [inventory_ro];
GO

-- Nada más: sin db_datareader, sin EXECUTE, sin permisos de escritura.
-- (Las tablas #temporales no necesitan permiso: cualquiera puede crearlas en tempdb.)

-- Comprobación rápida de que quedó:
SELECT dp.name AS usuario, o.name AS tabla, c.name AS columna, p.permission_name, p.state_desc
FROM sys.database_permissions p
JOIN sys.database_principals dp ON dp.principal_id = p.grantee_principal_id
LEFT JOIN sys.objects o ON o.object_id = p.major_id
LEFT JOIN sys.columns c ON c.object_id = p.major_id AND c.column_id = p.minor_id
WHERE dp.name = N'inventory_ro'
ORDER BY o.name, c.name;
GO
