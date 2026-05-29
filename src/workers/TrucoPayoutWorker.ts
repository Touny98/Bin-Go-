import { Worker, Job } from 'bullmq';
import { connection, trucoPayoutQueue } from '../queue';
import { logger } from '../utils/logger';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';

interface PayoutJobData {
  matchId: string;
}

/**
 * Worker idempotente de settlement final. Aunque el handler conversacional
 * llama directo a TrucoSettlementService.payout al GAME_OVER, este worker
 * cubre el caso en que el handler crasheó antes de pagar (recovery).
 *
 * Se encola al transicionar a GAME_OVER o ABANDONED.
 */
export const trucoPayoutWorker = new Worker(
  'truco-payout-queue',
  async (job: Job<PayoutJobData>) => {
    const { matchId } = job.data;
    logger.info({ matchId }, '[TrucoPayoutWorker] processing');
    await TrucoSettlementService.payout(matchId);
  },
  { connection, concurrency: 4 }
);

trucoPayoutWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[TrucoPayoutWorker] failed');
});

export async function enqueuePayout(matchId: string): Promise<void> {
  await trucoPayoutQueue.add(
    'payout',
    { matchId },
    {
      jobId: `truco-payout-${matchId}`,
      removeOnComplete: true,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
}
