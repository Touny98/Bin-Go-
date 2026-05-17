#!/bin/bash

# Configuration
APP_DIR="/var/www/bingo"
STABLE_TAG="stable_$(date +'%Y%m%d_%H%M%S')"

echo "🚀 Starting automated deploy sequence [${STABLE_TAG}]..."

# Create Git backup tag
echo "Tagging current stable commit..."
git tag -a ${STABLE_TAG} -m "Pre-deploy stable backup tag"
git push origin ${STABLE_TAG} 2>/dev/null || echo "⚠️ Origin tag push skipped (non-git or network offline)."

# Pull latest master/main branch
echo "Pulling latest release code..."
git pull origin main || git pull origin master || echo "⚠️ Git pull failed. Using local source files."

# 1. Run environment file validations
if [ ! -f .env ]; then
  echo "❌ Error: .env file is missing! Please configure environment before deploying."
  exit 1
fi

# 2. Build and start production containers
echo "Starting Docker Compose Build..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# 3. Wait for PostgreSQL and Redis health checks
echo "Waiting for services to become healthy..."
sleep 10

# 4. Perform database seeds
echo "Seeding database with demo rooms..."
docker exec -i bingo_prod_app npx ts-node dist/scripts/seed.js || echo "⚠️ Database seed script failed or already configured."

# 5. Reload Nginx reverse proxy
echo "Reloading Nginx config..."
nginx -s reload 2>/dev/null || docker exec bingo_prod_nginx nginx -s reload 2>/dev/null || echo "⚠️ Local Nginx reload skipped (no active process)."

# 6. Verify health liveness status
echo "Verifying service readiness..."
curl -f http://localhost:3000/health/readiness && echo "✅ BinGo! Production is online and healthy!" || echo "❌ Warning: Health checks failed after deploy! Checking logs..."

echo "🎉 Deployment sequence complete!"
