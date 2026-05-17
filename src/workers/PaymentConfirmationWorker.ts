import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { MercadoPagoService } from '../services/MercadoPagoService';
import { CardReservationService } from '../domain/CardReservationService';

export const paymentConfirmationWorker = new Worker('payment-confirmation-queue', async (job: Job) => {
  const { paymentId } = job.data;
  logger.info({ paymentId }, `[PaymentConfirmationWorker] Processing webhook payment info`);

  // Verify the truth from MercadoPago
  const paymentInfo = await MercadoPagoService.getPaymentInfo(paymentId);
  
  if (paymentInfo.status === 'approved') {
    const externalRef = paymentInfo.external_reference;
    
    // Idempotent Confirmation
    const success = await CardReservationService.confirmPayment(externalRef);
    if (success) {
      logger.info({ paymentId, externalRef }, `[PaymentConfirmationWorker] Payment successfully applied to reservation`);
    }
  } else {
    logger.info({ paymentId, status: paymentInfo.status }, `[PaymentConfirmationWorker] Payment not approved yet`);
  }

}, { connection, concurrency: 5 });

paymentConfirmationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'PaymentConfirmationWorker failed');
});
