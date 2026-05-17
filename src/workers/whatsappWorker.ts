import { Worker } from 'bullmq';
import { connection } from '../queue';
import { WhatsAppService } from '../services/WhatsAppService';
import { logger } from '../utils/logger';

export const whatsappWorker = new Worker(
  'whatsappOutboundQueue',
  async (job) => {
    const { to, text, mediaPath } = job.data;
    const logContext = { jobId: job.id, to };

    logger.info(logContext, `[WhatsAppWorker] Processing outgoing message`);

    try {
      if (mediaPath) {
        await WhatsAppService.sendMediaMessage(to, text, mediaPath);
      } else {
        await WhatsAppService.sendTextMessage(to, text);
      }
      logger.info(logContext, `[WhatsAppWorker] Message sent successfully`);
    } catch (error: any) {
      logger.error({ ...logContext, error: error.message }, `[WhatsAppWorker] Failed to send message`);
      throw error;
    }
  },
  { 
    connection,
    limiter: {
      max: 50,
      duration: 1000,
    }
  }
);

whatsappWorker.on('completed', (job) => {
  console.log(`[WhatsAppWorker] Job ${job.id} completed.`);
});

whatsappWorker.on('failed', (job, err) => {
  console.error(`[WhatsAppWorker] Job ${job?.id} failed: ${err.message}`);
});
