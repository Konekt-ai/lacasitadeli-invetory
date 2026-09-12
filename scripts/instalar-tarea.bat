@echo off
rem ============================================================================
rem  instalar-tarea.bat  -  Da de alta la tarea "LacasitaInvetory".
rem
rem  USO:   scripts\instalar-tarea.bat LaContrasenia
rem         scripts\instalar-tarea.bat LaContrasenia OTROUSUARIO
rem
rem  Si la contrasenia trae espacios, ponla entre comillas.
rem
rem  CUIDADOS:
rem   - La contrasenia NUNCA se escribe en un archivo ni en un log. Solo pasa
rem     directo a schtasks. El archivo temporal que se arma aqui solo lleva la
rem     ruta del repo y el usuario, y se borra al final pase lo que pase.
rem   - A proposito NO se usa "enabledelayedexpansion": con eso encendido, una
rem     contrasenia que tenga el signo "!" se rompe.
rem   - Al terminar, cierra esta ventana: lo que escribiste queda en el
rem     historial de la consola.
rem ============================================================================
setlocal

if "%~1"=="" goto :uso

rem --- Raiz del repo, sin rutas quemadas --------------------------------------
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"

set "TAREA=LacasitaInvetory"
set "PLANTILLA=%~dp0tarea-vigilante.xml"
set "VIGILANTE=%RAIZ%\scripts\vigilante.vbs"
set "USUARIO=%~2"
if not defined USUARIO set "USUARIO=LACASITA"

if not exist "%PLANTILLA%" goto :sin_plantilla
if not exist "%VIGILANTE%" goto :sin_vigilante

echo.
echo Instalando la tarea "%TAREA%"
echo   Repo:    %RAIZ%
echo   Usuario: %USUARIO%
echo.

rem --- Copia temporal con la ruta y el usuario ya puestos ----------------------
rem schtasks pide el XML en Unicode (UTF-16), por eso se convierte con
rem PowerShell y -Encoding Unicode. La plantilla del repo se queda intacta.
set "TMPXML=%TEMP%\tarea-invetory-%RANDOM%%RANDOM%.xml"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Get-Content -Raw -LiteralPath $env:PLANTILLA; $t = $t.Replace('__RUTA_REPO__', $env:RAIZ); $t = $t.Replace('__USUARIO__', $env:USUARIO); Set-Content -LiteralPath $env:TMPXML -Value $t -Encoding Unicode"
if errorlevel 1 goto :error_xml
if not exist "%TMPXML%" goto :error_xml
for %%A in ("%TMPXML%") do if %%~zA LSS 200 goto :error_xml

rem --- Alta de la tarea --------------------------------------------------------
rem /ru y /rp mandan sobre lo que trae el XML. /f reemplaza la tarea si ya existe.
schtasks /create /tn "%TAREA%" /xml "%TMPXML%" /ru "%USUARIO%" /rp "%~1" /f
set "RESULTADO=%ERRORLEVEL%"

rem El temporal se borra siempre, haya salido bien o mal.
if exist "%TMPXML%" del /f /q "%TMPXML%" >nul 2>&1
set "TMPXML="

if not "%RESULTADO%"=="0" goto :error_alta

echo.
echo --- Tarea registrada. Asi quedo: -------------------------------------------
schtasks /query /tn "%TAREA%" /fo LIST

echo.
echo --- Primera revision (levanta la app y el tunel si hacen falta) ------------
schtasks /run /tn "%TAREA%" >nul 2>&1

echo.
echo Listo. Revisa en un minuto:
echo   %RAIZ%\logs\vigilante.log     (que esta haciendo el vigilante)
echo   %RAIZ%\logs\consola.log       (la app)
echo   %RAIZ%\logs\cloudflared.log   (ahi sale la direccion del tunel)
echo.
echo Cierra esta ventana para no dejar la contrasenia en el historial.
goto :fin

rem ============================================================================
rem  Salidas
rem ============================================================================

:uso
echo.
echo Falta la contrasenia del usuario de Windows.
echo.
echo   Uso:  scripts\instalar-tarea.bat LaContrasenia [USUARIO]
echo.
echo El usuario por omision es LACASITA. Si la contrasenia trae espacios,
echo ponla entre comillas.
goto :fin_error

:sin_plantilla
echo.
echo ERROR: no se encontro scripts\tarea-vigilante.xml
goto :fin_error

:sin_vigilante
echo.
echo ERROR: no se encontro scripts\vigilante.vbs
goto :fin_error

:error_xml
echo.
echo ERROR: no se pudo preparar el XML temporal de la tarea.
if defined TMPXML if exist "%TMPXML%" del /f /q "%TMPXML%" >nul 2>&1
goto :fin_error

:error_alta
echo.
echo ERROR: schtasks no pudo crear la tarea. Codigo %RESULTADO%.
echo Revisa que el usuario "%USUARIO%" exista y que la contrasenia sea la correcta,
echo y corre esta ventana como administrador.
goto :fin_error

:fin_error
endlocal
exit /b 1

:fin
endlocal
exit /b 0
