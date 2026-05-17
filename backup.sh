#!/bin/bash

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=7

# Credentials (will fallback to defaults if not set)
DB_USER=${POSTGRES_USER:-"bingo_user"}
DB_NAME=${POSTGRES_DB:-"bingo_db"}

echo "🚀 Starting BinGo! Persistent Backup Sequence [${TIMESTAMP}]..."

# Create backup directory if not exists
mkdir -p ${BACKUP_DIR}

# 1. Postgres Database Dump
echo "Backing up Postgres database: ${DB_NAME}..."
docker exec bingo_prod_postgres pg_dump -U ${DB_USER} -d ${DB_NAME} -F c -b -v -f ${BACKUP_DIR}/postgres_${DB_NAME}_${TIMESTAMP}.dump

# 2. Redis AOF/RDB Backup
echo "Triggering Redis SAVE snapshot..."
docker exec bingo_prod_redis redis-cli SAVE

echo "Backing up Redis data volume..."
tar -czf ${BACKUP_DIR}/redis_${TIMESTAMP}.tar.gz -C /var/lib/docker/volumes/bingo_prod_redis_prod_data/_data . 2>/dev/null || \
docker run --rm -v bingo_prod_redis_prod_data:/data -v ${BACKUP_DIR}:/backup alpine tar -czf /backup/redis_${TIMESTAMP}.tar.gz -C /data .

# 3. Clean up old backups (older than RETENTION_DAYS days)
echo "Enforcing backup retention policy (Cleaning files older than ${RETENTION_DAYS} days)..."
find ${BACKUP_DIR} -type f -mtime +${RETENTION_DAYS} -name "*.dump" -exec rm -f {} \;
find ${BACKUP_DIR} -type f -mtime +${RETENTION_DAYS} -name "*.tar.gz" -exec rm -f {} \;

echo "✅ Persistent Backup Sequence completed successfully!"
