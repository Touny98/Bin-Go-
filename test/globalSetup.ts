import { Pool } from 'pg';

// Se ejecuta UNA vez antes de toda la suite (en el proceso principal de Vitest).
// 1) Crea la base `bingo_test` si no existe.
// 2) Construye el esquema con initDb() apuntando a esa base.
//
// IMPORTANTE: fijamos DATABASE_URL ANTES de importar src/db para que su pool
// (creado a nivel de módulo) quede ligado a la base de test y no a la de dev.

const TEST_DB = process.env.TEST_DB_NAME || 'bingo_test';
const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ||
  'postgres://bingo_user:bingo_password@localhost:5432/postgres';
const TEST_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://bingo_user:bingo_password@localhost:5432/bingo_test';

export default async function setup() {
  // 1) Crear la base de test si falta (conectado a la base de mantenimiento `postgres`)
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
    if (exists.rowCount === 0) {
      // No se puede parametrizar el nombre de DB en CREATE DATABASE.
      await admin.query(`CREATE DATABASE ${TEST_DB}`);
      // eslint-disable-next-line no-console
      console.log(`[test] base de datos "${TEST_DB}" creada`);
    }
  } finally {
    await admin.end();
  }

  // 2) Construir el esquema en la base de test
  process.env.DATABASE_URL = TEST_URL;
  const { initDb, closePool } = await import('../src/db');
  await initDb();
  await closePool();
}
