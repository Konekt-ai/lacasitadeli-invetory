// Las consultas a `compucaja`. TODAS son SELECT y todas cumplen las reglas que
// costaron caro aprender en esta tienda:
//
//  1. WITH (NOLOCK) + OPTION (MAXDOP 1): la base es la MISMA del punto de venta.
//     Sin MAXDOP 1 una consulta pesada se lleva todos los núcleos y la caja se
//     arrastra.
//  2. Todo lo que usa tablas #temporales va en UN SOLO lote: el pool de conexiones
//     hace sp_reset_connection al devolver la conexión y las #temp se borran
//     (comprobado: "Invalid object name '#uv'" al partirlo en dos peticiones).
//  3. Las #temp llevan COLLATE DATABASE_DEFAULT: tempdb es SQL_Latin1 y la base es
//     Modern_Spanish ("Cannot resolve the collation conflict").
//  4. Nunca un OR sobre Art_GTIN/CodAlt_Codigo en VArticulosUnificados (la vista
//     tiene ~60 mil filas y el OR se va a ~20 s). Se hace por fases, cada una un
//     JOIN por igualdad (medido: 2 s cada fase).
//  5. Jamás columnas de dinero: ni precio, ni costo, ni importe, ni cajero, ni
//     cliente, ni proveedor. El login inventory_ro tampoco tiene permiso.
//
// Tiempos medidos contra la base real (2026-09-11, 4.5 años de historial):
//   historial completo de TicketsPS ... 2.9 s  (22.7 s si se pide MAX(Concepto))
//   stock de inventario_bodega ........ 0.03 s
//   catálogo por Art_Codigo ........... 2.0 s
//   catálogo por CodAlt / GTIN / PLU ... 2.0 s + 1.9 s + 0.2 s (resuelven 4 códigos)
//   ventas por área de 30 días ........ 0.16 s
//   ventas por área de 90 días ........ 0.53 s  (medido 2026-09-12; por eso va cada 30 min)
//   ventas con existencia en 0 ........ 0.2 s   (movimientos_bodega, ~93 mil filas)

/** Lote rápido (cada 5 min): lo que cambia a cada rato. */
export const LOTE_RAPIDO = `
SET NOCOUNT ON;

-- 0) Áreas activas del sistema de bodega (nombre y color de los chips)
SELECT nombre, color, activa, orden
FROM dbo.ubicaciones_bodega WITH (NOLOCK)
WHERE activa = 1
OPTION (MAXDOP 1);

-- 1) Qué caja vende en qué anaquel (17 y 21 -> Casita 1, 7 -> Casita 2)
SELECT est_codigo, area FROM dbo.estacion_area_map WITH (NOLOCK) OPTION (MAXDOP 1);

-- 2) Existencia física contada con la TC52 (incluye filas en 0: "contado y no hay",
--    que NO es lo mismo que no tener fila = "nunca se contó aquí")
SELECT codigo_barras AS codigo, ubicacion, cantidad, ultima_entrada, ultima_salida, creado, nombre
FROM dbo.inventario_bodega WITH (NOLOCK)
OPTION (MAXDOP 1);

-- 3) Piezas apartadas por pedidos de la página web (disponible = físico - apartado)
SELECT codigo_barras AS codigo, ubicacion, SUM(CAST(cantidad AS bigint)) AS apartado
FROM dbo.reservas_bodega WITH (NOLOCK)
WHERE activa = 1
GROUP BY codigo_barras, ubicacion
OPTION (MAXDOP 1);

-- 4) Códigos de caja que equivalen a N piezas de otro código
SELECT codigo, codigo_base, unidades
FROM dbo.codigos_producto WITH (NOLOCK)
WHERE codigo <> codigo_base OR unidades > 1
OPTION (MAXDOP 1);

-- 5) Ventas por ÁREA de los últimos 30 días. El área sale de la CAJA del ticket,
--    así que aquí sí hace falta el join por las 4 llaves (FolConsecutivo solo NO
--    es único: se recicla entre cajas y días).
SELECT m.area, ps.Codigo AS codigo,
       CAST(SUM(CASE WHEN t.T_Fecha >= DATEADD(day,-7,GETDATE())  THEN ps.Cantidad ELSE 0 END) AS decimal(18,3)) AS v7,
       CAST(SUM(CASE WHEN t.T_Fecha >= DATEADD(day,-@VENTANA,GETDATE()) THEN ps.Cantidad ELSE 0 END) AS decimal(18,3)) AS v14,
       CAST(SUM(ps.Cantidad) AS decimal(18,3)) AS v30,
       MAX(ps.FechaHora) AS ultima
FROM dbo.TicketsPS ps WITH (NOLOCK)
JOIN dbo.Tickets t WITH (NOLOCK)
  ON ps.FolTda_Codigo = t.FolTda_Codigo AND ps.FolEst_Codigo = t.FolEst_Codigo
 AND ps.FolDoc_Codigo = t.FolDoc_Codigo AND ps.FolConsecutivo = t.FolConsecutivo
JOIN dbo.estacion_area_map m WITH (NOLOCK) ON m.est_codigo = t.FolEst_Codigo
WHERE t.T_Fecha >= DATEADD(day,-@DIAS,GETDATE())
  AND ps.Codigo IS NOT NULL AND ps.Codigo <> ''
GROUP BY m.area, ps.Codigo
OPTION (MAXDOP 1);

-- 6) Reloj del servidor (GETDATE() ya es hora de Ciudad de México)
SELECT GETDATE() AS ahora;
`;

/**
 * Lote pesado.
 *
 *  · `completo: true` (al arrancar y cada 6 h) escanea TODO el historial de
 *    TicketsPS —4.5 años— y corre las 4 fases del catálogo. Es el caro: entre 9 y
 *    17 s según qué tan ocupada esté la caja.
 *  · `completo: false` (cada 30 min) escanea solo la ventana de duplicados (120
 *    días, ~1.5 s) y resuelve el catálogo por Art_Codigo (~2 s). Alcanza porque la
 *    última venta solo puede ir hacia adelante: lo de la ventana se mezcla encima
 *    de lo que ya está en memoria y las ventas viejas no cambian nunca.
 *
 * Devuelve: 0) historial por código  1) catálogo resuelto  2) tiempos por paso
 *          3) ventas por área de 90 días.
 * @param {{completo?: boolean, duplicadosDias?: number}} [opciones]
 */
export function loteHistorial({ completo = false, duplicadosDias = 120 } = {}) {
  const fases = completo ? FASES_EXTRA : '';
  const ventana = Number(duplicadosDias) || 120;
  const filtroVentana = completo ? '' : `AND ps.FechaHora >= DATEADD(day,-${ventana},GETDATE())`;
  return `
SET NOCOUNT ON;
DECLARE @t0 datetime2 = SYSDATETIME(), @t datetime2;
CREATE TABLE #ms (paso varchar(40), ms int);

-- Última venta de CADA código y piezas vendidas en la ventana de duplicados.
-- Sale de TicketsPS y NO necesita join con Tickets (es por código, no por área).
-- OJO: Articulos.Art_FechaUltimaVenta NO sirve, viene NULL en los 20,414
-- artículos comparados; por eso se calcula aquí aunque cueste 3.4 s.
-- OJO: NO se pide MAX(ps.Concepto) aquí. Medido en la base real: agregar esa
-- columna al escaneo completo lo lleva de 2.9 s a 22.7 s (ocho veces más carga
-- para el punto de venta) y no sirve de nada — de los 11,238 productos con piezas,
-- el Concepto del ticket no le pone nombre a ninguno: todos lo tienen en el
-- catálogo de NovaCaja o en el conteo de la TC52.
CREATE TABLE #uv (codigo nvarchar(64) COLLATE DATABASE_DEFAULT PRIMARY KEY,
                  ultima datetime, v120 decimal(18,3));
SET @t = SYSDATETIME();
INSERT INTO #uv (codigo, ultima, v120)
SELECT ps.Codigo, MAX(ps.FechaHora),
       SUM(CASE WHEN ps.FechaHora >= DATEADD(day,-${Number(duplicadosDias) || 120},GETDATE()) THEN ps.Cantidad ELSE 0 END)
FROM dbo.TicketsPS ps WITH (NOLOCK)
WHERE ps.Codigo IS NOT NULL AND ps.Codigo <> '' ${filtroVentana}
GROUP BY ps.Codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('historial', DATEDIFF(ms,@t,SYSDATETIME()));

-- Códigos que hay que resolver contra el catálogo: los que tienen piezas y los que
-- se vendieron en la ventana.
CREATE TABLE #cod (codigo nvarchar(64) COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO #cod (codigo)
SELECT codigo_barras FROM dbo.inventario_bodega WITH (NOLOCK) GROUP BY codigo_barras
UNION
SELECT codigo FROM #uv WHERE v120 > 0
OPTION (MAXDOP 1);

CREATE TABLE #res (codigo nvarchar(64) COLLATE DATABASE_DEFAULT PRIMARY KEY,
                   art_codigo nvarchar(64) COLLATE DATABASE_DEFAULT, via varchar(10),
                   descripcion nvarchar(200) COLLATE DATABASE_DEFAULT,
                   categoria nvarchar(200) COLLATE DATABASE_DEFAULT,
                   marca nvarchar(200) COLLATE DATABASE_DEFAULT);

-- Fase 1: por Art_Codigo (el código que se escanea). Resuelve 14,966 de 16,980.
-- La vista repite una fila por cada código alterno, por eso el GROUP BY.
SET @t = SYSDATETIME();
INSERT INTO #res (codigo, art_codigo, via, descripcion, categoria, marca)
SELECT c.codigo, MIN(v.Art_Codigo), 'base', MIN(v.Art_Descripcion), MIN(v.Org_Descripcion), MIN(v.Mar_Nombre)
FROM #cod c
JOIN dbo.VArticulosUnificados v WITH (NOLOCK) ON v.Art_Codigo = c.codigo
GROUP BY c.codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('catalogo-base', DATEDIFF(ms,@t,SYSDATETIME()));
${fases}
-- "Más vendidos" de 90 días, por área (caja del ticket -> área, join de 4 llaves).
-- Cuesta 0.53 s contra 0.16 s la de 30 días: por eso vive aquí (cada 30 min) y no
-- en el lote rápido (cada 5 min). Para un acumulado de 90 días, media hora de
-- retraso no cambia nada.
CREATE TABLE #v90 (area nvarchar(50) COLLATE DATABASE_DEFAULT,
                   codigo nvarchar(64) COLLATE DATABASE_DEFAULT, v90 decimal(18,3));
SET @t = SYSDATETIME();
INSERT INTO #v90 (area, codigo, v90)
SELECT m.area, ps.Codigo, SUM(ps.Cantidad)
FROM dbo.TicketsPS ps WITH (NOLOCK)
JOIN dbo.Tickets t WITH (NOLOCK)
  ON ps.FolTda_Codigo = t.FolTda_Codigo AND ps.FolEst_Codigo = t.FolEst_Codigo
 AND ps.FolDoc_Codigo = t.FolDoc_Codigo AND ps.FolConsecutivo = t.FolConsecutivo
JOIN dbo.estacion_area_map m WITH (NOLOCK) ON m.est_codigo = t.FolEst_Codigo
WHERE t.T_Fecha >= DATEADD(day,-90,GETDATE())
  AND ps.Codigo IS NOT NULL AND ps.Codigo <> ''
GROUP BY m.area, ps.Codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('ventas-90-dias', DATEDIFF(ms,@t,SYSDATETIME()));
INSERT INTO #ms VALUES ('TOTAL', DATEDIFF(ms,@t0,SYSDATETIME()));

-- 0) historial completo por código
SELECT codigo, ultima, v120 FROM #uv;
-- 1) catálogo resuelto
SELECT codigo, art_codigo, via, descripcion, categoria, marca FROM #res;
-- 2) tiempos
SELECT paso, ms FROM #ms;
-- 3) ventas por área de 90 días
SELECT area, codigo, v90 FROM #v90;
`;
}

// Fases 2 a 4: solo para los que no casaron por Art_Codigo. Cuestan ~4 s y en la
// base real resuelven apenas 4 códigos más, por eso NO van en cada refresco.
const FASES_EXTRA = `
SET @t = SYSDATETIME();
INSERT INTO #res (codigo, art_codigo, via, descripcion, categoria, marca)
SELECT c.codigo, MIN(v.Art_Codigo), 'alterno', MIN(v.Art_Descripcion), MIN(v.Org_Descripcion), MIN(v.Mar_Nombre)
FROM #cod c
JOIN dbo.VArticulosUnificados v WITH (NOLOCK) ON v.CodAlt_Codigo = c.codigo
WHERE NOT EXISTS (SELECT 1 FROM #res r WHERE r.codigo = c.codigo)
GROUP BY c.codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('catalogo-alterno', DATEDIFF(ms,@t,SYSDATETIME()));

SET @t = SYSDATETIME();
INSERT INTO #res (codigo, art_codigo, via, descripcion, categoria, marca)
SELECT c.codigo, MIN(v.Art_Codigo), 'gtin', MIN(v.Art_Descripcion), MIN(v.Org_Descripcion), MIN(v.Mar_Nombre)
FROM #cod c
JOIN dbo.VArticulosUnificados v WITH (NOLOCK) ON v.Art_GTIN = c.codigo
WHERE NOT EXISTS (SELECT 1 FROM #res r WHERE r.codigo = c.codigo)
GROUP BY c.codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('catalogo-gtin', DATEDIFF(ms,@t,SYSDATETIME()));

SET @t = SYSDATETIME();
INSERT INTO #res (codigo, art_codigo, via, descripcion, categoria, marca)
SELECT c.codigo, MIN(v.Art_Codigo), 'plu', MIN(v.Art_Descripcion), MIN(v.Org_Descripcion), MIN(v.Mar_Nombre)
FROM #cod c
JOIN dbo.VArticulosUnificados v WITH (NOLOCK) ON v.Art_PLU = c.codigo AND v.Art_PLU <> ''
WHERE NOT EXISTS (SELECT 1 FROM #res r WHERE r.codigo = c.codigo)
GROUP BY c.codigo
OPTION (MAXDOP 1);
INSERT INTO #ms VALUES ('catalogo-plu', DATEDIFF(ms,@t,SYSDATETIME()));
`;

/**
 * Busca en el catálogo unos pocos códigos sueltos (los que aparecieron entre dos
 * refrescos pesados). Con pocos códigos conviene OUTER APPLY TOP 1: son búsquedas
 * por índice, no un escaneo de la vista.
 * @param {string[]} codigos
 * @returns {{sql: string, parametros: Record<string,string>}}
 */
export function consultaCatalogoSuelto(codigos) {
  const lista = codigos.slice(0, 400);
  const parametros = {};
  const valores = lista.map((codigo, i) => {
    parametros[`c${i}`] = codigo;
    return `(@c${i})`;
  });
  const sql = `
SET NOCOUNT ON;
SELECT c.codigo, v.Art_Codigo AS art_codigo, 'base' AS via,
       v.Art_Descripcion AS descripcion, v.Org_Descripcion AS categoria, v.Mar_Nombre AS marca
FROM (VALUES ${valores.join(',')}) AS c(codigo)
OUTER APPLY (
  SELECT TOP 1 a.Art_Codigo, a.Art_Descripcion, a.Org_Descripcion, a.Mar_Nombre
  FROM dbo.VArticulosUnificados a WITH (NOLOCK)
  WHERE a.Art_Codigo = c.codigo
) v
OPTION (MAXDOP 1);
`;
  return { sql, parametros };
}

/**
 * Inventario DESFASADO: ventas que el sistema de bodega descontó cuando esa área
 * ya estaba en 0.
 *
 * Cómo nace (medido 2026-09-12): el sistema de bodega descuenta cada venta del área
 * de su caja (ventas-sync del admin, cada 90 s) y nunca baja de 0. Si el anaquel se
 * surte sin registrarlo en la TC52, el sistema llega a 0 y se queda ahí mientras el
 * producto se sigue vendiendo. GHIRARDELLI CARAMEL SQUARE entró 50 el 21-jul, nadie
 * volvió a registrar entradas y desde el 2-ago se vendieron 252 "en cero": la app
 * decía "quedan 0" y "pedir al proveedor" con el anaquel lleno.
 *
 * Cada venta deja en movimientos_bodega su `stock_antes`; lo vendido por encima de
 * ese número se vendió sin existencia. Solo cuenta lo que pasó DESPUÉS del último
 * arreglo en esa área (entrada, ajuste o traslado registrado, o la ultima_entrada de
 * inventario_bodega, que también mueve la recepción de mercancía): si ya lo
 * contaron, deja de estar desfasado.
 *
 * No hay índice por fecha (solo el id): son dos escaneos de ~93 mil filas, 0.2 s.
 * Va aparte del lote rápido para que, si faltara el permiso, no tumbe lo demás.
 * @param {{dias?: number}} [opciones]
 */
export function consultaDesfases({ dias = 90 } = {}) {
  const d = Math.max(1, Number(dias) || 90);
  return `
SET NOCOUNT ON;
SELECT v.codigo_barras AS codigo, v.ubicacion AS area,
       SUM(v.cantidad - CASE WHEN v.stock_antes > 0 THEN v.stock_antes ELSE 0 END) AS piezas,
       MIN(v.fecha) AS desde, MAX(v.fecha) AS ultima
FROM dbo.movimientos_bodega v WITH (NOLOCK)
LEFT JOIN (
  SELECT codigo_barras, ubicacion, MAX(fecha) AS fecha
  FROM dbo.movimientos_bodega WITH (NOLOCK)
  WHERE tipo IN ('entrada', 'ajuste', 'traslado') AND fecha >= DATEADD(day,-${d},GETDATE())
  GROUP BY codigo_barras, ubicacion
) arreglo ON arreglo.codigo_barras = v.codigo_barras AND arreglo.ubicacion = v.ubicacion
LEFT JOIN dbo.inventario_bodega ib WITH (NOLOCK)
  ON ib.codigo_barras = v.codigo_barras AND ib.ubicacion = v.ubicacion
WHERE v.motivo = 'venta'
  AND v.fecha >= DATEADD(day,-${d},GETDATE())
  AND v.cantidad > ISNULL(v.stock_antes, 0)
  AND (arreglo.fecha IS NULL OR v.fecha > arreglo.fecha)
  AND (ib.ultima_entrada IS NULL OR v.fecha > ib.ultima_entrada)
GROUP BY v.codigo_barras, v.ubicacion
OPTION (MAXDOP 1);
`;
}

/** Reemplaza los marcadores @VENTANA del lote rápido (no son parámetros de SQL). */
export function loteRapido({ ventanaVentaDiariaDias = 14 } = {}) {
  const ventana = Number(ventanaVentaDiariaDias) || 14;
  // La ventana de "cuánto vende al día" es configurable; el WHERE tiene que
  // abarcarla, si no, con VENTANA_VENTA_DIARIA_DIAS=45 se estaría dividiendo entre
  // 45 días lo vendido en 30 y todo parecería vender menos de lo que vende.
  const dias = Math.max(30, ventana);
  return LOTE_RAPIDO.replace('@VENTANA', String(ventana)).replace('@DIAS', String(dias));
}
