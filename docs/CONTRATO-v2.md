# Contrato de la versión 2 — `lacasitadeli-invetory`

Este documento es la referencia común para todo lo que se construye en la versión 2
(spec del jefe del 2026-09-14). Si algo de aquí choca con el código viejo, **manda
este documento**. Si algo de aquí choca con la realidad de la base, mídelo y anota la
diferencia aquí mismo.

Lo que NO cambia respecto a la versión 1 (y no se toca):

- Un solo proceso Node 20 (`bin\invetory-node.exe server.js` en la caja), Express +
  React/Vite/Tailwind, `dist/` commiteado, escucha SOLO en `127.0.0.1:3010`, túnel
  de Cloudflare aparte, login con cookie firmada, `inventory_ro` de solo lectura.
- Reglas de la base (`src/datos/consultas.js` encabezado): NOLOCK, MAXDOP 1, todo en
  fila, lotes con `#temporales` en UN `query()`, `COLLATE DATABASE_DEFAULT`, nunca
  `OR` sobre `Art_GTIN`/`CodAlt_Codigo`, nunca columnas de dinero, nunca `MAX(Concepto)`.
- Motor en memoria (`src/servicios/inventario.js`): lote rápido cada 5 min, lote de
  historial cada 30 min, completo cada 6 h; se duerme si nadie entra en 1 h.
- Privacidad: ni una llave ni un texto de dinero en ninguna respuesta. La prueba
  `pruebas/api.test.js` lo revisa con `LLAVES_PROHIBIDAS` y `DINERO_EN_TEXTO`.
- Fechas: `src/calculos/fechas.js` (naive CDMX, `naiveAIso`, `diasEntre`).

---

## 1. Qué cambia (resumen)

| Tema | Versión 1 | Versión 2 |
|---|---|---|
| Módulos | Sin venta · Resurtir · Más vendidos · Buscar | **Inventario · Resurtir · Movimiento · Alertas** (+ buscador global y ficha) |
| "Descontinuado" | = 90+ días sin venta | **SOLO** `product_overrides.descontinuado = 1` (lo marca el dueño en el Admin). Lo demás es "Sin movimiento N+ días" |
| Clasificación | una `clase` por producto | `clase` (compatibilidad) **+ `condiciones[]`** (varios badges a la vez) + `prioridad` |
| Inventario | solo productos con piezas, por clase | **inventario completo**: todo lo contado (con o sin piezas) y lo vendido en 120 días; el buscador además cae al **catálogo completo de NovaCaja** |
| Categoría | `Org_Descripcion` de NovaCaja limpia | `product_overrides.categoria` → (Shopify `product_type`, opcional) → NovaCaja salvo ABARROTES → "Sin categoría"; con `categoriaFuente` |
| Ventas | 7/14/30 (rápido) y 90 (30 min) | 7/14/30 (rápido) y **60/90/180** (30 min) + **ventas por día** de 90 días (30 min) |
| Escrituras | ninguna | `POST /api/solicitudes` (proxy al admin, crea solicitud de resurtido) y `POST /api/alertas/:id/descartar` (SQLite propio) |
| Diseño | celular, `max-w-screen-sm` | celular + **desktop 3 tarjetas por fila**, letra más grande, nav abajo en celular y arriba en desktop |

---

## 2. Snapshot en memoria (salida de `armarSnapshot`)

`src/calculos/armar.js` sigue siendo una función pura. Entra lo de la versión 1 más:

- `datos.overrides`: `Map<codigo, {foto, categoria, descontinuado, descontinuadoDesde}>`
  (de `src/db/overrides.js`; llave = `art_codigo` tal cual; se busca por `artCodigo` y por `codigo`).
- `datos.ventasArea90` ahora se llama `datos.ventasAreaLargo`: `[{area, codigo, v60, v90, v180}]`.
  (Acepta también el nombre viejo `ventasArea90` con `v90` para no romper pruebas.)
- `datos.ventasDia`: `[{area, dia: Date|string 'YYYY-MM-DD', codigo, piezas}]` de los últimos 90 días.
- `datos.tiposShopify` (opcional): `Map<codigo o artCodigo, {tipo, titulo}>`; si no viene, se ignora.
- `opciones`: se agregan `sobrestockDias=120`, `sobrestockMin=24`, `topMasVendidos=50`,
  `tramosSinMovimiento=[30,60,90,180]`, `sinMovimientoAlertaDias=180`, `entradasSinVentaDias=30`,
  `refrigerado: {categorias: [...], palabras: [...], areasSospechosas: [...]}`.

Cada producto `p` del snapshot tiene, además de lo de la versión 1:

```js
p.descontinuado        // boolean — SOLO de overrides
p.descontinuadoDesde   // Date|null
p.categoriaPropia      // string|null  (product_overrides.categoria)
p.categoriaCaja        // string|null  (Org_Descripcion limpia, tal cual)
p.categoria            // string       (final: propia → shopify → caja salvo ABARROTES → 'Sin categoría')
p.subcategoria         // string|null  (solo de Shopify "Grupo - Subgrupo")
p.categoriaFuente      // 'admin' | 'shopify' | 'caja' | 'ninguna'
p.vendidas             // {d7, d14, d30, d60, d90, d120, d180}
p.porArea.get(area)    // {..., v7, v14, v30, v60, v90, v180, cobertura, ventaDiaria, disponible}
p.ventaDiaria          // total: d14 / 14
p.coberturaDias        // mínima entre las áreas de venta donde se vende (null si no se vende)
p.rotacion             // d30 / max(piezas, 1)
p.tendencia            // {d7, d30, d90}: % vs periodo anterior (null si el anterior fue 0)
p.diasSinMovimiento    // días desde la última venta; si nunca vendió, desde la primera vez contado (creado); null si no hay nada
p.tramoSinMovimiento   // 0 | 30 | 60 | 90 | 180  (el mayor que cumpla con diasSinMovimiento)
p.condiciones          // string[] con los ids de la sección 3
p.prioridad            // 'alta' | 'media' | 'baja'
p.clase                // compatibilidad: 'sin_alta' | 'duplicado_probable' | 'nuevo' | 'sin_movimiento' | 'lento' | 'activo'
                       //   (antes existía 'descontinuado' como clase: YA NO. Descontinuado es p.descontinuado)
p.alertas              // string[] tipos de alerta de la sección 6 que cumple
```

Y el snapshot además de `productos`, `porCodigo`, `resurtido`, `areas`, `areasVenta`,
`areasRespaldo`, `resumen` trae:

```js
snap.catalogoCompleto  // Map<artCodigo, {codigo, nombre, categoria, marca}> de TODA VArticulosUnificados (solo para el buscador)
snap.categorias        // [{nombre, productos, piezas}] ordenado por productos
snap.resumenDia        // {urgentes, piezasAMover, sinStock, bajoStock, sobrestock, sinMovimiento90, descontinuados, alertas, conPiezas, piezas}
snap.coberturaSucursal // [{area, medianaDias, productosQueVenden, urgentes}] para las áreas de venta
snap.movimiento        // lo precalculado para el módulo Movimiento (sección 5)
snap.alertas           // [{id, tipo, grupo, prioridad, codigo, ...}] (sección 6)
```

`snap.productos` incluye TODO lo contado con la TC52 (aunque tenga 0 piezas) y lo
vendido en 120 días. Lo que solo existe en el catálogo de NovaCaja vive en
`catalogoCompleto` y solo lo enseña el buscador (como "en catálogo de caja, sin
existencia contada").

---

## 3. Condiciones (badges) y prioridad — `src/calculos/condiciones.js`

Función pura `calcularCondiciones(p, opciones)` → `{condiciones, prioridad, tramoSinMovimiento, ...}`.
Un producto puede tener varias. Ids, reglas y textos:

| id | Regla (defaults por variable de entorno) | Texto del badge | Color |
|---|---|---|---|
| `sin_stock` | se vende en un área de venta (`ventaDiaria[area] > 0`), está contado ahí y `disponible ≤ 0` | Sin stock | rojo `bg-error text-on-error` |
| `bajo_stock` | se vende, contado, `0 < cobertura < COBERTURA_BAJA_DIAS=7` | Bajo stock | ámbar `bg-secondary-fixed text-on-secondary-fixed` |
| `sobrestock` | `piezas ≥ SOBRESTOCK_MIN=24` y (`coberturaDias > SOBRESTOCK_DIAS=120` o no se vende en 30 días) | Sobrestock | morado `bg-[#ede9fe] text-[#4c1d95]` |
| `mas_vendidos` | top `TOP_MAS_VENDIDOS=50` por `vendidas.d30`, sin cocina | Más vendido | verde `bg-primary-fixed text-on-primary-fixed` |
| `lento` | `30 ≤ diasSinMovimiento < 90` y sí ha vendido alguna vez | Lento | gris `bg-surface-variant text-on-surface-variant` |
| `sin_movimiento_30/60/90/180` | `diasSinMovimiento ≥ N`; solo se pone el **tramo mayor** | Sin movimiento 90+ días | gris |
| `nuevo_sin_venta` | nunca vendido y `primeraVez` hace `< NUEVO_DIAS=30` (con eso NO lleva sin_movimiento) | Nuevo, sin venta | azul `bg-[#dbeafe] text-[#1e3a8a]` |
| `descontinuado` | **solo** `overrides.descontinuado = 1` | Descontinuado | **negro** `bg-[#1c1c19] text-white` |
| `duplicado_probable` | regla de `duplicados.js` (Kinder Joy `098733`→`00987339`) | Posible código duplicado | naranja `bg-[#ffedd5] text-[#9a3412]` |
| `sin_alta` | no existe en `VArticulosUnificados` | Sin alta en caja | rojo contorno `border border-error text-error` |
| `desfasado` | (se conserva de la v1) contado en 0 en un área y se sigue vendiendo | Desfasado: cuéntalo | rojo contorno |

`ETIQUETAS_CONDICION` exporta id → texto. `COLORES_CONDICION` vive en el frontend.

**Prioridad**: `alta` si `sin_stock` o alguna área de venta con `cobertura < COBERTURA_URGENTE_DIAS=2`
o `desfasado`; `media` si `bajo_stock`; `baja` el resto.

**Números**: `rotacion = d30 / max(piezas,1)` (2 decimales); `tendencia.dN = (dN − anteriorN) / anteriorN × 100`
con `anterior7 = d14 − d7`, `anterior30 = d60 − d30`, `anterior90 = d180 − d90`; `null` si el
anterior es 0. `ventaDiaria = d14 / 14`. `coberturaDias` por área = `disponible / ventaDiaria[area]`.

`clasificar()` (v1) se conserva para `clase` pero devuelve `'sin_movimiento'` donde antes
decía `'descontinuado'`. Las pruebas viejas que esperaban `'descontinuado'` se actualizan.

---

## 4. API — rutas y respuestas

Todas con sesión (401 si no), `Cache-Control: no-store`, sin dinero. Las de datos son GET.
**Escrituras permitidas (y ninguna más):** `POST /api/login`, `POST /api/logout`,
`POST /api/solicitudes`, `POST /api/alertas/:id/descartar`. La prueba de rutas lo verifica.

Rutas de la v1 que **desaparecen**: `/api/sin-venta`, `/api/mas-vendidos`, `/api/resurtido`.

### `GET /api/estado`
```jsonc
{
  "listo": true, "calculando": false, "usuario": "dueno",
  "generado": "2026-09-15T14:30:00-06:00", "actualizado": "14:30",
  "areas": [{"nombre":"Bodega","color":"#1D9E75"}], "areasVenta": ["Casita 1","Casita 2"], "areasRespaldo": ["Bodega"],
  "resumen": {"conPiezas": 11620, "piezas": 123456, "piezasParadas": 4567},
  "resumenDia": {"urgentes": 0, "piezasAMover": 0, "sinStock": 0, "bajoStock": 0, "sobrestock": 0, "sinMovimiento90": 0, "descontinuados": 0, "alertas": 0},
  "coberturaSucursal": [{"area":"Casita 1","medianaDias": 5.4,"productosQueVenden": 1200,"urgentes": 80}],
  "categorias": [{"nombre":"Chocolates","productos": 300}],
  "capacidades": {"solicitudes": true, "fotos": true, "overrides": true, "shopify": false},
  "umbrales": {"lentoDias":30,"nuevoDias":30,"coberturaUrgenteDias":2,"coberturaBajaDias":7,"diasSugeridos":7,"ventanaVentaDiariaDias":14,"sobrestockDias":120,"sobrestockMin":24,"topMasVendidos":50}
}
```
`capacidades.solicitudes` = el admin contestó `GET {ADMIN_API}/api/resurtido/ubicaciones` (se revisa al
arrancar y cada 5 min). Si es `false`, el frontend esconde el botón "Solicitar resurtido".

### `GET /api/inventario`
Query: `area`, `condiciones` (ids separados por coma; se cumplen TODAS), `prioridad` (alta|media|baja),
`categoria`, `orden` (`piezas`|`dias`|`cobertura`|`nombre`|`rotacion`|`venta`), `q` (texto),
`pagina` (1…), `porPagina` (60, tope 200), `soloConPiezas` (`1` por defecto; `0` = incluye contados en 0
y vendidos sin conteo), `cocina` (`0` por defecto = esconde cocina).

```jsonc
{
  "filtros": {...},
  "cuantos": 1234, "piezas": 45678, "pagina": 1, "porPagina": 60, "hayMas": true,
  "productos": [ /* ProductoJson */ ]
}
```

### `ProductoJson` (tarjeta y ficha)
```jsonc
{
  "codigo": "098733", "artCodigo": "098733", "nombre": "KINDER JOY STRANGER THINGS",
  "categoria": "Chocolates", "subcategoria": null, "categoriaFuente": "caja", "marca": null,
  "foto": "https://cdn.shopify.com/...", "alta": true, "esCocina": false,
  "descontinuado": false, "descontinuadoDesde": null,
  "piezas": 507, "apartadas": 0,
  "areas": [{"area":"Casita 2","piezas":506,"apartadas":0,"ultimaEntrada":"…-06:00","entradaTexto":"29 jul","vendidas14": 0,"cobertura": null,"desfase": 0}],
  "clase": "duplicado_probable", "etiqueta": "Posible código duplicado",
  "condiciones": ["duplicado_probable","sin_movimiento_60"], "prioridad": "baja",
  "ventaDiaria": 0, "coberturaDias": null, "rotacion": 0,
  "tendencia": {"d7": null, "d30": null, "d90": null},
  "ultimaVenta": null, "diasSinVenta": null, "diasSinMovimiento": 77, "tramoSinMovimiento": 60,
  "ventaTexto": "Nunca se ha vendido", "ultimaEntrada": "…-06:00", "entradaTexto": "Última entrada: 29 jul",
  "vendidas": {"d7":0,"d30":0,"d90":0,"d120":0},
  "desfase": null,
  "duplicado": {"codigo":"00987339","nombre":"KINDER JOY","piezas":587,"texto":"Se vende como 00987339 KINDER JOY"},
  "enCatalogoSolo": false
}
```
En la **ficha** (`/api/producto/:codigo`) se agregan: `vendidas.d14`, `vendidas.d60`, `vendidas.d180`,
`primeraVez`, `areasTodas` (como v1), `resurtido` (como v1, por área de venta),
`movimientos` (últimos 20 de `movimientos_bodega`, on demand con caché de 60 s:
`[{fecha, fechaTexto, tipo, motivo, cantidad, area, areaOrigen, stockAntes, stockDespues, texto}]`, sin `notas`),
y `solicitudes` (del admin, `GET /api/resurtido?codigo=…&limit=10`, best effort: `[]` si el admin no contesta).

### `GET /api/buscar?q=`
Busca en `snap.productos` (como v1) y, si hay menos de 40 resultados, en `snap.catalogoCompleto`
(por código exacto/contiene y por nombre). Los del catálogo salen como `ProductoJson` mínimo con
`enCatalogoSolo: true`, `piezas: 0`, `areas: []`, `condiciones: []`, `alta: true`.
Respuesta: `{q, cuantos, productos, deCatalogo: n}`.

### `GET /api/resurtir`
Query: `horizonte` (`hoy` = cobertura < urgente | `3` | `7` días; default `7`), `condicion`
(`sin_stock`|`bajo_stock`|vacío), `area`, `categoria`, `prioridad` (`alta`|vacío), `cocina` (0/1),
`sinConteo` (0/1, incluye "se vende pero no está contado"), `q`, `tope` (150, máx 500).
```jsonc
{
  "filtros": {...}, "areasVenta": [...],
  "tarjetas": {"urgentes": 12, "piezasAMover": 340, "transferencias": 25, "sinRespaldo": 4, "sucursalMasUrgente": "Casita 1", "desfasados": 3, "sinConteo": 800},
  "cuantos": 60,
  "filas": [{
    "codigo": "…", "nombre": "…", "foto": null, "categoria": "…", "area": "Casita 1",
    "estado": "urgente|desfasado|bajo|ok|sin_conteo", "prioridad": "alta",
    "piezasArea": 3, "apartadas": 0, "vendeAlDia": 5.0, "vendidas14": 70, "coberturaDias": 0.6,
    "enBodega": 40, "sugerido": 32, "accion": "Mover 32 de Bodega (hay 40)", "accionNota": null,
    "accionTipo": "surtir|surtir_parcial|pedir|revisar_respaldo|contar|ninguna",
    "esCocina": false, "descontinuado": false,
    "solicitud": {"id": 12, "estado": "pendiente", "cantidad": 30, "creado": "…-06:00"} // o null
  }],
  "historial": {"pendientes": 3, "hechas": 10, "canceladas": 1}  // conteo del admin; null si no contesta
}
```
Textos de acción (sección 5 del prompt): "Mover N de Bodega (hay 40)", "Sin respaldo en bodega:
hay que comprarlo", "No está contado en Casita 2: cuéntalo con la TC52", "Cuéntalo con la TC52: el
sistema dice 0 y se sigue vendiendo". **Nunca** "Pedir al proveedor" (el proveedor es información
administrativa) ni "Marcar surtido".

### Solicitudes (proxy al admin) — `src/web/solicitudes.js`
Solo estas rutas, con sesión, contra `ADMIN_API` (`.env`, default `http://127.0.0.1:3002`), timeout 10 s.
Si el admin no contesta: `503 {"error": "El sistema admin no responde. Inténtalo en un momento."}`.
El código de estado y el cuerpo del admin se pasan tal cual (200, 400, 404, 409).

| Local | Admin |
|---|---|
| `GET /api/solicitudes?estado=&codigo=&limit=` | `GET /api/resurtido?…` → `{solicitudes, conteo}` |
| `GET /api/solicitudes/pendientes` | `GET /api/resurtido/pendientes` |
| `GET /api/solicitudes/ubicaciones` | `GET /api/resurtido/ubicaciones` → `{todas, venta, respaldo}` |
| `GET /api/solicitudes/sugerencia/:codigo?destino=&origen=` | `GET /api/resurtido/sugerencia/:codigo?…` |
| `GET /api/solicitudes/:id` | `GET /api/resurtido/:id` (con `eventos`) |
| `POST /api/solicitudes` `{codigo_barras, a_ubicacion, de_ubicacion?, cantidad, nota?}` | `POST /api/resurtido` con `usuario: req.usuario`, `origen: "invetory"`, `de_ubicacion` default "Bodega" |

Validación local antes de mandar: `codigo_barras` texto 1–60, `cantidad` entero 1–9999,
`a_ubicacion` en `snap.areas`, `nota` ≤ 200 caracteres. No se proxea nada más del admin.
Antes de mandar al admin, si `snap.porCodigo.get(codigo)?.descontinuado` es true → `400 {"error":"Ese producto está descontinuado"}`.
Las respuestas del admin pasan por el mismo filtro de privacidad (no traen dinero; la prueba lo confirma).

### `GET /api/movimiento?dias=7|30|90&area=&cocina=0|1`
Todo en piezas. `anterior` = mismo número de días justo antes.
```jsonc
{
  "filtros": {"dias": 30, "area": "", "incluirCocina": false},
  "kpis": {
    "d7":  {"piezas": 1200, "anterior": 1100, "cambio": 9.1},
    "d30": {"piezas": 5000, "anterior": 5400, "cambio": -7.4},
    "d90": {"piezas": 15000, "anterior": null, "cambio": null}
  },
  "top": [{"codigo","nombre","foto","categoria","piezas","piezasEnTienda","tendencia"}],           // 10
  "categorias": [{"nombre": "Chocolates", "piezas": 800, "porcentaje": 16}],                       // hasta 12
  "sucursales": [{"area": "Casita 1", "piezas": 3500, "porcentaje": 70}],
  "aceleran": [{"codigo","nombre","piezas","anterior","cambio"}],                                   // 5, mínimo 10 piezas en el periodo
  "bajan":    [{"codigo","nombre","piezas","anterior","cambio"}],
  "calor": {
    "dias": ["lun","mar","mié","jue","vie","sáb","dom"],
    "categoriaDia": [{"nombre": "Chocolates", "valores": [10,20,30,40,50,80,70]}],                  // hasta 10 categorías
    "sucursalDia":  [{"nombre": "Casita 1",   "valores": [..7]}],
    "fechas": [{"fecha": "2026-09-01", "dia": "mar", "piezas": 120}],                               // cada día del periodo
    "nota": "Sábado y domingo concentran el mayor movimiento"
  },
  "ranking": [{"codigo","nombre","categoria","piezas","pzasDia","rotacion","diasSinMovimiento","piezasEnTienda"}]   // 100
}
```
`kpis.d90.anterior` requiere 180 días: viene de `v180`. Las series por día salen de `ventasDia`
(90 días); para `dias=7|30` se recortan. Las categorías usan `p.categoria` final.

### `GET /api/alertas?filtro=todas|urgentes|codigos|caja|catalogo|inventario&descartadas=0|1`
```jsonc
{
  "conteo": {"todas": 900, "urgentes": 30, "codigos": 400, "caja": 2010, "catalogo": 50, "inventario": 120, "descartadas": 12},
  "alertas": [{
    "id": "duplicado:098733", "tipo": "duplicado", "grupo": "codigos", "prioridad": "alta|media|baja",
    "codigo": "098733", "nombre": "…", "foto": null, "piezas": 507,
    "titulo": "Posible código duplicado", "texto": "Se vende como 00987339 KINDER JOY. Revisa si son el mismo producto y corrige el código en la TC52.",
    "descartada": null   // o {"usuario": "dueno", "cuando": "…-06:00"}
  }]
}
```
`POST /api/alertas/:id/descartar` `{"deshacer": false}` → `{ok: true, descartada: {...}|null}`.
Se guarda en `data/invetory.db` (SQLite propio, tabla `alertas_descartadas(id PRIMARY KEY, tipo, codigo, usuario, cuando)`).
Las descartadas no salen en `alertas` salvo `descartadas=1`.

---

## 5. Movimiento — `src/calculos/movimiento.js`

Funciones puras sobre el snapshot: `calcularMovimiento(snap, {dias, area, incluirCocina})` con
la forma de arriba. Los KPIs por área usan `porArea[].v7/v14/v30/v60/v90/v180`. Las series por
día usan `snap.ventasDiaIndice` (armado en `armarSnapshot` desde `datos.ventasDia`: `Map<codigo,
Map<area, Map<'YYYY-MM-DD', piezas>>>`). El día de la semana se calcula en CDMX con las partes
UTC del naive (`fechas.js`). La nota del mapa de calor: el día (o los dos días) con más piezas:
*"Sábado y domingo concentran el mayor movimiento"* / *"El viernes concentra el mayor movimiento"*.

---

## 6. Alertas — `src/calculos/alertas.js`

`calcularAlertas(snap, opciones)` → lista. Tipos, grupo, prioridad y texto (sin dinero):

| tipo | grupo | prioridad | regla | texto |
|---|---|---|---|---|
| `duplicado` | codigos | alta | `duplicado_probable` | "Se vende como `X` NOMBRE. Revisa si son el mismo producto y corrige el código en la TC52." |
| `sin_alta` | caja | alta si piezas ≥ 10, si no media | `sin_alta` | "Hay N piezas contadas, pero la caja no conoce este código: no se puede cobrar bien. Dalo de alta en NovaCaja (Admin → Inventario → Dar de alta)." |
| `sin_categoria` | catalogo | baja | `categoria === 'Sin categoría'` y piezas > 0 | "Sin categoría no entra en los análisis por categoría. Asígnale una en el Admin." |
| `ubicacion_incorrecta` | inventario | media | categoría de caja ∈ `REFRIGERADO_CATEGORIAS` (default `QUESOS Y LACTEOS,CARNES,LACTEOS,CONGELADOS`) o nombre/tipo contiene `REFRIGERAD|FROZEN|CONGELAD`, con piezas en `REFRIGERADO_AREAS_SOSPECHOSAS` (default `Bodega,Casita 1,Casita 2`) | "Parece producto refrigerado y está contado en Casita 1. Verifica dónde está físicamente." |
| `entradas_sin_ventas` | inventario | media | última entrada hace ≥ 30 d, piezas > 0 y sin ventas desde esa entrada | "Llegó el 29 ago y no se ha vendido ni una pieza. ¿Está exhibido? ¿Se vende con otro código?" |
| `sobrestock_critico` | inventario | media | `sobrestock` y `coberturaDias > 180` | "Con lo que se vende, este stock alcanza para más de 6 meses. Conviene no comprar más." |
| `estancado` | inventario | baja | `tramoSinMovimiento ≥ 180`, piezas > 0 y **no** descontinuado | "Sin movimiento en 180+ días. Decidan si se descontinúa (se marca en el Admin) o se promociona." |
| `desfasado` | inventario | alta | `desfasado` (v1) | "En Casita 1 el sistema dice 0, pero se han vendido N piezas desde el 2 sep. Hay que contarlo con la TC52." |
| `nombre_inconsistente` | catalogo | baja | solo si hay título de Shopify y parecido < 0.3 | "En caja dice X y en la página dice Y. Revisa que sea el mismo producto." |

`urgentes` = prioridad alta. Un producto puede tener varias alertas (una por tipo).

---

## 7. Consultas nuevas — `src/datos/consultas.js`

- **Lote de 30 min** (`loteHistorial`): `#v90` pasa a `#vlargo (area, codigo, v60, v90, v180)` con
  `WHERE T_Fecha >= DATEADD(day,-180,GETDATE())` y `CASE` por ventana; y `#dias (area, dia date,
  codigo, piezas)` de 90 días. Devuelve recordsets: 0 historial · 1 catálogo · 2 tiempos ·
  3 ventas largas · 4 ventas por día · (5 catálogo completo, solo con `completo: true`).
  Se mide y se anota el tiempo en `logs/app.log`; si `#dias` pasa de 4 s en la caja, se baja a 30 días.
- **Catálogo completo** (`completo: true`): `SELECT Art_Codigo, MIN(Art_Descripcion), MIN(Org_Descripcion),
  MIN(Mar_Nombre) FROM dbo.VArticulosUnificados WITH (NOLOCK) GROUP BY Art_Codigo OPTION (MAXDOP 1)`.
- **Movimientos de un producto** (on demand, `consultaMovimientosProducto`): `SELECT TOP 20 fecha, tipo,
  motivo, cantidad, ubicacion, area, stock_antes, stock_despues FROM dbo.movimientos_bodega WITH (NOLOCK)
  WHERE codigo_barras = @c ORDER BY fecha DESC OPTION (MAXDOP 1)`. Necesita `GRANT SELECT` sobre
  `area` y `stock_despues` (se agrega a `scripts/crear-login-ro.sql`; si falla por permiso, se
  reintenta sin esas dos columnas y se anota una sola vez en el log).

---

## 8. Frontend — `web/`

- **Rutas**: `/` Inventario · `/resurtir` · `/movimiento` · `/alertas` · `/producto/:codigo` ·
  `/buscar?q=` · `/entrar`. `src/web/app.js` actualiza `PANTALLAS`.
- **`web/src/api.ts`** ya está escrito con todos los tipos y funciones: **no se cambia su forma**;
  si falta algo, se agrega al final sin romper lo existente.
- **Layout** (`App.tsx`): encabezado con logo, nombre del módulo, "Actualizado a las 14:30",
  buscador global (input; Enter → `/buscar?q=`), botón Actualizar, usuario y Salir. Navegación:
  4 módulos, abajo en celular (`< 1024px`) y arriba en desktop. Contenedor `max-w-6xl`.
- **Tipografía**: `html { font-size: 16px }` y `@media (min-width: 1024px) { html { font-size: 17.5px } }`
  en `estilos.css`; números de piezas grandes (`text-2xl`/`text-3xl`).
- **Rejilla de tarjetas**: `grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3` en Inventario,
  Resurtir y Alertas. La prueba de desktop (1280 px) cuenta 3 por fila.
- **Badges**: `componentes/Badge.tsx` con `COLORES_CONDICION` (sección 3), texto completo siempre.
- **Botones = acciones reales**: "Solicitar resurtido" (POST, con confirmación
  *"Se pedirá mover 8 pzas de Bodega a Casita 2. El de bodega lo verá en la TC52. ¿Continuar?"*;
  después la tarjeta dice "Solicitado · pendiente en TC52"; 409 → se muestra el texto del admin y la
  tarjeta queda como solicitada), "Agregar a mi lista (en este teléfono)" (`localStorage`, con
  palomitas y botón Imprimir que usa `window.print()`), "Ver producto", "Descartar" alerta (con
  Deshacer). Nada de "Marcar surtido" ni "Confirmar revisión".
- **Descontinuado**: badge negro grande en la ficha y sin botón de resurtir.
- Sin librerías de gráficas: barras y mapas de calor con divs y Tailwind (CSP `'self'`).

---

## 9. Pruebas

- vitest: `pruebas/condiciones.test.js`, `pruebas/movimiento.test.js`, `pruebas/alertas.test.js`,
  `pruebas/armar.test.js` (actualizado), `pruebas/api.test.js` (rutas nuevas, auditoría de
  escrituras = solo las 4, privacidad en todas las rutas incluidas `/api/solicitudes/*` con un
  admin falso, proxy sin sesión → 401, admin caído → 503), `pruebas/solicitudes.test.js`.
- Los datos de prueba (`pruebas/datos-de-prueba.js`) agregan `overrides` (uno descontinuado),
  `ventasAreaLargo`, `ventasDia` y un producto solo en `catalogoCompleto`.
- Playwright (`pruebas/celular.spec.ts` + `pruebas/desktop.spec.ts`): celular 390×844 y
  desktop 1280×800; cada módulo carga; en desktop 3 tarjetas por fila; sin "$".
