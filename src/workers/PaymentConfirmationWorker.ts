import { Worker, Job } from 'bullmq';
import { connection, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { MercadoPagoService } from '../services/MercadoPagoService';
import { CardReservationService } from '../domain/CardReservationService';
import { SessionStore } from '../conversation/SessionStore';
import { query } from '../db';

export const paymentConfirmationWorker = new Worker('payment-confirmation-queue', async (job: Job) => {
  const { paymentId } = job.data;
  logger.info({ paymentId }, `[PaymentConfirmationWorker] Processing webhook payment info`);

  try {
    // Verify the truth from MercadoPago
    const paymentInfo = await MercadoPagoService.getPaymentInfo(paymentId);

    if (paymentInfo.status === 'approved') {
      const externalRef = paymentInfo.external_reference;

      // Idempotent Confirmation
      const success = await CardReservationService.confirmPayment(externalRef);
      if (success) {
        logger.info({ paymentId, externalRef }, `[PaymentConfirmationWorker] Payment successfully applied to reservation`);

        // Extract userId from externalRef (format: RES_timestamp_userId_gameId)
        const parts = externalRef.split('_');
        if (parts.length >= 3) {
          const userId = parts[2];

          // Notify user that payment was confirmed
          await notifyHighQueue.add('send_notification', {
            to: userId,
            text: `✅ ¡Pago recibido! Tus cartones están activos.\n\n🎲 ¡A jugar!`
          });

          // Update user session state back to MAIN_MENU
          try {
            await SessionStore.update(userId, { state: 'MAIN_MENU' });
          } catch (e) {
            logger.warn({ userId }, '[PaymentConfirmationWorker] Could not update session state');
          }
        }
      }
    } else {
      logger.info({ paymentId, status: paymentInfo.status }, `[PaymentConfirmationWorker] Payment not approved yet`);
    }
  } catch (error: any) {
    logger.error({ paymentId, error: error.message }, '[PaymentConfirmationWorker] Error processing payment');
    throw error;
  }

}, { connection, concurrency: 5 });

paymentConfirmationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'PaymentConfirmationWorker failed');
});
