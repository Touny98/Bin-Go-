import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { storageProvider } from '../media/providers/LocalStorageProvider';

export const mediaCleanupWorker = new Worker('media-cleanup-queue', async (job: Job) => {
  const { filename } = job.data;
  
  logger.info({ filename }, '[MediaCleanupWorker] Cleaning up expired asset');

  try {
    await storageProvider.delete(filename);
  } catch (error: any) {
    logger.error({ filename, error: error.message }, '[MediaCleanupWorker] Cleanup failed');
  }

}, { connection });

mediaCleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'MediaCleanupWorker failed');
});
