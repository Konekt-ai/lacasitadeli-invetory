@echo off
setlocal
rem ============================================================================
rem  iniciar-app.bat  -  Arranca la app de inventario (solo lectura).
rem
rem  POR QUE ESTA HECHO ASI:
rem
rem  1) La computadora de la tienda corre el punto de venta y el sistema admin.
rem     Ese sistema hace "taskkill /F /IM node.exe" al iniciar sesion, en cada
rem     actualizacion y con botones del panel. Si arrancamos con npm/npx/node
rem     nuestro proceso se llama node.exe y muere junto con los demas. Por eso
rem     usamos una COPIA RENOMBRADA de node: bin\invetory-node.exe.
rem
rem  2) Nunca se mata por nombre de imagen. Solo se cierra lo que este
rem     ESCUCHANDO en 127.0.0.1:PUERTO, y antes se revisa a que programa
rem     pertenece ese PID (los PID se reciclan: un numero viejo puede ser
rem     cualquier otro programa de la caja).
rem
rem  3) Todo es relativo a la carpeta del script, sin rutas absolutas quemadas,
rem     para que sirva igual en la tienda y en la computadora de pruebas.
rem
rem  DOS ARCHIVOS DE LOG, A PROPOSITO:
rem     logs\consola.log  -> SOLO lo que imprime la app (pantalla y errores).
rem     logs\arranque.log -> los avisos de este script.
rem  Se separan porque mientras la app corre tiene consola.log abierto y Windows
rem  no deja que otro programa le agregue lineas: los avisos se perderian.
rem ============================================================================

rem --- Raiz del repo: una carpeta arriba de scripts\ ---------------------------
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"

rem Todo corre desde la raiz del repo: server.js se busca aqui y dotenv lee el
rem .env de la carpeta ACTUAL. Sin esto, dar doble clic al .bat o llamarlo desde
rem otra carpeta arrancaria la app SIN .env (sin usuarios y sin SQL) y nadie se
rem enteraria, porque de todos modos se pone a escuchar en el puerto.
cd /d "%RAIZ%"

set "CARPETA_LOGS=%RAIZ%\logs"
set "CONSOLA=%CARPETA_LOGS%\consola.log"
set "CONSOLA_VIEJA=%CARPETA_LOGS%\consola.1.log"
set "LOG=%CARPETA_LOGS%\arranque.log"
set "LOG_VIEJO=%CARPETA_LOGS%\arranque.1.log"
set "APP_EXE=%RAIZ%\bin\invetory-node.exe"
set "SERVIDOR=%RAIZ%\server.js"

rem Variables que lee PowerShell mas abajo (asi no hay que pelear con comillas).
set "APP_RAIZ=%RAIZ%"
set "APP_LOG=%CONSOLA%"

rem Topes para rotar: 2 MB la consola de la app, 1 MB el de este script.
set "TOPE_CONSOLA=2097152"
set "TOPE_ARRANQUE=1048576"

rem El puerto sale del .env de la caja (PUERTO), el MISMO archivo que lee
rem src/config.js: si aqui quedara quemado y alguien cambiara el .env, este
rem script buscaria la app en un puerto y la app estaria en otro. El for de
rem adentro es para quitarle los espacios sobrantes al valor.
rem Si el .env no dice nada, se usa el mismo valor por omision que src/config.js.
rem El orden es el mismo de dotenv: lo que ya trae el ambiente, luego el .env.
if not defined PUERTO if exist "%RAIZ%\.env" for /f "usebackq eol=# tokens=1,* delims==" %%K in ("%RAIZ%\.env") do if /i "%%K"=="PUERTO" for /f "tokens=1" %%V in ("%%L") do set "PUERTO=%%V"
if not defined PUERTO set "PUERTO=3010"

if not exist "%CARPETA_LOGS%" mkdir "%CARPETA_LOGS%" >nul 2>&1
if not exist "%RAIZ%\bin" mkdir "%RAIZ%\bin" >nul 2>&1

rem --- Rotar el log de este script --------------------------------------------
if not exist "%LOG%" goto :sin_rotar_arranque
set "TAMANO=0"
for %%A in ("%LOG%") do set "TAMANO=%%~zA"
if %TAMANO% LSS %TOPE_ARRANQUE% goto :sin_rotar_arranque
if exist "%LOG_VIEJO%" del /f /q "%LOG_VIEJO%" >nul 2>&1
move /y "%LOG%" "%LOG_VIEJO%" >nul 2>&1
:sin_rotar_arranque

call :registrar "==================================================="
call :registrar "Arranque solicitado. Raiz: %RAIZ%"

rem ============================================================================
rem  PASO 1: liberar el puerto, pero SOLO si lo tiene un node nuestro.
rem ============================================================================
set "OCUPADO="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:"127.0.0.1:%PUERTO% " ^| findstr /C:"LISTENING"') do if not defined OCUPADO set "OCUPADO=%%P"

if not defined OCUPADO goto :puerto_libre
call :liberar_puerto
if errorlevel 1 goto :fin_puerto_ajeno

rem Un momento para que Windows suelte el puerto y el archivo de consola.
ping -n 3 127.0.0.1 >nul 2>&1

:puerto_libre

rem ============================================================================
rem  PASO 2: rotar logs\consola.log si ya paso de 2 MB.
rem  Se hace ANTES de arrancar porque mientras la app corre ese archivo esta
rem  abierto y Windows no deja moverlo.
rem ============================================================================
if not exist "%CONSOLA%" goto :sin_rotar_consola
set "TAMANO=0"
for %%A in ("%CONSOLA%") do set "TAMANO=%%~zA"
if %TAMANO% LSS %TOPE_CONSOLA% goto :sin_rotar_consola
if exist "%CONSOLA_VIEJA%" del /f /q "%CONSOLA_VIEJA%" >nul 2>&1
move /y "%CONSOLA%" "%CONSOLA_VIEJA%" >nul 2>&1
if errorlevel 1 call :registrar "AVISO: no se pudo rotar consola.log. Quiza todavia lo tiene abierto otro proceso."
if not errorlevel 1 call :registrar "consola.log paso de 2 MB. Se movio a consola.1.log."
:sin_rotar_consola

rem ============================================================================
rem  PASO 3: asegurar la copia renombrada de node.
rem ============================================================================
if exist "%APP_EXE%" goto :hay_node

call :registrar "AVISO: no existe bin\invetory-node.exe. Se va a crear copiando el node real."
set "NODE_REAL="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_REAL set "NODE_REAL=%%N"
if defined NODE_REAL goto :copiar_node
rem Plan B: la instalacion tipica de Node en Windows.
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_REAL=%ProgramFiles%\nodejs\node.exe"
if defined NODE_REAL goto :copiar_node
call :registrar "ERROR: no se encontro node.exe en el sistema. Instala Node 20 o pon node en el PATH."
goto :fin_error

:copiar_node
copy /y "%NODE_REAL%" "%APP_EXE%" >nul 2>&1
if errorlevel 1 goto :fin_sin_copia
call :registrar "Copia creada. Origen: %NODE_REAL%  Destino: bin\invetory-node.exe"

:hay_node
if exist "%SERVIDOR%" goto :hay_servidor
call :registrar "ERROR: no se encontro server.js en la raiz del repo. No se arranca nada."
goto :fin_error
:hay_servidor

rem ============================================================================
rem  PASO 4: arrancar la app oculta y desatendida.
rem
rem  Se pide a WMI (Win32_Process.Create) que cree el proceso, con
rem  Win32_ProcessStartup ShowWindow=0 para que no aparezca ninguna ventana.
rem  Asi el proceso nace DESPRENDIDO: no es hijo de esta ventana ni del
rem  Programador de Tareas, y no se cae cuando se cierra quien lo lanzo.
rem  El cmd.exe intermedio es el que manda pantalla y errores a consola.log.
rem
rem  Los simbolos raros (comillas, mayor-que, ampersand) se arman DENTRO de
rem  PowerShell con [char], para que esta linea del .bat no lleve caracteres
rem  que cmd confunda con redirecciones.
rem ============================================================================
call :registrar "Arrancando bin\invetory-node.exe server.js en el puerto %PUERTO% ..."

rem El try/catch no es adorno: si WMI esta caido o bloqueado, la llamada truena,
rem $r se queda vacio y "exit [int]$r.ReturnValue" saldria con 0, o sea que el
rem .bat creeria que la app arranco y el plan B de abajo nunca se usaria.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c=[char]34; $m=[char]62+[char]62; $e=[char]62+[char]38+'1'; $a=$c+$env:ComSpec+$c+' /s /c '+$c+$c+$env:APP_EXE+$c+' server.js '+$m+$c+$env:APP_LOG+$c+' 2'+$e+$c; $s=([WMIClass]'Win32_ProcessStartup').CreateInstance(); $s.ShowWindow=0; $r=([WMIClass]'Win32_Process').Create($a,$env:APP_RAIZ,$s); if ($null -eq $r) { exit 1 }; exit [int]$r.ReturnValue } catch { exit 1 }"
if errorlevel 1 goto :arranque_sencillo
goto :verificar

:arranque_sencillo
rem Plan B si PowerShell o WMI estan bloqueados: se arranca en esta consola.
rem Ojo: asi la app SI muere si alguien cierra la ventana que la lanzo.
call :registrar "AVISO: no se pudo arrancar con WMI. Se usa el modo sencillo; no cierres la ventana."
start "" /b "%APP_EXE%" "%SERVIDOR%" >>"%CONSOLA%" 2>&1

:verificar
rem Se le dan unos segundos y se revisa si de verdad quedo escuchando.
ping -n 7 127.0.0.1 >nul 2>&1
set "NUEVO="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:"127.0.0.1:%PUERTO% " ^| findstr /C:"LISTENING"') do if not defined NUEVO set "NUEVO=%%P"
if defined NUEVO goto :fin_ok
call :registrar "AVISO: todavia no escucha nadie en el puerto %PUERTO%. Revisa las ultimas lineas de logs\consola.log."
goto :fin

:fin_ok
call :registrar "Listo: la app quedo escuchando en 127.0.0.1:%PUERTO% con PID %NUEVO%."
goto :fin

rem ============================================================================
rem  Subrutinas
rem ============================================================================

:registrar
rem Escribe una linea con fecha y hora en logs\arranque.log.
rem El texto se pasa a una variable y se saca con !VARIABLE! (expansion
rem retardada, encendida solo aqui adentro) porque si el mensaje trae un
rem ">" o un "&", cmd lo tomaria como redireccion y se comeria media linea.
rem El espacio antes de >> tambien es a proposito: si el texto termina en
rem numero, cmd lo leeria como numero de canal.
setlocal enabledelayedexpansion
set "TEXTO=%~1"
echo [%DATE% %TIME%] !TEXTO! >>"%LOG%"
endlocal
exit /b 0

:liberar_puerto
rem Revisa de quien es el PID que tiene el puerto antes de cerrarlo.
set "IMAGEN="
for /f "tokens=1" %%N in ('tasklist /fi "PID eq %OCUPADO%" /nh 2^>nul') do if not defined IMAGEN set "IMAGEN=%%N"
if not defined IMAGEN exit /b 0
rem Si tasklist no encontro el PID imprime un aviso cuyo texto cambia con el
rem idioma de Windows ("INFO:" en ingles, "INFORMACION:" en espanol). Lo unico
rem seguro es que un nombre de programa acaba en .exe: si no acaba en .exe es el
rem aviso, o sea que ese proceso ya murio solo y el puerto queda libre.
if /i not "%IMAGEN:~-4%"==".exe" exit /b 0
rem SOLO se cierra lo nuestro. La app de esta carpeta SIEMPRE se llama
rem invetory-node.exe (asi la arranca este mismo script). node.exe es el nombre
rem con el que corre el sistema admin de la tienda: no se toca nunca.
if /i "%IMAGEN%"=="invetory-node.exe" goto :lp_cerrar
set "IMAGEN_AJENA=%IMAGEN%"
exit /b 1
:lp_cerrar
call :registrar "Se libera el puerto %PUERTO%: se cierra %IMAGEN% con PID %OCUPADO%."
taskkill /f /pid %OCUPADO% >nul 2>&1
exit /b 0

rem ============================================================================
rem  Salidas
rem ============================================================================

:fin_puerto_ajeno
call :registrar "ERROR: el puerto %PUERTO% lo tiene %IMAGEN_AJENA% con PID %OCUPADO%, que no es de esta app."
call :registrar "No se cierra nada ajeno en la caja. Revisalo a mano y vuelve a correr este script."
goto :fin_error

:fin_sin_copia
call :registrar "ERROR: no se pudo copiar node.exe a bin\invetory-node.exe. Revisa permisos de la carpeta bin."
goto :fin_error

:fin_error
endlocal
exit /b 1

:fin
endlocal
exit /b 0
