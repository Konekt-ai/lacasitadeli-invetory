@echo off
rem ============================================================================
rem  instalar-tarea.bat  -  Da de alta la tarea "LacasitaInvetory".
rem
rem  USO:   scripts\instalar-tarea.bat
rem         scripts\instalar-tarea.bat OTROUSUARIO
rem
rem  El usuario por omision es LACASITA. La contrasenia NO se teclea aqui: la
rem  pide schtasks solito y no se ve mientras se escribe.
rem
rem  CUIDADOS:
rem   - La contrasenia NUNCA pasa por la linea de comandos. Se le da a schtasks
rem     con /rp * para que la pida el: si se pusiera en la linea de comandos,
rem     cualquier programa de esa computadora la podria leer con
rem     "wmic process get commandline" mientras schtasks trabaja, y ademas
rem     quedaria en el historial de la consola.
rem   - Tampoco se escribe en ningun archivo ni log. El archivo temporal que se
rem     arma aqui solo lleva la ruta del repo y el usuario, y se borra al final
rem     pase lo que pase.
rem ============================================================================
setlocal

if "%~1"=="/?" goto :uso

rem --- Raiz del repo, sin rutas quemadas --------------------------------------
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"

set "TAREA=LacasitaInvetory"
set "PLANTILLA=%~dp0tarea-vigilante.xml"
set "VIGILANTE=%RAIZ%\scripts\vigilante.vbs"
set "USUARIO=%~1"
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
rem Con /rp * schtasks pide la contrasenia el mismo y NO la muestra al teclearla:
rem asi no queda en la linea de comandos de ningun proceso ni en el historial.
echo Ahora schtasks va a pedir la contrasenia de Windows de "%USUARIO%".
echo No se ve mientras la escribes. Teclea y presiona Enter.
echo.
schtasks /create /tn "%TAREA%" /xml "%TMPXML%" /ru "%USUARIO%" /rp * /f
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
goto :fin

rem ============================================================================
rem  Salidas
rem ============================================================================

:uso
echo.
echo   Uso:  scripts\instalar-tarea.bat [USUARIO]
echo.
echo El usuario por omision es LACASITA. La contrasenia se pide sola y no se ve
echo al teclearla: no hay que escribirla aqui.
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
