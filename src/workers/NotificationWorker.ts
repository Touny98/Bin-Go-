import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { metaCloudProvider as whatsAppProvider } from '../notifications/providers/MetaCloudProvider';
import { query } from '../db';
import { AudioService } from '../audio/AudioService';

// ── High Priority Worker ─────────────────────────────────────────────────────
// Maneja cinco tipos de jobs:
//   send_notification       → texto plano
//   send_buttons            → mensaje con botones interactivos (hasta 3)
//   send_list               → mensaje de lista interactiva
//   send_audio              → nota de voz (PTT)
//   send_media_notification → imagen local (se sube a Meta automáticamente)
// ─────────────────────────────────────────────────────────────────────────────
export const notifyHighWorker = new Worker('notify-high-queue', async (job: Job) => {
  const {
    logId, to, text, mediaPath,
    buttons, buttonLabel, sections, title, footer, fallbackText,
    audioNumbers, sessionId, drawOrder, narratorFolder = 'narrador-1',
  } = job.data;

  try {
    if (job.name === 'send_media_notification' && mediaPath) {
      // Imagen: si es path local MetaCloudProvider hace el upload automáticamente
      await whatsAppProvider.sendImage(to, mediaPath, text);

    } else if (job.name === 'send_audio' && audioNumbers?.length) {
      // Nota de voz PTT
      const buffer = await AudioService.concatBallsAudio(audioNumbers, sessionId, drawOrder, narratorFolder);
      if (buffer) {
        await whatsAppProvider.sendAudio(to, buffer);
      } else {
        logger.warn({ to, audioNumbers }, '[NotificationWorker] No audio buffer — omitiendo PTT');
      }

    } else if (job.name === 'send_bingo_audio') {
      const buffer = await AudioService.getStaticAudio('bingo', narratorFolder);
      if (buffer) {
        await whatsAppProvider.sendAudio(to, buffer);
      } else {
        logger.warn({ to }, '[NotificationWorker] No audio de bingo — omitiendo PTT');
      }

    } else if (job.name === 'send_buttons' && buttons?.length) {
      // Botones interactivos — Meta Cloud API los soporta nativamente
      await whatsAppProvider.sendButtons(to, text, buttons, footer);

    } else if (job.name === 'send_list' && sections?.length) {
      // Lista interactiva — Meta Cloud API la soporta nativamente
      await whatsAppProvider.sendList(to, text, buttonLabel, sections, title, footer);

    } else {
      // Texto plano (comportamiento por defecto)
      await whatsAppProvider.sendText(to, fallbackText || text);
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
    throw error; // Triggers BullMQ retry
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

[notifyHighWorker, notifyBulkWorker].forEach(worker => {
  worker.on('failed', (job, err) => {
    logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, 'NotificationWorker failed');
  });
});
