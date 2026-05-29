import { Worker } from 'bullmq';
import { connection, whatsappOutboundQueue, analyticsQueue } from '../queue';
import { BingoEngine } from '../engine/BingoGame';
import { query } from '../db';
import { buildCardBlock } from '../utils/cardFormatter';
import { logger } from '../utils/logger';

export const paymentWorker = new Worker(
  'paymentQueue',
  async (job) => {
    const { paymentId, externalRef, amount } = job.data;
    const logContext = { jobId: job.id, paymentId, externalRef };
    
    logger.info(logContext, `[PaymentWorker] Processing payment`);

    try {
      // 1. Assign cards (Mock logic for now)
      const userPhone = externalRef;
      const cardMatrix = BingoEngine.generateCard();
      
      // We should insert into DB here and get the card ID
      const mockCardId = Math.floor(Math.random() * 1000);

      logger.info(logContext, `[PaymentWorker] Generated card for ${userPhone}`);

      // 2. Enqueue WhatsApp notification with text card
      const cardText = `✅ ¡Pago acreditado! Aquí tienes tu cartón:\n\n${buildCardBlock(cardMatrix, new Set())}\n\nEl sorteo comenzará en breve. ¡Mucha suerte!`;
      await whatsappOutboundQueue.add('sendNotification', {
        to: userPhone,
        text: cardText,
      });

      logger.info(logContext, `[PaymentWorker] Enqueued WA notification for ${userPhone}`);

      // 4. Fire Analytics Event
      await analyticsQueue.add('analytics_event', {
        eventType: 'ticket.purchase',
        data: {
          userId: userPhone,
          amount: parseFloat(amount),
          roomId: 1 // Mock roomId
        }
      });

    } catch (error: any) {
      logger.error({ ...logContext, error: error.message }, `[PaymentWorker] Error processing job`);
      throw error;
    }
  },
  { connection }
);

paymentWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, `[PaymentWorker] Job has completed!`);
});

paymentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, `[PaymentWorker] Job has failed`);
});
