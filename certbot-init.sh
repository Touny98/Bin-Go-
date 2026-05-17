#!/bin/bash

# Configuration
DOMAIN=${1:-"bingo-whatsapp.com"}
EMAIL=${2:-"admin@bingo-whatsapp.com"}

echo "🔒 Starting Let's Encrypt Certbot Automator for ${DOMAIN}..."

# 1. Install certbot and dependencies if not available
if ! command -v certbot &> /dev/null; then
  echo "Installing certbot..."
  sudo apt-get update
  sudo apt-get install -y certbot python3-certbot-nginx
fi

# 2. Stop Nginx to release port 80 during initial standalone request, or use Nginx plugin
echo "Requesting SSL certificate..."
sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m ${EMAIL} --redirect

# 3. Add auto-renew cron job (runs every day at midnight to check renewal necessity)
echo "Setting up cron renewal automation..."
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet && nginx -s reload") | crontab -

echo "✅ Let's Encrypt SSL successfully configured for ${DOMAIN}!"
