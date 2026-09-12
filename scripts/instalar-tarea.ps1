# ============================================================================
#  instalar-tarea.ps1  -  Da de alta la tarea "LacasitaInvetory" SIN preguntar
#  nada. Es la vía para instalar por SSH, donde no hay pantalla para teclear.
#
#  USO (en la caja, o por SSH):
#      $env:CLAVE_TAREA = "<contraseña de Windows de LACASITA>"
#      powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-tarea.ps1
#      Remove-Item Env:\CLAVE_TAREA
#
#  Si prefieres teclearla a mano, usa scripts\instalar-tarea.bat (la pide sola y
#  no se ve al escribirla).
#
#  POR QUE ASÍ: la contraseña llega por variable de entorno y NUNCA va en la
#  línea de comandos. Con `schtasks /rp <clave>` cualquiera en esa computadora
#  podría leerla mientras corre (`wmic process get commandline`) y además quedaría
#  en el historial de la consola.
# ============================================================================
param(
  [string]$Usuario = 'LACASITA',
  [string]$Tarea   = 'LacasitaInvetory'
)

$ErrorActionPreference = 'Stop'

$raiz      = Split-Path -Parent $PSScriptRoot
$plantilla = Join-Path $PSScriptRoot 'tarea-vigilante.xml'
$vigilante = Join-Path $PSScriptRoot 'vigilante.vbs'

if (-not (Test-Path $plantilla)) { throw "No se encontró $plantilla" }
if (-not (Test-Path $vigilante)) { throw "No se encontró $vigilante" }

$clave = $env:CLAVE_TAREA
if ([string]::IsNullOrWhiteSpace($clave)) {
  throw 'Falta la contraseña. Pon $env:CLAVE_TAREA antes de correr este script (o usa instalar-tarea.bat).'
}

Write-Output "Instalando la tarea '$Tarea'"
Write-Output "  Repo:    $raiz"
Write-Output "  Usuario: $Usuario"

$xml = (Get-Content -Raw -LiteralPath $plantilla).
        Replace('__RUTA_REPO__', $raiz).
        Replace('__USUARIO__', $Usuario)

# Register-ScheduledTask recibe la contraseña como texto en memoria, no como
# argumento de ningún proceso.
Register-ScheduledTask -TaskName $Tarea -Xml $xml -User $Usuario -Password $clave -Force | Out-Null

$t = Get-ScheduledTask -TaskName $Tarea
Write-Output "Quedó registrada. Estado: $($t.State)"

# Primera revisión: levanta la app y el túnel si hacen falta.
Start-ScheduledTask -TaskName $Tarea
Write-Output 'Primera revisión lanzada. En un minuto revisa:'
Write-Output "  $raiz\logs\vigilante.log"
Write-Output "  $raiz\logs\consola.log"
Write-Output "  $raiz\logs\cloudflared.log   (ahí sale la dirección del túnel)"
