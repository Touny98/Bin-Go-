#!/bin/bash
set -e

DOMAIN=${1:-$DOMAIN}
EMAIL=${2:-$ADMIN_EMAIL}

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: ./certbot-init.sh <dominio> <email>"
  echo "  o configura DOMAIN y ADMIN_EMAIL en .env"
  exit 1
fi

echo "🔒 Requesting Let's Encrypt certificate for ${DOMAIN}..."

# Asegurarse de que nginx esté corriendo para el challenge webroot
docker exec bingo_prod_nginx nginx -t

# Solicitar certificado con webroot challenge
docker run --rm \
  -v "$(pwd)_letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)_certbot_webroot:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}"

echo "✅ Certificate issued for ${DOMAIN}!"
echo "🔄 Reloading nginx to activate SSL..."
docker exec bingo_prod_nginx nginx -s reload

echo ""
echo "🎉 SSL configured! Your site is now at: https://${DOMAIN}"
echo "   Auto-renewal runs every 12h via the certbot container."
