import { Worker, Job } from 'bullmq';
import { connection, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { metaCloudProvider as whatsAppProvider } from '../notifications/providers/MetaCloudProvider';
import { query } from '../db';
import { AudioService } from '../audio/AudioService';
import { acquireLock, releaseLock } from '../utils/redisLock';
import { TrucoTrace } from '../domain/truco/TrucoTrace';

// ── Compuerta FIFO de salida por destinatario ────────────────────────────────
// Los mensajes que llevan `outSeq` (los del Truco, asignados por TrucoNotifier)
// se entregan en ORDEN ESTRICTO por teléfono: el mensaje N+1 no se envía hasta
// que el N fue aceptado por Meta. Esto elimina el desorden por jitter/reintentos
// que el stagger en memoria no podía garantizar. Mensajes SIN `outSeq` (Bingo,
// genéricos) mantienen la entrega directa de siempre.
const OUTBOUND_LOCK_TTL_MS = parseInt(process.env.TRUCO_OUTBOUND_LOCK_TTL_MS || '15000', 10);
const OUTSEQ_TTL_MS = parseInt(process.env.TRUCO_OUTSEQ_TTL_MS || String(6 * 60 * 60 * 1000), 10);
const GATE_RETRY_DELAY_MS = parseInt(process.env.TRUCO_OUTBOUND_GATE_RETRY_MS || '250', 10);
const MAX_GATE_RETRIES = parseInt(process.env.TRUCO_OUTBOUND_GATE_MAX_RETRIES || '60', 10);

const outNextKey = (to: string) => `outnext:${to}`;
const outboundLockKey = (to: string) => `lock:outbound:${to}`;

// Avanza la compuerta de un teléfono más allá de `outSeq`, de forma atómica y
// sólo si no retrocede. Se usa cuando un mensaje se da por perdido (reintentos
// agotados) para no trabar el stream del teléfono.
const ADVANCE_GATE_LUA = `
local cur = redis.call('get', KEYS[1])
if (not cur) or (tonumber(cur) <= tonumber(ARGV[1])) then
  redis.call('set', KEYS[1], tostring(tonumber(ARGV[1]) + 1), 'PX', tonumber(ARGV[2]))
  return 1
end
return 0`;

async function advanceGatePastFailure(to: string, outSeq: number): Promise<void> {
  try {
    await connection.eval(ADVANCE_GATE_LUA, 1, outNextKey(to), outSeq, OUTSEQ_TTL_MS);
  } catch (e: any) {
    logger.warn({ to, outSeq, err: e.message }, '[NotificationWorker] advanceGate falló');
  }
}

// ── Envío puro ────────────────────────────────────────────────────────────────
// Manda el mensaje al proveedor según el tipo de job y devuelve si lo aceptó.
// No toca colas ni logId: eso lo manejan los callers (entrega directa / compuerta).
async function deliver(job: Job): Promise<boolean> {
  const {
    to, text,
    buttons, buttonLabel, sections, title, footer, fallbackText,
    audioNumbers, sessionId, drawOrder, narratorFolder = 'narrador-1',
  } = job.data;

  if (job.name === 'send_audio' && audioNumbers?.length) {
    const buffer = await AudioService.concatBallsAudio(audioNumbers, sessionId, drawOrder, narratorFolder);
    if (buffer) return whatsAppProvider.sendAudio(to, buffer);
    logger.warn({ to, audioNumbers }, '[NotificationWorker] No audio buffer — omitiendo PTT');
    return true;
  }

  if (job.name === 'send_bingo_audio') {
    const buffer = await AudioService.getStaticAudio('bingo', narratorFolder);
    if (buffer) return whatsAppProvider.sendAudio(to, buffer);
    logger.warn({ to }, '[NotificationWorker] No audio de bingo — omitiendo PTT');
    return true;
  }

  if (job.name === 'send_buttons' && buttons?.length) {
    return whatsAppProvider.sendButtons(to, text, buttons, footer);
  }

  if (job.name === 'send_list' && sections?.length) {
    return whatsAppProvider.sendList(to, text, buttonLabel, sections, title, footer);
  }

  // Texto plano (comportamiento por defecto)
  return whatsAppProvider.sendText(to, fallbackText || text);
}

// Re-encola el job para reintentar la compuerta (todavía no es la cabeza FIFO o
// el teléfono está ocupado). Acotado: si se pasa del tope, entrega forzada para
// no perder el mensaje (caso patológico de cabeza trabada).
async function requeueGate(job: Job): Promise<void> {
  const gateRetries = ((job.data._gateRetries as number) ?? 0) + 1;
  if (gateRetries > MAX_GATE_RETRIES) {
    logger.warn(
      { to: job.data.to, outSeq: job.data.outSeq },
      '[NotificationWorker] tope de compuerta → entrega forzada (posible fuera de orden)'
    );
    const ok = await deliver(job);
    await advanceGatePastFailure(job.data.to, job.data.outSeq);
    if (!ok) throw new Error(`Proveedor rechazó (entrega forzada → ${job.data.to})`);
    return;
  }
  TrucoTrace.event('outbound_gate_requeue', {
    phone: job.data.to,
    outSeq: job.data.outSeq,
    jobName: job.name,
  });
  await notifyHighQueue.add(
    job.name,
    { ...job.data, _gateRetries: gateRetries },
    { delay: GATE_RETRY_DELAY_MS }
  );
}

// Entrega ordenada (FIFO por destinatario) de un job con `outSeq`.
async function deliverOrdered(job: Job): Promise<void> {
  const { to, outSeq } = job.data as { to: string; outSeq: number };
  const lockKey = outboundLockKey(to);
  const gateKey = outNextKey(to);

  // Lock por teléfono: sólo una entrega en vuelo por destinatario a la vez.
  const token = await acquireLock(lockKey, OUTBOUND_LOCK_TTL_MS);
  if (!token) {
    await requeueGate(job);
    return;
  }
  try {
    const expectedRaw = await connection.get(gateKey);
    // Self-heal: si no hay puntero (primer mensaje del teléfono o TTL vencido),
    // este job pasa a ser la cabeza.
    const expected = expectedRaw == null ? outSeq : parseInt(expectedRaw, 10);
    if (expectedRaw == null) {
      await connection.set(gateKey, String(expected), 'PX', OUTSEQ_TTL_MS);
    }

    if (outSeq < expected) {
      // Ya entregado / stale → ack sin reenviar.
      TrucoTrace.event('outbound_delivered', { phone: to, outSeq, detail: 'stale-skip' });
      return;
    }
    if (outSeq > expected) {
      // Todavía no es la cabeza → reintentar la compuerta (lock se libera en finally).
      await requeueGate(job);
      return;
    }

    // outSeq === expected → es la cabeza: enviar.
    const ok = await deliver(job);
    if (!ok) {
      // No avanzamos el puntero: el reintento de BullMQ vuelve a ser la cabeza
      // y se reenvía EN ORDEN.
      throw new Error(`Proveedor rechazó (job ${job.name} → ${to})`);
    }
    await connection.set(gateKey, String(expected + 1), 'PX', OUTSEQ_TTL_MS);
    TrucoTrace.event('outbound_delivered', { phone: to, outSeq, jobName: job.name });
  } finally {
    await releaseLock(lockKey, token);
  }
}

// ── High Priority Worker ─────────────────────────────────────────────────────
// Maneja jobs:
//   send_notification → texto plano
//   send_buttons      → botones interactivos (hasta 3)
//   send_list         → lista interactiva
//   send_audio        → nota de voz (PTT)
//   send_bingo_audio  → audio estático de "bingo"
// Los jobs con `outSeq` pasan por la compuerta FIFO por destinatario.
// ─────────────────────────────────────────────────────────────────────────────
export const notifyHighWorker = new Worker('notify-high-queue', async (job: Job) => {
  const { logId, to, outSeq } = job.data;

  try {
    if (outSeq != null && to) {
      // Truco: entrega en orden estricto por teléfono.
      await deliverOrdered(job);
      if (logId) {
        await query(`UPDATE notification_logs SET status = 'DELIVERED' WHERE id = $1`, [logId]);
      }
      return;
    }

    // Resto (Bingo, genéricos): entrega directa, comportamiento de siempre.
    const ok = await deliver(job);
    if (!ok) {
      throw new Error(`Proveedor rechazó el envío (job ${job.name} → ${to})`);
    }
    if (logId) {
      await query(`UPDATE notification_logs SET status = 'DELIVERED' WHERE id = $1`, [logId]);
    }
  } catch (error: any) {
    logger.error({ to, jobName: job.name, err: error.message }, '[NotificationWorker] Error enviando mensaje');
    if (logId) {
      await query(
        `UPDATE notification_logs SET status = 'FAILED', error_message = $1 WHERE id = $2`,
        [error.message, logId]
      );
    }
    throw error; // Dispara el retry de BullMQ
  }
}, {
  connection,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
});

// ── Bulk Worker ──────────────────────────────────────────────────────────────
export const notifyBulkWorker = new Worker('notify-bulk-queue', async (job: Job) => {
  const { to, text } = job.data;

  try {
    if (to === 'all_players') {
      logger.info(`[NotifyBulkWorker] Broadcast simulado a todos: ${text}`);
    } else {
      await whatsAppProvider.sendText(to, text);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '[NotifyBulkWorker] Error en mensaje masivo');
    throw error;
  }
}, {
  connection,
  concurrency: 2,
  limiter: {
    max: 2,
    duration: 1000,
  },
});

notifyHighWorker.on('failed', (job, err) => {
  logger.error({ queue: notifyHighWorker.name, jobId: job?.id, err: err.message }, 'NotificationWorker failed');

  // Si era un mensaje ordenado (Truco) y agotó los reintentos, avanzamos la
  // compuerta para no trabar el stream del teléfono. El reprompt por timeout de
  // turno es la red de seguridad que reenvía el prompt perdido.
  const to = job?.data?.to as string | undefined;
  const outSeq = job?.data?.outSeq as number | undefined;
  if (to && outSeq != null) {
    const attempts = (job?.opts?.attempts as number) ?? 1;
    if ((job?.attemptsMade ?? 0) >= attempts) {
      void advanceGatePastFailure(to, outSeq);
      TrucoTrace.event('critical_delivery_failed', {
        phone: to, outSeq, jobName: job?.name, reason: err.message,
      });
    } else {
      TrucoTrace.event('outbound_retry', {
        phone: to, outSeq, attempt: job?.attemptsMade, reason: err.message,
      });
    }
  }
});

notifyBulkWorker.on('failed', (job, err) => {
  logger.error({ queue: notifyBulkWorker.name, jobId: job?.id, err: err.message }, 'NotificationWorker failed');
});
