import { Worker } from 'bullmq';
import { connection } from '../../queue';
import { logger } from '../../utils/logger';
import { RetentionMetrics } from '../metrics/Retention';
import { JackpotEffect } from '../economy/JackpotEffect';

export const analyticsWorker = new Worker(
  'analyticsQueue',
  async (job) => {
    const { eventType, data } = job.data;
    logger.info({ eventType, data }, `[AnalyticsWorker] Ingesting event`);

    try {
      switch (eventType) {
        case 'ticket.purchase':
          // 1. DAU Tracking & ARPU
          await RetentionMetrics.trackActiveUser(data.userId);
          await RetentionMetrics.trackRevenue(data.amount);

          // 2. Closed-loop: Jackpot Effect
          // Note: Mocking jackpot size for now, in reality fetch from DB
          const currentJackpot = 550000; 
          const mockRecentPurchases = 15;
          await JackpotEffect.analyzePurchase(data.roomId, currentJackpot, mockRecentPurchases);
          
          break;

        case 'user.interaction':
          // 1. DAU Tracking (Even if they didn't buy, they are active)
          await RetentionMetrics.trackActiveUser(data.userId);
          // Could also track conversational CTR here
          break;

        default:
          logger.warn({ eventType }, `[AnalyticsWorker] Unknown event type`);
      }
    } catch (error: any) {
      logger.error({ error: error.message }, `[AnalyticsWorker] Failed to process event`);
      throw error;
    }
  },
  { connection }
);

analyticsWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, eventType: job.data.eventType }, `[AnalyticsWorker] Event processed successfully`);
});

analyticsWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, `[AnalyticsWorker] Event processing failed`);
});
