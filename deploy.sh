#!/bin/bash
set -e

APP_DIR="/var/www/bingo"
STABLE_TAG="stable_$(date +'%Y%m%d_%H%M%S')"

echo "🚀 Starting BinGo! deploy sequence [${STABLE_TAG}]..."

# 1. Validate .env
if [ ! -f .env ]; then
  echo "❌ Error: .env file is missing! Copy .env.example and configure it first."
  exit 1
fi

source .env

if [ -z "$ADMIN_JWT_SECRET" ] || [ "$ADMIN_JWT_SECRET" = "changeme-insecure-default" ]; then
  echo "❌ Error: ADMIN_JWT_SECRET is not set or still has the default value."
  echo "   Generate one with: openssl rand -hex 32"
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "⚠️  DOMAIN not set in .env. SSL will not work. Set DOMAIN=tu-dominio.com"
fi

# 2. Git backup tag
echo "📌 Tagging current commit as ${STABLE_TAG}..."
git tag -a "${STABLE_TAG}" -m "Pre-deploy stable backup" 2>/dev/null || true
git push origin "${STABLE_TAG}" 2>/dev/null || echo "⚠️  Could not push tag to remote (skipping)."

# 3. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main || git pull origin master || echo "⚠️  Git pull failed. Using local source."

# 4. Patch nginx config with actual domain
if [ -n "$DOMAIN" ]; then
  echo "🔧 Patching nginx.conf with domain: ${DOMAIN}"
  sed -i "s/DOMAIN/${DOMAIN}/g" nginx/nginx.conf
fi

# 5. Build and start containers
echo "🐳 Building and starting Docker containers..."
docker-compose -f docker-compose.prod.yml down --remove-orphans
docker-compose -f docker-compose.prod.yml up -d --build

# 6. Wait for services
echo "⏳ Waiting for services to become healthy..."
sleep 15

# 7. Run database seed (idempotent)
echo "🌱 Seeding database..."
docker exec bingo_prod_app node dist/scripts/seed.js || echo "⚠️  Seed failed or already configured."

# 8. Reload nginx
echo "🔄 Reloading nginx..."
docker exec bingo_prod_nginx nginx -s reload 2>/dev/null || true

# 9. Health check
echo "🩺 Running health check..."
if curl -sf http://localhost/health/readiness > /dev/null 2>&1; then
  echo "✅ BinGo! is online and healthy!"
else
  echo "❌ Health check failed. Check logs with: docker-compose -f docker-compose.prod.yml logs app"
  exit 1
fi

echo "🎉 Deployment complete! Admin login: https://${DOMAIN:-localhost}"
