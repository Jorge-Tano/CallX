# Crea un certificado HTTPS autofirmado para CallX (necesario para usar la camara
# desde otros equipos de la red).
#
# Uso (en el PC de produccion, PowerShell, desde C:\Proyectos\CallX):
#   powershell -ExecutionPolicy Bypass -File .\scripts\crear-certificado.ps1 -Ip 172.31.7.234
#
# Genera en .\certs\ (carpeta ignorada por git):
#   callx.pfx  certificado + clave, lo usa el servidor (HTTPS_PFX_FILE en .env)
#   callx.cer  solo el certificado publico, para instalar en los PCs que usan la app
#              (asi el navegador no muestra la advertencia de "sitio no seguro")

param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [string]$Nombre = $env:COMPUTERNAME,
    [int]$Anios = 5
)

$ErrorActionPreference = "Stop"
$proyecto = Split-Path $PSScriptRoot -Parent
$carpeta = Join-Path $proyecto "certs"
[void][System.IO.Directory]::CreateDirectory($carpeta)

$clave = Read-Host "Clave para proteger el certificado (anotala para el .env)" -AsSecureString

$cert = New-SelfSignedCertificate `
    -Subject "CN=CallX $Ip" `
    -FriendlyName "CallX HTTPS" `
    -TextExtension @(
        "2.5.29.17={text}IPAddress=$Ip&DNS=$Nombre&DNS=localhost&IPAddress=127.0.0.1",
        # No es una autoridad: aunque se instale como "raiz de confianza" en los
        # PCs, no sirve para firmar certificados de otros sitios.
        "2.5.29.19={critical}{text}ca=false",
        # Solo para servidor web (TLS)
        "2.5.29.37={text}1.3.6.1.5.5.7.3.1"
    ) `
    -KeyAlgorithm RSA -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears($Anios) `
    -CertStoreLocation "Cert:\CurrentUser\My"

$pfx = Join-Path $carpeta "callx.pfx"
$cer = Join-Path $carpeta "callx.cer"
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $clave | Out-Null
Export-Certificate -Cert $cert -FilePath $cer | Out-Null

# El certificado queda exportado; se quita del almacen personal
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)"

Write-Host ""
Write-Host "Listo:" -ForegroundColor Green
Write-Host "  $pfx"
Write-Host "  $cer"
Write-Host ""
Write-Host "Agrega al .env:"
Write-Host "  HTTPS_PFX_FILE=$pfx"
Write-Host "  HTTPS_PFX_PASSPHRASE=<la clave que ingresaste>"
Write-Host ""
Write-Host "Valido hasta: $($cert.NotAfter.ToString('yyyy-MM-dd')). Direccion: https://${Ip}:3643"
