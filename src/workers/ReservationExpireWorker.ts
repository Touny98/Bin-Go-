import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { CardReservationService } from '../domain/CardReservationService';

export const reservationExpireWorker = new Worker('reservation-expire-queue', async (job: Job) => {
  const { reservationId } = job.data;
  
  logger.info({ reservationId }, `[ReservationExpireWorker] Checking reservation for expiration`);

  await CardReservationService.expireReservation(reservationId);

}, { connection, concurrency: 10 });

reservationExpireWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'ReservationExpireWorker failed');
});
