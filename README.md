# lacasitadeli-invetory

El inventario completo de La Casita Deli en el celular (y en la computadora),
**medido en piezas y sin un solo dato de dinero**: qué hay y dónde, qué mover
al anaquel, cómo se mueve la venta y qué hay que revisar.

Cuatro módulos: **Inventario · Resurtir · Movimiento · Alertas**, más un buscador
global que encuentra cualquier producto (aunque solo exista en el catálogo de la
caja) y la ficha de cada producto.

Corre **en la computadora de la tienda** (la misma del punto de venta NovaCaja),
escucha solo en `127.0.0.1:3010` y se abre desde afuera por un **Quick Tunnel de
Cloudflare**, con un login sencillo.

**Lo único que hace sobre el negocio** es crear una **solicitud de resurtido** en el
panel admin ("Solicitar resurtido"): el de bodega la ve en la TC52, mueve las
piezas y, al registrar el traslado escaneando, la solicitud se cierra sola. Todo lo
demás es lectura. Lo demás que guarda (alertas descartadas) va en un SQLite propio
(`data/invetory.db`).

> El repo se llama `lacasitadeli-invetory` (sin la "n"), así en GitHub, en la
> carpeta, en la tarea programada y en los logs.

---

## Cómo está hecho

```
Celular / computadora  ──HTTPS──►  https://<algo>.trycloudflare.com
                                          │  (el túnel lo abre la caja HACIA Cloudflare;
                                          │   no se abre ningún puerto del router)
                                          ▼
                              cloudflared  ──►  http://127.0.0.1:3010   (esta app)
                                                      │  SELECT con inventory_ro
                                                      ├─▶ SQL Server `compucaja`
                                                      ├─▶ SQLite del admin (solo lectura: fotos, categoría, DESCONTINUADO)
                                                      └─▶ POST http://127.0.0.1:3002/api/resurtido  (la ÚNICA escritura: crear una solicitud)
```

Un solo proceso de Node 20: Express sirve el API (`/api/...`) y la página ya
compilada (`dist/`, que va **commiteada** — en la caja nunca se compila nada).

| Carpeta | Qué hay |
|---|---|
| `src/calculos/` | Las reglas, en funciones puras y con pruebas: condiciones (badges), prioridad, alertas, movimiento, duplicados, resurtido, cocina, fechas |
| `src/datos/` | Las consultas a `compucaja`, cómo se traen y el cliente del API del admin |
| `src/servicios/` | El motor de caché y las vistas que consumen las pantallas |
| `src/db/` | El SQLite del admin (solo lectura) y el propio (`data/invetory.db`) |
| `src/web/` | Express, login, rutas y el proxy de solicitudes |
| `web/` | La página (React + Vite + Tailwind); `web/src/api.ts` es el contrato con el backend |
| `docs/CONTRATO-v2.md` | La ley de esta versión: snapshot, badges, API, pantallas |
| `scripts/` | Arranque, vigilante, tarea programada y utilerías |
| `pruebas/` | vitest (cálculos, vistas, API, proxy) y Playwright (celular y escritorio) |

---

## Lo que ve el dueño (resumen; la guía completa está en `GUIA.md`)

- **Inventario**: resumen del día (urgentes, piezas a mover, sin stock, bajo stock,
  sobrestock, sin movimiento 90+, descontinuados, alertas), cobertura por
  sucursal, filtros que operan sobre TODO el inventario (área, condiciones
  combinables, prioridad, categoría, orden) y la lista completa de 60 en 60.
- **Resurtir**: qué mover, desde dónde, hacia dónde y cuántas piezas, con
  horizonte (hoy / 3 días / 7 días), "Solicitar resurtido", "mi lista (en este
  teléfono)" e historial de solicitudes.
- **Movimiento**: piezas vendidas 7/30/90 con % contra el periodo anterior, más
  vendidos, categorías, comparativo por sucursal, aceleran/bajan, mapas de calor y
  ranking de rotación.
- **Alertas**: duplicados, sin alta en caja, sin categoría, ubicación incorrecta,
  entradas sin ventas, sobrestock crítico, estancados y desfasados, explicadas en
  sencillo; solo "Ver producto" y "Descartar".

**Descontinuado ≠ sin movimiento.** "Descontinuado" es un estatus que SOLO pone el
dueño en el Admin (`product_overrides.descontinuado`). Un producto que lleva meses sin
venderse es "Sin movimiento 90+ días", nunca "Descontinuado" por su cuenta.

---

## Instalación en la computadora de la tienda

Todo esto es **una sola vez**. Se hace por SSH (`LACASITA@100.95.133.90`).

### 1. Clonar

```
cd C:\Users\LACASITA\Desktop
git clone https://github.com/Konekt-ai/lacasitadeli-invetory
cd lacasitadeli-invetory
npm ci --omit=dev
```

### 2. Crear el login de SQL de solo lectura

1. Genera una contraseña larga (24+ caracteres).
2. Ponla en `scripts\crear-login-ro.sql` donde dice `<<<PONER-CONTRASENA-AQUI>>>`.
3. `sqlcmd -S localhost -U sa -P <contraseña de sa> -i scripts\crear-login-ro.sql`
4. Borra la contraseña del archivo (solo debe quedar en el `.env`).

### 3. El `.env`

Copia `.env.example` a `.env` y llena:

- `MSSQL_USER=inventory_ro` y su `MSSQL_PASSWORD`
- `ADMIN_API=http://127.0.0.1:3002` (el panel admin de la misma caja)
- `USUARIOS=` — se generan con `npm run hash-contrasena -- dueno`
  (el comando inventa una contraseña fácil de dictar y te da el hash listo). El
  nombre de usuario queda como "quién pidió" en las solicitudes de resurtido.
- `SESSION_SECRET=` — cualquier texto largo al azar
- `RESEND_API_KEY` o `EMAIL_USER`/`EMAIL_PASS` — los mismos del panel admin, para
  avisar la dirección nueva del túnel

Comprueba que el login quedó bien:

```
node scripts\verificar-permisos.js
```

Debe decir que **no puede** ver importes, costos, cajeros ni clientes, y que **sí**
puede leer inventario, tickets, catálogo y movimientos.

### 4. `cloudflared`

Instálalo con el MSI oficial (necesita permisos de administrador):

```
https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi
```

No hay que configurarlo: el vigilante lo levanta con la dirección al azar del
Quick Tunnel. **Ojo:** si existe `%USERPROFILE%\.cloudflared\config.yml`, el Quick
Tunnel no funciona (el vigilante lo avisa en su log).

### 5. Dejarlo vivo

```
scripts\instalar-tarea.bat
```

(La pide sola y no se ve al teclearla. Si lo estás haciendo por SSH, donde no hay
pantalla para escribir, usa la vía sin preguntas:
`$env:CLAVE_TAREA="..."` y luego
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-tarea.ps1`.)

Crea la tarea programada `LacasitaInvetory`, que corre al prender Windows y cada
2 minutos: si la app no está escuchando, la levanta; si `cloudflared` se cayó, lo
vuelve a levantar.

---

## Por qué la app corre con un `node.exe` renombrado

El sistema admin de la tienda hace **`taskkill /F /IM node.exe`** al iniciar
sesión, en cada actualización (hasta cada hora si está la tarea de auto-update),
con el botón "Reiniciar" del panel y al salir del ícono de la bandeja. Con un
`node.exe` normal, esta app estaría muriendo todo el día.

Por eso `scripts\iniciar-app.bat` la arranca con una **copia renombrada**:

```
bin\invetory-node.exe server.js
```

`taskkill /IM node.exe` compara el nombre exacto del ejecutable, así que la copia
sobrevive. **Nunca** la arranques con `npm start` ni con `node server.js` en la
caja: eso crea un `node.exe` que sí se muere.

Y al revés: esta app **nunca** mata procesos por nombre. Solo por puerto (3010) o
por el PID que ella misma guardó.

---

## Actualizar

Por SSH, sin tocar nada del admin:

```
cd C:\Users\LACASITA\Desktop\lacasitadeli-invetory
git pull
scripts\iniciar-app.bat
```

`iniciar-app.bat` mata **solo** lo que esté en el puerto 3010 y vuelve a
levantar la app. El túnel sigue igual, así que **la dirección no cambia**.

**Solo si cambió `package-lock.json`** hace falta `npm ci --omit=dev`, y OJO:
con la app corriendo **falla** (`EPERM` sobre `better_sqlite3.node`, que el
proceso tiene abierto) y deja `node_modules` a medias. Primero detén la app y
luego instala:

```
for /f "tokens=2 delims=," %p in ('tasklist /fi "imagename eq invetory-node.exe" /fo csv /nh') do taskkill /f /pid %~p
npm ci --omit=dev
scripts\iniciar-app.bat
```

(El vigilante la levantaría solo en menos de 2 minutos, pero con `node_modules`
a medias no arranca: por eso el orden importa.)

> **Cajas instaladas antes del 2026-09-15 (versión 2):** la ficha del producto
> lee `movimientos_bodega.area` y `stock_despues`, así que `inventory_ro` necesita
> el `GRANT` de esas dos columnas (última línea de `scripts\crear-login-ro.sql`;
> se corre una vez con `sa`). Sin él la app funciona igual, solo que los movimientos
> salen sin origen ni "quedan N" (lo dice `logs\app.log`). En la caja de La Casita
> ya quedó aplicado. También hay que agregar `ADMIN_API=http://127.0.0.1:3002` al
> `.env` (si falta, se usa ese valor).

> **NUNCA** corras `actualizar-sistema.bat` del admin por SSH, ni
> `taskkill /IM node.exe`: tumbarías el punto de venta, el panel y la PWA.

---

## La dirección del túnel

- La da Cloudflare al azar (`https://algo-algo.trycloudflare.com`) y **cambia cada
  vez que arranca `cloudflared`** (o sea, al reiniciar Windows). Mientras el
  proceso siga vivo, la dirección se mantiene.
- La app la lee del servidor de métricas (`http://127.0.0.1:3011/quicktunnel`), la
  guarda en `logs\url-actual.txt` y **manda correo** cuando cambia.
- El vigilante **no** reinicia un `cloudflared` sano: eso cambiaría la dirección
  de balde. Solo lo levanta si el proceso murió o si lleva 10 minutos sin
  conectar.
- Si algún día se quiere una dirección fija, hace falta un dominio propio en
  Cloudflare (unos 10–15 USD al año): con eso se usa un túnel con nombre y se
  puede poner Cloudflare Access encima. Hoy **no** está así.

---

## Pruebas

```
npm test                      # 236 pruebas: cálculos, vistas, API, proxy de solicitudes, seguridad y privacidad
npx playwright test           # 17 pruebas: celular 390x844 (10) y escritorio 1280x800 (6+1)
node scripts/diagnostico.js   # contra la base real: tiempos y conteos
node scripts/verificar-permisos.js
```

Lo que revisan las pruebas de siempre:

- **Privacidad:** ninguna ruta ni vista trae llaves ni textos de dinero (ni
  `proveedor`); tampoco lo que contesta el admin por el proxy.
- **Escrituras:** se recorre el árbol de rutas de Express y solo pueden existir
  `POST /api/login`, `POST /api/logout`, `POST /api/solicitudes` y
  `POST /api/alertas/:id/descartar`.
- **Sesión:** sin cookie todo es 401 (incluido el proxy); 5 intentos fallidos y
  429; el usuario que se quita del `.env` queda fuera al instante.
- **Proxy:** solo las rutas del contrato; el 409 del admin pasa tal cual; un
  producto descontinuado no se pide; admin caído = 503 con mensaje claro.
- **Escritorio:** 3 tarjetas por fila en Inventario, Resurtir y Alertas.

---

## Cuidados con la base (es la del punto de venta)

- Todas las consultas llevan `WITH (NOLOCK)` y `OPTION (MAXDOP 1)`, y van **en
  fila**, nunca en paralelo.
- Las `#temporales` **no** sobreviven entre peticiones (el pool hace
  `sp_reset_connection`): cada lote va completo en un solo `query()`.
- Las `#temporales` llevan `COLLATE DATABASE_DEFAULT` (tempdb es `SQL_Latin1` y la
  base `Modern_Spanish`).
- Nunca un `OR` sobre `Art_GTIN`/`CodAlt_Codigo` en `VArticulosUnificados`: se va a
  ~20 s. Las fases van por separado.
- **No** se pide `MAX(Concepto)` en el escaneo del historial: medido, lleva la
  consulta de 2.9 s a 22.7 s y no le pone nombre a ningún producto.
- Nada de columnas de dinero: el login `inventory_ro` ni siquiera tiene permiso.

**Cada cuánto se refresca** (y si nadie entra en una hora, se deja de refrescar):

| Lote | Cada | Cuesta (medido 2026-09-15 en la caja) |
|---|---|---|
| Stock, apartados, ventas por área, desfases | 5 min | **0.4 – 2 s** |
| Historial (última venta) + catálogo + ventas largas 60/90/180 + ventas por día | 30 min | historial 3.5 s · catálogo 2.2 s · ventas largas 2.2 s · ventas por día 0.45 s ≈ **8.4 s** |
| Lo mismo "completo": fases alterno/GTIN/PLU + catálogo COMPLETO (60 mil filas, solo para el buscador) | 6 h y al arrancar | **+ 6.6 s** (≈ 15 s en total) |
| Movimientos de UN producto (al abrir su ficha; caché 60 s) | on demand | 0.3 – 0.5 s |
| SQLite del admin (fotos, categorías, descontinuados) | 30 min | 0.05 s |

Si `ventas-por-dia` pasara de 4 s (queda en `logs\app.log`), se baja
`VENTAS_DIA_DIAS=30` en el `.env` sin tocar código.

---

## Decisiones que vale la pena recordar

- **"Descontinuado" SOLO viene del Admin** (`product_overrides.descontinuado = 1`).
  Antes (v1) la app llamaba "descontinuado" a lo que llevaba 90 días sin venderse;
  eso ahora es "Sin movimiento 90+ días". El jefe lo pidió así: una cosa es que
  no se venda y otra que el dueño haya decidido no comprarlo más.
- **Un producto puede tener varias condiciones a la vez** (badges): sin stock,
  bajo stock, sobrestock, más vendido, lento, sin movimiento (el tramo mayor),
  nuevo sin venta, descontinuado, posible duplicado, sin alta, desfasado. Los
  filtros del Inventario las combinan (se cumplen todas).
- **Botones = acciones reales.** "Solicitar resurtido" crea una tarea en el admin
  que bodega ejecuta con la TC52. "Mi lista" vive solo en el teléfono y se llama
  así. No hay "Marcar surtido": lo surtido lo registra la TC52.
- **El catálogo completo de NovaCaja (60 mil) se carga solo para el buscador.** Lo
  que ni se contó ni se vendió en 120 días no es inventario: sale como "en catálogo
  de caja, sin existencia contada".
- **La alerta "sin categoría" solo para lo que se vende** (10+ piezas en 30 días):
  11,499 de 11,834 productos con piezas son "ABARROTES"; sin ese piso salían 9,428
  alertas de puro ruido. Las listas de alertas se mandan de 300 en 300, las más
  importantes primero, y `cuantos` dice el total.
- **"Nuevo" se decide con `creado`, no con `ultima_entrada`.** `ultima_entrada`
  también se mueve cuando surten de Bodega al anaquel.
- **`Art_FechaUltimaVenta` de NovaCaja no sirve** (viene NULL). La última venta se
  calcula desde `TicketsPS`.
- **"Nunca vendido" casi nunca es "descontinuado".** De 2,723 productos nunca
  vendidos: 2,010 no están dados de alta en la caja, ~400 se venden con otro
  código mal capturado y otros tantos acaban de llegar.
- **La comida hecha en casa manda en las ventas** (4,041 piezas al mes del código
  `0`). Se esconde en resurtido y en movimiento, junto con los códigos que nunca
  se han contado en ninguna área (son los genéricos con los que se cobra).
- **Sin fila en `inventario_bodega` ≠ cero.** Sin fila significa "nunca se contó
  aquí", y la acción es contarlo, no pedirlo.
- **Las fechas del admin llegan con "Z" pero son hora de la tienda**: el proxy las
  convierte a `-06:00` antes de mandarlas al celular, como todo lo demás.
