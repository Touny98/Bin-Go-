# update-mp-urls.ps1
# Lee la URL pública actual de ngrok (desde la API local en :4040)
# y actualiza automaticamente las variables de MercadoPago en .env,
# luego reinicia el contenedor app para que tome los nuevos valores.
#
# Uso: .\update-mp-urls.ps1
# Ejecutar cada vez que ngrok genere una nueva URL temporal.

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot ".env"
$ngrokApi = "http://localhost:4040/api/tunnels"

Write-Host ""
Write-Host "Leyendo URL publica de ngrok..." -ForegroundColor Cyan

# Esperar a que ngrok esté listo (hasta 30 segundos)
$publicUrl = $null
for ($i = 0; $i -lt 15; $i++) {
    try {
        $response = Invoke-RestMethod -Uri $ngrokApi -Method Get -ErrorAction Stop
        $tunnel = $response.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        if ($tunnel) {
            $publicUrl = $tunnel.public_url.TrimEnd('/')
            break
        }
    } catch { }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
}

if (-not $publicUrl) {
    Write-Host ""
    Write-Host "ERROR: No se pudo obtener la URL de ngrok." -ForegroundColor Red
    Write-Host "  Asegurate de que ngrok este corriendo:"
    Write-Host "  docker-compose -f docker-compose.local.yml ps"
    exit 1
}

Write-Host ""
Write-Host "URL publica ngrok: $publicUrl" -ForegroundColor Green

# Helper: actualizar variable en .env
function Set-EnvVar {
    param([string]$content, [string]$key, [string]$value)
    if ($content -match "(?m)^$key=") {
        return $content -replace "(?m)^$key=.*", "$key=$value"
    } else {
        return $content.TrimEnd() + "`n$key=$value`n"
    }
}

# Leer y actualizar .env
$envContent = Get-Content $envFile -Raw
$envContent = Set-EnvVar $envContent "MP_BACK_URL_SUCCESS"  "$publicUrl/success"
$envContent = Set-EnvVar $envContent "MP_BACK_URL_PENDING"  "$publicUrl/pending"
$envContent = Set-EnvVar $envContent "MP_BACK_URL_FAILURE"  "$publicUrl/failure"
$envContent = Set-EnvVar $envContent "MP_WEBHOOK_URL"       "$publicUrl/api/payments/webhook"
Set-Content -Path $envFile -Value $envContent -Encoding utf8

Write-Host "MP_WEBHOOK_URL     = $publicUrl/api/payments/webhook" -ForegroundColor Yellow
Write-Host "MP_BACK_URL_SUCCESS = $publicUrl/success" -ForegroundColor Yellow

# Reiniciar app para que tome los nuevos valores
Write-Host ""
Write-Host "Reiniciando contenedor app..." -ForegroundColor Cyan
docker-compose -f docker-compose.local.yml restart app
Write-Host "Listo!" -ForegroundColor Green
Write-Host ""
Write-Host "Panel ngrok:  http://localhost:4040" -ForegroundColor Cyan
Write-Host "API publica:  $publicUrl" -ForegroundColor Cyan
Write-Host "Admin Web:    http://localhost:3001/login" -ForegroundColor Cyan
