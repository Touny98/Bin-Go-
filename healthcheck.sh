#!/bin/bash

# Configuration
API_PORT=${PORT:-3000}
DB_USER=${POSTGRES_USER:-"bingo_user"}
DB_NAME=${POSTGRES_DB:-"bingo_db"}

echo "🔍 Initiating System Health Audit..."

# 1. Check Node App Liveness & Readiness
echo -n "Checking App Liveness... "
CURL_LIVE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${API_PORT}/health/liveness)
if [ "$CURL_LIVE" -eq 200 ]; then
  echo "✅ OK (200)"
else
  echo "❌ FAILED ($CURL_LIVE)"
  exit 1
fi

echo -n "Checking App Readiness... "
CURL_READY=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${API_PORT}/health/readiness)
if [ "$CURL_READY" -eq 200 ]; then
  echo "✅ OK (200)"
else
  echo "❌ FAILED ($CURL_READY)"
  exit 1
fi

# 2. Check Postgres DB Connection
echo -n "Verifying Postgres Integrity... "
DB_PING=$(docker exec bingo_prod_postgres pg_isready -U ${DB_USER} -d ${DB_NAME} 2>/dev/null)
if [[ $DB_PING == *"accepting connections"* ]]; then
  echo "✅ ONLINE"
else
  echo "❌ OFFLINE"
  exit 1
fi

# 3. Check Redis Connection
echo -n "Verifying Redis Connection... "
REDIS_PING=$(docker exec bingo_prod_redis redis-cli ping 2>/dev/null)
if [ "$REDIS_PING" = "PONG" ]; then
  echo "✅ PONG"
else
  echo "❌ OFFLINE"
  exit 1
fi

echo "🎉 All systems are healthy and operational!"
exit 0
