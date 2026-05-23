# start-local.ps1
# Orquestador principal: levanta el stack completo (Docker + ngrok) y
# actualiza las URLs de MercadoPago automaticamente.
#
# Uso: .\start-local.ps1

$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BinGo! Local Stack con ngrok" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Verificar .env
$envFile = Join-Path $projectDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env no encontrado." -ForegroundColor Red
    Write-Host "  Ejecuta primero: .\setup-ngrok.ps1"
    exit 1
}

# Leer variables de .env
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

# 2. Verificar que NGROK_AUTHTOKEN esté configurado
if ([string]::IsNullOrWhiteSpace($envVars['NGROK_AUTHTOKEN'])) {
    Write-Host ""
    Write-Host "NGROK_AUTHTOKEN no configurado." -ForegroundColor Yellow
    Write-Host "Ejecuta: .\setup-ngrok.ps1" -ForegroundColor Yellow
    $runSetup = Read-Host "Configurar ahora? (S/n)"
    if ($runSetup -ne 'n') {
        & "$projectDir\setup-ngrok.ps1"
        # Releer .env
        $envVars = @{}
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
            }
        }
    }
}

# 3. Levantar contenedores
Write-Host ""
Write-Host "Levantando contenedores (postgres, redis, app, admin-web, ngrok)..."
Set-Location $projectDir
docker-compose -f docker-compose.local.yml up -d --build

# 4. Esperar a que la API responda
Write-Host ""
Write-Host "Esperando que la API este lista..." -NoNewline
$apiReady = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3010/health/liveness" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { $apiReady = $true; break }
    } catch { }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 2
}

if (-not $apiReady) {
    Write-Host ""
    Write-Host "ADVERTENCIA: La API no respondio en 60s. Verificando logs..." -ForegroundColor Yellow
    docker logs bingo_local_app --tail 20
} else {
    Write-Host " OK" -ForegroundColor Green
}

# 5. Sembrar base de datos
Write-Host ""
Write-Host "Inicializando base de datos..."
try {
    docker exec bingo_local_app node dist/scripts/seed.js
    Write-Host "Base de datos lista." -ForegroundColor Green
} catch {
    Write-Host "Seed ya aplicado o fallo (normal si ya existe)." -ForegroundColor Yellow
}

# 6. Actualizar URLs de MercadoPago con la URL ngrok actual
Write-Host ""
$domain = $envVars['NGROK_DOMAIN']
if (-not [string]::IsNullOrWhiteSpace($domain)) {
    Write-Host "Usando dominio estatico ngrok: $domain" -ForegroundColor Green
} else {
    Write-Host "Detectando URL de ngrok..." -ForegroundColor Cyan
    & "$projectDir\update-mp-urls.ps1"
}

# 7. Mostrar resumen
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Stack BinGo! en linea!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

$ngrokUrl = ""
if (-not [string]::IsNullOrWhiteSpace($domain)) {
    $ngrokUrl = "https://$domain"
} else {
    try {
        $tunnels = (Invoke-RestMethod "http://localhost:4040/api/tunnels").tunnels
        $ngrokUrl = ($tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
    } catch { $ngrokUrl = "(ver http://localhost:4040)" }
}

Write-Host "  API publica (ngrok):  $ngrokUrl" -ForegroundColor Cyan
Write-Host "  Admin Web:            http://localhost:3011/login" -ForegroundColor Cyan
Write-Host "  Panel de colas:       http://localhost:3010/admin/queues" -ForegroundColor Cyan
Write-Host "  Monitor ngrok:        http://localhost:4040" -ForegroundColor Cyan
Write-Host ""

$adminPass = $envVars['ADMIN_DEFAULT_PASSWORD']
if ([string]::IsNullOrWhiteSpace($adminPass)) { $adminPass = "BinGo!Admin2024" }
Write-Host "  Login admin:" -ForegroundColor White
Write-Host "    URL:  http://localhost:3011/login"
Write-Host "    User: admin"
Write-Host "    Pass: $adminPass"
Write-Host ""

# 8. Si WhatsApp no es mock, mostrar instrucciones QR
$waMock = $envVars['WHATSAPP_MOCK']
if ($waMock -eq "false") {
    Write-Host "  WhatsApp QR - escanea con el telefono:" -ForegroundColor Yellow
    Write-Host "    docker logs -f bingo_local_app"
    Write-Host ""
}

Write-Host "  Para detener:  docker-compose -f docker-compose.local.yml down" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Green
