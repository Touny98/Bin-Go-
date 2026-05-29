import { Worker, Job } from 'bullmq';
import { connection, whatsappInboundQueue } from '../queue';
import { logger } from '../utils/logger';
import {
  ConversationBusyError,
  ConversationOrchestrator,
} from '../conversation/ConversationOrchestrator';

// Re-encolado cuando el usuario está ocupado (otro mensaje suyo en proceso).
// Delay corto: apenas se libera el lock, el mensaje se procesa, preservando el
// orden por-usuario. Tope acotado para no reintentar para siempre si algo se
// traba de verdad.
const BUSY_RETRY_DELAY_MS = parseInt(process.env.CONVERSATION_BUSY_RETRY_MS || '300', 10);
const MAX_BUSY_RETRIES = parseInt(process.env.CONVERSATION_BUSY_MAX_RETRIES || '30', 10);

export const conversationWorker = new Worker('whatsapp-inbound-queue', async (job: Job) => {
  const { from, input, messageId, _busyRetries = 0 } = job.data as {
    from: string;
    input: string;
    messageId?: string;
    _busyRetries?: number;
  };

  logger.info({ from, input, messageId, busyRetries: _busyRetries }, `[ConversationWorker] Processing inbound message from ${from}`);

  try {
    await ConversationOrchestrator.processMessage(from, input, messageId);
  } catch (error: any) {
    // El usuario ya tenía un mensaje en proceso → NO descartamos: re-encolamos
    // con un pequeño delay para procesarlo apenas se libere, en orden.
    if (error instanceof ConversationBusyError) {
      if (_busyRetries < MAX_BUSY_RETRIES) {
        logger.debug(
          { from, messageId, nextRetry: _busyRetries + 1 },
          '[ConversationWorker] usuario ocupado → re-encolando input'
        );
        // Sin jobId: el dedupe de ingreso (wa:seen / jobId wa-*) ya validó la
        // unicidad; un jobId determinista acá colisionaría con el original.
        await whatsappInboundQueue.add(
          'inbound_message',
          { from, input, messageId, _busyRetries: _busyRetries + 1 },
          { delay: BUSY_RETRY_DELAY_MS, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 }
        );
      } else {
        logger.warn(
          { from, messageId, retries: _busyRetries },
          '[ConversationWorker] se agotaron los reintentos por ocupado — input descartado'
        );
      }
      // Job actual completa OK (no failed): el reintento vive en el job nuevo.
      return;
    }

    logger.error({ from, error: error.message }, '[ConversationWorker] Failed to process message');
    throw error;
  }

}, {
  connection,
  concurrency: 10,
  // Protección contra flood/spam a nivel worker.
  limiter: {
    max: 20,
    duration: 1000
  }
});

conversationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'ConversationWorker failed');
});
