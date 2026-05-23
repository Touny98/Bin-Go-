#!/bin/bash
set -e

echo "🚀 BinGo! Local Stack (modo ngrok)"
echo "=================================="

# 1. Validar .env
if [ ! -f .env ]; then
  echo "❌ .env no encontrado. Copiando .env.example..."
  cp .env.example .env
  echo "   Edita .env antes de continuar."
  exit 1
fi

# 2. Levantar contenedores
echo ""
echo "🐳 Levantando postgres, redis, api y admin-web..."
docker-compose -f docker-compose.local.yml up -d --build

# 3. Esperar a que la API esté lista
echo ""
echo "⏳ Esperando que la API esté lista..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health/liveness > /dev/null 2>&1; then
    echo "✅ API online!"
    break
  fi
  echo -n "."
  sleep 2
done

# 4. Sembrar base de datos
echo ""
echo "🌱 Inicializando base de datos..."
docker exec bingo_local_app node dist/scripts/seed.js && echo "✅ Base de datos lista!" || echo "⚠️  Seed ya aplicado o falló."

# 5. Mostrar credenciales admin
echo ""
echo "════════════════════════════════════════"
echo "✅ Stack corriendo:"
echo "   API:        http://localhost:3000"
echo "   Admin Web:  http://localhost:3001"
echo "   Bull Board: http://localhost:3000/admin/queues"
echo ""
echo "👤 Login admin:"
echo "   URL:  http://localhost:3001/login"
echo "   User: admin"
echo "   Pass: $(grep ADMIN_DEFAULT_PASSWORD .env | cut -d= -f2)"
echo "════════════════════════════════════════"
echo ""
echo "📡 PRÓXIMO PASO — Exponer API con ngrok:"
echo ""
echo "   1. Instala ngrok: https://ngrok.com/download"
echo "   2. Autentícate:   ngrok config add-authtoken TU_TOKEN"
echo "   3. Obtén tu dominio estático gratuito en: https://dashboard.ngrok.com/domains"
echo "   4. Ejecuta:       ngrok http --domain=TU-DOMINIO.ngrok-free.app 3000"
echo ""
echo "   Luego actualiza en .env:"
echo "   MP_WEBHOOK_URL=https://TU-DOMINIO.ngrok-free.app/api/payments/webhook"
echo "   MP_BACK_URL_SUCCESS=https://TU-DOMINIO.ngrok-free.app/success"
echo "   MP_BACK_URL_PENDING=https://TU-DOMINIO.ngrok-free.app/pending"
echo "   MP_BACK_URL_FAILURE=https://TU-DOMINIO.ngrok-free.app/failure"
echo ""
echo "   Y reinicia: docker-compose -f docker-compose.local.yml restart app"
echo "════════════════════════════════════════"

# 6. Si WHATSAPP_MOCK=false, mostrar QR
WA_MOCK=$(grep WHATSAPP_MOCK .env | cut -d= -f2 | tr -d ' ')
if [ "$WA_MOCK" = "false" ]; then
  echo ""
  echo "📱 WhatsApp QR (escanea desde tu teléfono):"
  echo "   docker logs -f bingo_local_app"
fi
