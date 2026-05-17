import { Worker, Job, Queue } from 'bullmq';
import { connection, notifyBulkQueue } from '../queue';
import { logger } from '../utils/logger';
import { SegmentationService } from '../crm/SegmentationService';

export const campaignQueue = new Queue('campaign-queue', { connection });

export const campaignWorker = new Worker('campaign-queue', async (job: Job) => {
  const { segment, message, campaignId } = job.data;
  
  logger.info({ segment, campaignId }, '[CampaignWorker] Starting campaign execution');

  try {
    const audience = await SegmentationService.getAudience(segment);
    
    for (const userId of audience) {
      // Enqueue to the rate-limited bulk queue
      await notifyBulkQueue.add('campaign_message', {
        to: userId,
        text: message,
        campaignId
      });
    }

    logger.info({ campaignId, audienceCount: audience.length }, '[CampaignWorker] Campaign distributed to bulk queue');

  } catch (error: any) {
    logger.error({ campaignId, error: error.message }, '[CampaignWorker] Campaign execution failed');
    throw error;
  }

}, { connection });

campaignWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'CampaignWorker failed');
});
