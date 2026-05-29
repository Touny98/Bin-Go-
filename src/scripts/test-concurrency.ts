/* eslint-disable no-console */
/**
 * Prueba de concurrencia y orden — valida los primitivos nuevos del fix de
 * Truco contra un Redis real (NO requiere Postgres ni WhatsApp).
 *
 * Ejecutar:  npx ts-node --transpile-only src/scripts/test-concurrency.ts
 *
 * Cubre:
 *  1. Lock fencing (acquire/release/extend) — base del anti-race.
 *  2. Orden FIFO de salida por destinatario — replica EXACTAMENTE el algoritmo
 *     de deliverOrdered() del NotificationWorker (mismo lock, mismas claves
 *     outseq/outnext, misma comparación) con jitter de "red" que antes
 *     desordenaba los mensajes. Incluye un CONTROL sin compuerta para mostrar
 *     que sin el fix SÍ se desordena.
 */
import { strict as assert } from 'assert';
import { connection } from '../queue';
import { acquireLock, releaseLock, extendLock } from '../utils/redisLock';

const jitter = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));

async function testFencingLock(): Promise<void> {
  console.log('\n── 1. Lock fencing ─────────────────────────────────');
  const key = `__conc_test__:lock:${Date.now()}`;

  const t1 = await acquireLock(key, 5000);
  assert.ok(t1, 'primer acquire debe conseguir el lock');

  const t2 = await acquireLock(key, 5000);
  assert.equal(t2, null, 'segundo acquire (lock tomado) debe fallar');

  const wrong = await releaseLock(key, 'token-ajeno');
  assert.equal(wrong, false, 'release con token ajeno NO debe borrar');

  const t3 = await acquireLock(key, 5000);
  assert.equal(t3, null, 'sigue tomado tras release fallido');

  const ext = await extendLock(key, t1!, 8000);
  assert.equal(ext, true, 'extend con token correcto debe renovar');
  const extWrong = await extendLock(key, 'token-ajeno', 8000);
  assert.equal(extWrong, false, 'extend con token ajeno NO debe renovar');

  const ok = await releaseLock(key, t1!);
  assert.equal(ok, true, 'release con token correcto debe liberar');

  const t4 = await acquireLock(key, 5000);
  assert.ok(t4, 're-acquire tras liberar debe conseguirlo');
  await releaseLock(key, t4!);

  console.log('   ✓ fencing OK: nadie pisa el lock de otro, release/extend por token');
}

// ── Réplica fiel de la compuerta FIFO del NotificationWorker ──────────────────
const OUTSEQ_TTL_MS = 60_000;
const outNextKey = (to: string) => `outnext:${to}`;
const outboundLockKey = (to: string) => `lock:outbound:${to}`;

interface OutJob { to: string; outSeq: number; }

/**
 * Mirror de deliverOrdered(): entrega sólo si el job es la cabeza FIFO de su
 * teléfono; si no, devuelve 'requeue'. El "envío" real se reemplaza por
 * empujar a `delivered` (con jitter), que es justo lo que queremos medir.
 */
async function gateDeliver(job: OutJob, delivered: number[]): Promise<'done' | 'requeue'> {
  const token = await acquireLock(outboundLockKey(job.to), 15_000);
  if (!token) return 'requeue';
  try {
    const expectedRaw = await connection.get(outNextKey(job.to));
    const expected = expectedRaw == null ? job.outSeq : parseInt(expectedRaw, 10);
    if (expectedRaw == null) {
      await connection.set(outNextKey(job.to), String(expected), 'PX', OUTSEQ_TTL_MS);
    }
    if (job.outSeq < expected) return 'done'; // stale
    if (job.outSeq > expected) return 'requeue'; // todavía no es la cabeza
    // es la cabeza → "enviar"
    await jitter(); // latencia de red que antes desordenaba
    delivered.push(job.outSeq);
    await connection.set(outNextKey(job.to), String(expected + 1), 'PX', OUTSEQ_TTL_MS);
    return 'done';
  } finally {
    await releaseLock(outboundLockKey(job.to), token);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function testOrderedDelivery(): Promise<void> {
  console.log('\n── 2. Orden FIFO de salida por destinatario ────────');
  const N = 200;
  const WORKERS = 8;
  const to = `__conc_test__:phone:${Date.now()}`;

  await connection.del(outNextKey(to));
  await connection.del(`outseq:${to}`);
  await connection.del(outboundLockKey(to));

  // Producer: asigna outSeq 1..N replicando nextOutSeq() (INCR + init de la
  // cabeza de la compuerta en 1 al nacer el stream).
  const jobs: OutJob[] = [];
  for (let i = 0; i < N; i++) {
    const seq = await connection.incr(`outseq:${to}`);
    if (seq === 1) await connection.set(outNextKey(to), '1', 'PX', OUTSEQ_TTL_MS);
    jobs.push({ to, outSeq: seq });
  }

  // CONTROL: entrega en orden barajado SIN compuerta → debe desordenarse.
  const controlOrder = shuffle(jobs).map((j) => j.outSeq);
  const inOrder = (a: number[]) => a.every((v, i) => v === i + 1);
  assert.equal(inOrder(controlOrder), false, 'el control barajado debe estar desordenado');
  console.log(`   • control sin compuerta: desordenado (ej. primeros 5: ${controlOrder.slice(0, 5).join(',')})`);

  // CON COMPUERTA: cola compartida barajada + WORKERS consumidores concurrentes.
  const queue = shuffle(jobs);
  const delivered: number[] = [];
  let active = N;

  async function worker(): Promise<void> {
    while (active > 0) {
      const job = queue.shift();
      if (!job) { await jitter(); continue; }
      const res = await gateDeliver(job, delivered);
      if (res === 'requeue') {
        queue.push(job); // re-encolar (como hace requeueGate)
        await new Promise((r) => setTimeout(r, 2));
      } else {
        active--;
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  console.log(`   • con compuerta: entregados ${delivered.length}/${N}`);
  assert.equal(delivered.length, N, 'deben entregarse todos los mensajes (cero pérdida)');
  assert.ok(inOrder(delivered), 'la entrega DEBE estar en orden estricto 1..N por destinatario');
  // sin duplicados
  assert.equal(new Set(delivered).size, N, 'no debe haber duplicados');

  await connection.del(outNextKey(to), `outseq:${to}`, outboundLockKey(to));
  console.log(`   ✓ ${WORKERS} consumidores concurrentes + jitter → orden estricto, sin pérdida ni duplicados`);
}

async function main(): Promise<void> {
  console.log('🧪 Test de concurrencia y orden (Redis real)');
  await testFencingLock();
  await testOrderedDelivery();
  console.log('\n🧪 Concurrencia — OK ✅');
  await connection.quit().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Concurrencia FAILED');
  console.error(err);
  connection.quit().catch(() => {}).finally(() => process.exit(1));
});
