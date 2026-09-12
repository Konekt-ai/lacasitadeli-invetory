# lacasitadeli-invetory

Consulta de inventario **de solo lectura** para el celular: qué está parado, qué
hay que resurtir, qué se vende más y dónde hay cada producto.

Corre **en la computadora de la tienda** (la misma del punto de venta NovaCaja),
escucha solo en `127.0.0.1:3010` y se abre desde afuera por un **Quick Tunnel de
Cloudflare**, con un login sencillo. **No escribe nada** en el negocio: el único
cambio que hace en SQL Server es… ninguno; solo `SELECT` con un login de solo
lectura.

> El repo se llama `lacasitadeli-invetory` (sin la "n"), así en GitHub, en la
> carpeta, en la tarea programada y en los logs.

---

## Cómo está hecho

```
Celular  ──HTTPS──►  https://<algo>.trycloudflare.com
                            │  (el túnel lo abre la caja HACIA Cloudflare;
                            │   no se abre ningún puerto del router)
                            ▼
              cloudflared  ──►  http://127.0.0.1:3010   (esta app)
                                        │  SELECT con inventory_ro
                                        ▼
                        SQL Server `compucaja`  +  SQLite del admin (solo fotos)
```

Un solo proceso de Node 20: Express sirve el API (`/api/...`) y la página ya
compilada (`dist/`, que va **commiteada** — en la caja nunca se compila nada).

| Carpeta | Qué hay |
|---|---|
| `src/calculos/` | Las reglas, en funciones puras y con pruebas: clasificación, duplicados, resurtido, cocina, fechas |
| `src/datos/` | Las consultas a `compucaja` y cómo se traen |
| `src/servicios/` | El motor de caché y las vistas que consume el celular |
| `src/web/` | Express, login y rutas |
| `web/` | La página (React + Vite + Tailwind) |
| `scripts/` | Arranque, vigilante, tarea programada y utilerías |
| `pruebas/` | vitest (cálculos y API) y Playwright (celular) |

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
- `USUARIOS=` — se generan con `npm run hash-contrasena -- dueno`
  (el comando inventa una contraseña fácil de dictar y te da el hash listo)
- `SESSION_SECRET=` — cualquier texto largo al azar
- `RESEND_API_KEY` o `EMAIL_USER`/`EMAIL_PASS` — los mismos del panel admin, para
  avisar la dirección nueva del túnel

Comprueba que el login quedó bien:

```
node scripts\verificar-permisos.js
```

Debe decir que **no puede** ver importes, costos, cajeros ni clientes, y que **sí**
puede leer inventario, tickets y catálogo.

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
npm ci --omit=dev
scripts\iniciar-app.bat
```

`iniciar-app.bat` mata **solo** lo que esté en el puerto 3010 y vuelve a
levantar la app. El túnel sigue igual, así que **la dirección no cambia**.

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
npm test                      # 91 pruebas: cálculos, API, seguridad y privacidad
npx playwright test           # 10 pruebas en un celular de 390x844
node scripts/diagnostico.js   # contra la base real: tiempos y conteos
node scripts/verificar-permisos.js
```

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

| Lote | Cada | Cuesta |
|---|---|---|
| Stock, apartados y ventas por área | 5 min | **0.5 s** |
| Última venta (ventana de 120 días) + catálogo | 30 min | ~4 s |
| Historial completo (4.5 años) + catálogo completo | 6 h y al arrancar | **9.4 s** |

(Medido el 2026-09-11 en la computadora de la tienda, con el login `inventory_ro`.)

---

## Decisiones que vale la pena recordar

- **"Nuevo" se decide con `creado`, no con `ultima_entrada`.** `ultima_entrada`
  también se mueve cuando surten de Bodega al anaquel: con ella, DUNCAN HINES
  (478 piezas, 143 días sin venderse) aparecía como "nuevo" y se escondía justo lo
  que el dueño quiere ver.
- **`Art_FechaUltimaVenta` de NovaCaja no sirve** (viene NULL). La última venta se
  calcula desde `TicketsPS`.
- **"Nunca vendido" casi nunca es "descontinuado".** De 2,723 productos nunca
  vendidos: 2,010 no están dados de alta en la caja, ~400 se venden con otro
  código mal capturado y otros tantos acaban de llegar.
- **La comida hecha en casa manda en las ventas** (4,041 piezas al mes del código
  `0`). Se esconde en resurtido y en más vendidos, junto con los códigos que nunca
  se han contado en ninguna área (son los genéricos con los que se cobra).
- **Sin fila en `inventario_bodega` ≠ cero.** Sin fila significa "nunca se contó
  aquí", y la acción es contarlo, no pedirlo.
