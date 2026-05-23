# setup-ngrok.ps1
# Configura ngrok en el proyecto BinGo! leyendo el authtoken del usuario
# y opcionalmente el dominio estático gratuito.
#
# Uso: .\setup-ngrok.ps1

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot ".env"

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "  BinGo! — Configuracion ngrok" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Necesitas una cuenta gratuita en https://ngrok.com"
Write-Host "Una vez registrado, tu authtoken esta en:"
Write-Host "  https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor Yellow
Write-Host ""

# 1. Pedir authtoken
$authtoken = Read-Host "Pega tu NGROK_AUTHTOKEN aqui"
if ([string]::IsNullOrWhiteSpace($authtoken)) {
    Write-Host "ERROR: El authtoken no puede estar vacio." -ForegroundColor Red
    exit 1
}

# 2. Pedir dominio estático (opcional)
Write-Host ""
Write-Host "Dominio estatico gratuito (opcional, pero recomendado)."
Write-Host "Crealo en: https://dashboard.ngrok.com/domains" -ForegroundColor Yellow
Write-Host "Ejemplo:   bingo-tuapodo.ngrok-free.app"
Write-Host "Deja en blanco para usar URL temporal (cambia cada reinicio)."
Write-Host ""
$domain = Read-Host "Tu dominio ngrok (Enter para omitir)"

# 3. Leer .env actual
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env no encontrado. Copia .env.example primero." -ForegroundColor Red
    exit 1
}
$envContent = Get-Content $envFile -Raw

# 4. Helper: actualizar o agregar una variable en .env
function Set-EnvVar {
    param([string]$content, [string]$key, [string]$value)
    if ($content -match "(?m)^$key=") {
        return $content -replace "(?m)^$key=.*", "$key=$value"
    } else {
        return $content.TrimEnd() + "`n$key=$value`n"
    }
}

# 5. Escribir authtoken y dominio en .env
$envContent = Set-EnvVar $envContent "NGROK_AUTHTOKEN" $authtoken

if (-not [string]::IsNullOrWhiteSpace($domain)) {
    $envContent = Set-EnvVar $envContent "NGROK_DOMAIN" $domain
    # Pre-cargar las URLs de MP con el dominio estático
    $envContent = Set-EnvVar $envContent "MP_BACK_URL_SUCCESS"  "https://$domain/success"
    $envContent = Set-EnvVar $envContent "MP_BACK_URL_PENDING"  "https://$domain/pending"
    $envContent = Set-EnvVar $envContent "MP_BACK_URL_FAILURE"  "https://$domain/failure"
    $envContent = Set-EnvVar $envContent "MP_WEBHOOK_URL"       "https://$domain/api/payments/webhook"
    Write-Host ""
    Write-Host "URLs de MercadoPago configuradas con el dominio estatico." -ForegroundColor Green
} else {
    $envContent = Set-EnvVar $envContent "NGROK_DOMAIN" ""
    Write-Host ""
    Write-Host "NOTA: Al usar URL temporal, ejecuta update-mp-urls.ps1 cada vez" -ForegroundColor Yellow
    Write-Host "      que arranques ngrok para actualizar las URLs de MercadoPago." -ForegroundColor Yellow
}

Set-Content -Path $envFile -Value $envContent -Encoding utf8
Write-Host ""
Write-Host "OK: .env actualizado con las credenciales de ngrok." -ForegroundColor Green
Write-Host ""
Write-Host "Proximo paso — levanta el stack:" -ForegroundColor Cyan
Write-Host "  docker-compose -f docker-compose.local.yml up -d --build"
Write-Host ""
Write-Host "Luego verifica el tunel en: http://localhost:4040" -ForegroundColor Cyan
