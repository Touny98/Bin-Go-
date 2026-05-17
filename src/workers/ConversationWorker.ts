import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { ConversationOrchestrator } from '../conversation/ConversationOrchestrator';

export const conversationWorker = new Worker('whatsapp-inbound-queue', async (job: Job) => {
  const { from, input } = job.data;
  
  logger.info({ from, input }, `[ConversationWorker] Processing inbound message from ${from}`);

  try {
    await ConversationOrchestrator.processMessage(from, input);
  } catch (error: any) {
    logger.error({ from, error: error.message }, '[ConversationWorker] Failed to process message');
    throw error;
  }

}, { 
  connection,
  concurrency: 10,
  // Protection against flood/spam at worker level
  limiter: {
    max: 20,
    duration: 1000
  }
});

conversationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'ConversationWorker failed');
});
