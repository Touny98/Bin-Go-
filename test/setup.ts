import { beforeEach } from 'vitest';
import { query } from '../src/db';

const EXPECTED_DB = process.env.TEST_DB_NAME || 'bingo_test';

// SALVAGUARDA CRÍTICA: nunca truncar una base que no sea la de test.
// Si la precedencia de env fallara y conectáramos a dev/prod, esto aborta TODO
// antes de borrar un solo dato real.
async function assertTestDatabase() {
  const res = await query('SELECT current_database() AS db');
  const db = res.rows[0]?.db;
  if (db !== EXPECTED_DB) {
    throw new Error(
      `[test] ABORTADO: conectado a la base "${db}" pero se esperaba "${EXPECTED_DB}". ` +
        `Revisá DATABASE_URL/TEST_DATABASE_URL. NO se truncó nada.`
    );
  }
}

// Aislamiento por test: vacía TODAS las tablas del esquema público antes de cada test
// y reinicia las secuencias. Es más simple y robusto que envolver cada test en una
// transacción, porque el código de producción usa el pool directamente (sin inyectar client).
async function truncateAll() {
  await assertTestDatabase();
  const res = await query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  if (res.rowCount === 0) return;
  const tables = res.rows.map((r: any) => `"${r.tablename}"`).join(', ');
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  await truncateAll();
});
