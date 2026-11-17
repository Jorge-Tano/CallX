# Despliegue de CallX en el PC de produccion
#
# Uso (desde la carpeta del proyecto, C:\Proyectos\CallX):
#   powershell -ExecutionPolicy Bypass -File .\scripts\desplegar.ps1
#
# Que hace:
#   1. Se niega a seguir si hay archivos del repo modificados a mano en este PC
#      (para no pisarlos; primero hay que decidir que hacer con ellos).
#   2. Baja los cambios de origin/main (solo avance rapido, sin merges).
#   3. Si cambio package-lock.json, ejecuta "npm ci".
#   4. Compila. Si falla, vuelve al commit anterior y levanta esa version.
#   5. Reinicia pm2.

param(
    [string]$Rama = "main",
    [string]$Pm2App = "callx-next-prod"
)

$ErrorActionPreference = "Stop"

# Devuelve la ruta con las mayusculas reales del disco. Windows acepta
# "C:\proyectos\callx" para "C:\Proyectos\CallX", pero Next carga entonces
# cada modulo dos veces (una por cada forma de escribir la ruta) y el build
# falla con "Expected workUnitAsyncStorage to have a store".
function Get-RutaReal([string]$ruta) {
    $dir = New-Object System.IO.DirectoryInfo($ruta)
    if ($null -eq $dir.Parent) { return $dir.Name.ToUpper() }
    $padre = Get-RutaReal $dir.Parent.FullName
    $nombre = ($dir.Parent.GetFileSystemInfos($dir.Name) | Select-Object -First 1).Name
    return (Join-Path $padre $nombre)
}

$proyecto = Get-RutaReal (Split-Path $PSScriptRoot -Parent)
Set-Location -LiteralPath $proyecto
Write-Host "Proyecto: $proyecto"

function Invoke-Git {
    & git.exe @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') fallo" }
}

# 1. Cambios locales
$cambios = git status --porcelain --untracked-files=no
if ($cambios) {
    Write-Host "Hay archivos modificados en este PC que no estan en GitHub:" -ForegroundColor Yellow
    $cambios | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host "Revisalos con 'git diff'. Para descartarlos: git checkout -- <archivo>"
    exit 1
}

# 2. Bajar cambios
$antes = (git rev-parse HEAD).Trim()
Invoke-Git fetch origin $Rama
Invoke-Git merge --ff-only "origin/$Rama"
$despues = (git rev-parse HEAD).Trim()

if ($antes -eq $despues) {
    Write-Host "Ya estaba actualizado ($($antes.Substring(0,7))). No se reinicia nada." -ForegroundColor Green
    exit 0
}

Write-Host "Cambios nuevos:" -ForegroundColor Cyan
git log --oneline "$antes..$despues"

# 3. Dependencias
$archivos = git diff --name-only $antes $despues
$depsCambiaron = ($archivos -contains "package-lock.json") -or ($archivos -contains "package.json")
if ($depsCambiaron) {
    Write-Host "Cambiaron las dependencias: npm ci" -ForegroundColor Cyan
    # npm ci borra node_modules; en Windows falla si la app tiene archivos abiertos
    pm2 stop $Pm2App
    npm ci --include=dev
    if ($LASTEXITCODE -ne 0) { Write-Host "npm ci fallo" -ForegroundColor Red; exit 1 }
}

# 4. Compilar
Write-Host "Compilando..." -ForegroundColor Cyan
# next build debe correr en modo produccion aunque la consola tenga otro NODE_ENV
$env:NODE_ENV = "production"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "La compilacion fallo. Volviendo a la version anterior ($($antes.Substring(0,7)))." -ForegroundColor Red
    Invoke-Git reset --hard $antes
    if ($depsCambiaron) { npm ci --include=dev }
    npm run build
    pm2 restart $Pm2App
    exit 1
}

# 5. Reiniciar
pm2 restart $Pm2App
Write-Host "Desplegado $($despues.Substring(0,7))." -ForegroundColor Green
