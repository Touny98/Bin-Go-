#!/bin/bash

# Configuration
BACKUP_DIR="/backups"

echo "⏪ Initiating Emergency Rollback Sequence..."

# 1. Identify last stable tag
LAST_STABLE_TAG=$(git tag -l "stable_*" | sort -V | tail -n 1)

if [ -z "${LAST_STABLE_TAG}" ]; then
  echo "⚠️ No stable git backup tags found! Finding previous git commit..."
  git checkout HEAD~1
else
  echo "Found last stable release tag: ${LAST_STABLE_TAG}"
  git checkout ${LAST_STABLE_TAG}
fi

# 2. Re-trigger container rebuild
echo "Re-building and starting stable container configurations..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# 3. Database Restore prompt
LATEST_DUMP=$(ls -t ${BACKUP_DIR}/postgres_*.dump 2>/dev/null | head -n 1)
if [ ! -z "${LATEST_DUMP}" ]; then
  echo "Found database dump backup: ${LATEST_DUMP}"
  read -p "Do you want to restore the database to this backup state? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restoring database..."
    # Drop and recreate database or use pg_restore
    docker exec -i bingo_prod_postgres pg_restore -U bingo_user -d bingo_db -c -v < ${LATEST_DUMP}
    echo "Database restored successfully."
  fi
fi

echo "✅ Emergency Rollback completed. Running health checks..."
sleep 5
curl -f http://localhost:3000/health/readiness && echo "✅ Stable build is back online!" || echo "⚠️ Warning: Health checks are still failing. Check 'docker logs bingo_prod_app'."
