import { Worker, Job } from 'bullmq';
import { connection, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { CardReservationService } from '../domain/CardReservationService';
import { SessionStore } from '../conversation/SessionStore';
import { Templates } from '../conversation/templates/MessageTemplates';

export const reservationExpireWorker = new Worker('reservation-expire-queue', async (job: Job) => {
  const { reservationId } = job.data;

  logger.info({ reservationId }, `[ReservationExpireWorker] Checking reservation for expiration`);

  const chatId = await CardReservationService.expireReservation(reservationId);

  if (chatId) {
    // Notificar al usuario que su reserva expiró
    await notifyHighQueue.add('send_notification', {
      to: chatId,
      text: Templates.RESERVATION_EXPIRED(),
    });

    // Resetear sesión a MAIN_MENU para que no quede trabado en WAITING_PAYMENT
    try {
      await SessionStore.update(chatId, { state: 'MAIN_MENU' });
    } catch (e: any) {
      logger.warn({ chatId, error: e.message }, '[ReservationExpireWorker] No se pudo resetear sesión');
    }

    logger.info({ reservationId, chatId }, '[ReservationExpireWorker] Usuario notificado y sesión reseteada');
  }

}, { connection, concurrency: 10 });

reservationExpireWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'ReservationExpireWorker failed');
});
