import { Worker } from 'bullmq';
import { connection } from '../queue';
import { WhatsAppService } from '../services/WhatsAppService';
import { logger } from '../utils/logger';

console.log('[WhatsAppInboundWorker] Initializing...');

export const whatsappInboundWorker = new Worker(
  'whatsapp-inbound-queue',
  async (job) => {
    const { from, input } = job.data;
    const logContext = { jobId: job.id, from, input };

    logger.info(logContext, '[WhatsAppInboundWorker] Processing inbound message');
    console.log('[WhatsAppInboundWorker] Processing job:', { from, input });

    try {
      // Simple echo response for testing
      const response = `📱 Mensaje recibido: "${input}"`;

      logger.info({ from, response }, '[WhatsAppInboundWorker] Sending response...');
      await WhatsAppService.sendTextMessage(from, response);

      logger.info(logContext, '[WhatsAppInboundWorker] Response sent successfully');
      console.log('[WhatsAppInboundWorker] Response sent to:', from);
    } catch (error: any) {
      logger.error({ ...logContext, error: error.message }, '[WhatsAppInboundWorker] Failed to process inbound message');
      console.error('[WhatsAppInboundWorker] Error:', error);
      throw error;
    }
  },
  {
    connection,
    limiter: {
      max: 20,
      duration: 1000,
    }
  }
);

console.log('[WhatsAppInboundWorker] Worker created');

whatsappInboundWorker.on('completed', (job) => {
  console.log(`[WhatsAppInboundWorker] Job ${job.id} completed.`);
});

whatsappInboundWorker.on('failed', (job, err) => {
  console.error(`[WhatsAppInboundWorker] Job ${job?.id} failed: ${err.message}`);
});
