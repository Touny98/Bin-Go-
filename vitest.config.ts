import { defineConfig } from 'vitest/config';

// Conexión a la DB de test. Por defecto apunta a `bingo_test` en el Postgres local
// (mismo contenedor que dev, base distinta). Override con TEST_DATABASE_URL en CI.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://bingo_user:bingo_password@localhost:5432/bingo_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Los tests de dinero comparten una sola DB y deben correr en serie
    // (sin paralelismo entre archivos) para que el TRUNCATE por test sea determinista.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      WHATSAPP_MOCK: 'true',
      // dotenv.config() NO sobreescribe vars ya presentes, así que estas ganan sobre .env.
      DATABASE_URL: TEST_DATABASE_URL,
      // .env apunta a `redis:6379` (hostname interno de Docker) que no resuelve desde el host.
      // Algunos servicios importan src/queue.ts (crea colas BullMQ al cargar) → apuntamos al Redis expuesto.
      REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379',
    },
  },
});
