import { Worker, Job } from 'bullmq';
import { connection, mediaCleanupQueue, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { CardRenderer } from '../media/CardRenderer';
import { storageProvider } from '../media/providers/LocalStorageProvider';

export const renderWorker = new Worker('render-queue', async (job: Job) => {
  const { userId, cardMatrix, options, caption } = job.data;
  
  logger.info({ userId }, '[RenderWorker] Rendering card...');

  try {
    // Convert array back to Set for CardRenderer
    if (options.highlightedNumbers) {
      options.highlightedNumbers = new Set(options.highlightedNumbers);
    }
    
    const buffer = await CardRenderer.render(cardMatrix, options);
    const filename = `card_${userId}_${Date.now()}.png`;
    const filePath = await storageProvider.save(filename, buffer);

    // Enqueue notification with the media path
    await notifyHighQueue.add('send_media_notification', {
      to: userId,
      mediaPath: filePath,
      text: caption || '🎫 ¡Aquí tienes tu cartón para la partida!'
    });

    // Schedule cleanup in 30 minutes (1,800,000 ms)
    await mediaCleanupQueue.add('cleanup', { filename }, { delay: 1800000 });

  } catch (error: any) {
    logger.error({ userId, error: error.message }, '[RenderWorker] Rendering failed');
    throw error;
  }

}, { 
  connection,
  concurrency: 2, // Limit concurrency to protect CPU
  limiter: {
    max: 5,
    duration: 1000
  }
});

renderWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'RenderWorker failed');
});
