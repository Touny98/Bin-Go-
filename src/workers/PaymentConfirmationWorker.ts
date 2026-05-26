import { Worker, Job } from 'bullmq';
import { connection, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { MercadoPagoService } from '../services/MercadoPagoService';
import { CardReservationService } from '../domain/CardReservationService';
import { SessionStore } from '../conversation/SessionStore';
import { Templates } from '../conversation/templates/MessageTemplates';
import { query } from '../db';

export const paymentConfirmationWorker = new Worker('payment-confirmation-queue', async (job: Job) => {
  const { paymentId } = job.data;
  logger.info({ paymentId }, `[PaymentConfirmationWorker] Processing webhook payment info`);

  try {
    const paymentInfo = await MercadoPagoService.getPaymentInfo(paymentId);

    if (paymentInfo.status === 'approved') {
      const externalRef = paymentInfo.external_reference;

      if (!externalRef) {
        logger.error({ paymentId }, '[PaymentConfirmationWorker] Payment approved but missing external_reference');
        throw new Error(`Payment ${paymentId} is approved but has no external reference`);
      }

      const success = await CardReservationService.confirmPayment(externalRef);
      if (success) {
        logger.info({ paymentId, externalRef }, `[PaymentConfirmationWorker] Payment successfully applied to reservation`);

        // Formato externalRef: RES_timestamp_jidOrPhone_gameId
        // parts[2] puede ser '173650393178254@lid', '173650393178254@c.us', o solo el número
        const parts = externalRef.split('_');
        if (parts.length < 4) {
          logger.error({ externalRef }, '[PaymentConfirmationWorker] Formato de externalRef inválido');
          return;
        }

        const rawUserId = parts[2];
        const gameId = parseInt(parts[3]);

        // rawUserId may contain full JID (new) or just phone number (legacy)
        const phoneStr = rawUserId.replace(/@c\.us$/, '').replace(/@lid$/, '');

        // Look up whatsapp_jid from DB for reliable delivery
        let sessionUserId: string;
        let chatId: string;
        try {
          const jidRes = await query(
            `SELECT whatsapp_jid FROM users WHERE phone_number = $1`,
            [phoneStr]
          );
          const jid = jidRes.rows[0]?.whatsapp_jid;
          sessionUserId = jid || (rawUserId.includes('@') ? rawUserId : `${rawUserId}@c.us`);
          chatId = sessionUserId;
        } catch (e) {
          sessionUserId = rawUserId.includes('@') ? rawUserId : `${rawUserId}@c.us`;
          chatId = sessionUserId;
        }

        logger.info({ phoneStr, chatId }, `[PaymentConfirmationWorker] Notificando usuario`);

        // Contar cartones confirmados para este externalRef
        let quantity = 1;
        try {
          const countRes = await query(
            `SELECT COUNT(*) as cnt FROM card_reservations WHERE payment_id = $1 AND status = 'PAID'`,
            [externalRef]
          );
          quantity = parseInt(countRes.rows[0]?.cnt) || 1;
        } catch (e) {
          logger.warn({ externalRef }, '[PaymentConfirmationWorker] No se pudo obtener cantidad de cartones');
        }

        // Obtener nombre de sala y horario del sorteo
        let roomName = 'la sala';
        let scheduledAt: Date | null = null;
        try {
          if (!isNaN(gameId)) {
            const sessionRes = await query(
              `SELECT s.scheduled_at, r.name as room_name
               FROM game_sessions s
               JOIN rooms r ON r.id = s.room_id
               WHERE s.id = $1`,
              [gameId]
            );
            if (sessionRes.rows.length > 0) {
              roomName = sessionRes.rows[0].room_name || roomName;
              scheduledAt = sessionRes.rows[0].scheduled_at
                ? new Date(sessionRes.rows[0].scheduled_at)
                : null;
            }
          }
        } catch (e) {
          logger.warn({ externalRef }, '[PaymentConfirmationWorker] No se pudo obtener horario del sorteo');
        }

        // Enviar notificación con template unificado
        const notificationText = Templates.PURCHASE_DRAW_REMINDER({ roomName, quantity, scheduledAt });
        await notifyHighQueue.add('send_notification', { to: chatId, text: notificationText });

        // Actualizar sesión a MAIN_MENU
        try {
          await SessionStore.update(sessionUserId, { state: 'MAIN_MENU' });
        } catch (e) {
          logger.warn({ sessionUserId }, '[PaymentConfirmationWorker] No se pudo actualizar estado de sesión');
        }
      } else {
        logger.warn({ paymentId, externalRef }, `[PaymentConfirmationWorker] confirmPayment devolvió false`);
        throw new Error(`Reserva no encontrada o ya procesada: ${externalRef}`);
      }
    } else {
      logger.info({ paymentId, status: paymentInfo.status }, `[PaymentConfirmationWorker] Pago no aprobado aún`);
    }
  } catch (error: any) {
    logger.error({ paymentId, error: error.message }, '[PaymentConfirmationWorker] Error procesando pago');
    throw error;
  }

}, { connection, concurrency: 5 });

paymentConfirmationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'PaymentConfirmationWorker failed');
});
