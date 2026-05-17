import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { whatsAppProvider } from '../notifications/providers/WhatsAppWebProvider';
import { query } from '../db';

// High Priority Worker: Faster concurrency, still some rate limiting
export const notifyHighWorker = new Worker('notify-high-queue', async (job: Job) => {
  const { logId, to, text, mediaPath } = job.data;
  
  try {
    if (job.name === 'send_media_notification' && mediaPath) {
      await whatsAppProvider.sendMedia(to, mediaPath, text);
    } else {
      await whatsAppProvider.sendText(to, text);
    }
    
    // Update DB
    if (logId) {
      await query(`UPDATE notification_logs SET status = 'DELIVERED' WHERE id = $1`, [logId]);
    }
  } catch (error: any) {
    if (logId) {
      await query(`UPDATE notification_logs SET status = 'FAILED', error_message = $1 WHERE id = $2`, [error.message, logId]);
    }
    throw error; // Triggers BullMQ retry
  }
}, { 
  connection, 
  concurrency: 5,
  limiter: {
    max: 10, // Max 10 high-priority messages...
    duration: 1000 // ...per second
  }
});

// Bulk Worker: Slower concurrency, strict rate limiting to prevent bans
export const notifyBulkWorker = new Worker('notify-bulk-queue', async (job: Job) => {
  const { to, text } = job.data;
  
  try {
    if (to === 'all_players') {
      // In a real scenario, this worker would fetch all numbers from DB and iterate over them safely
      logger.info(`[NotifyBulkWorker] Simulated broadcast to all players: ${text}`);
    } else {
      await whatsAppProvider.sendText(to, text);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '[NotifyBulkWorker] Failed to send bulk message');
    throw error;
  }
}, { 
  connection, 
  concurrency: 2,
  limiter: {
    max: 2, // Strict: Max 2 bulk messages...
    duration: 1000 // ...per second to protect WhatsApp IP reputation
  }
});

[notifyHighWorker, notifyBulkWorker].forEach(worker => {
  worker.on('failed', (job, err) => {
    logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, 'NotificationWorker failed');
  });
});
