import { Worker, Job, Queue } from 'bullmq';
import { connection, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { query } from '../db';
import { MercadoPagoPayoutProvider } from '../finance/providers/IPayoutProvider';
import { RiskEngine } from '../finance/RiskEngine';
import { WalletEngine } from '../finance/WalletEngine';

async function notifyUser(userId: string, text: string): Promise<void> {
  try {
    const jidRes = await query(
      'SELECT whatsapp_jid, phone_number FROM users WHERE phone_number = $1',
      [userId]
    );
    const chatId = jidRes.rows[0]?.whatsapp_jid || `${userId}@c.us`;
    await notifyHighQueue.add('send_notification', { to: chatId, text });
  } catch (e: any) {
    logger.warn({ userId, error: e.message }, '[PayoutProcessorWorker] Could not notify user');
  }
}

async function notifyAdminNewPayout(payoutId: string, userId: string, amount: number, destination: string): Promise<void> {
  try {
    // Notificar al WhatsApp del admin (si lo tienes guardado)
    // Por ahora, solo loguear para que el admin lo vea en el panel
    logger.info(
      { payoutId, userId, amount, destination },
      '💰 NUEVO RETIRO PENDIENTE - Revisá el panel admin en http://localhost:3011/finance'
    );
  } catch (e: any) {
    logger.warn({ error: e.message }, '[PayoutProcessorWorker] Could not notify admin');
  }
}

export const payoutQueue = new Queue('payout-queue', { connection });

const provider = new MercadoPagoPayoutProvider();

export const payoutProcessorWorker = new Worker('payout-queue', async (job: Job) => {
  const { payoutId, userId, amount } = job.data;
  
  logger.info({ payoutId, userId }, '[PayoutProcessorWorker] Processing withdrawal request');

  // 1. Fetch current status
  const res = await query('SELECT status FROM payout_requests WHERE id = $1', [payoutId]);
  if (res.rows.length === 0) throw new Error('Payout request not found');
  
  let currentStatus = res.rows[0].status;
  if (['PAID', 'FAILED'].includes(currentStatus)) {
    logger.warn({ payoutId }, '[PayoutProcessorWorker] Payout already processed');
    return;
  }

  try {
    // 2. Risk Analysis (if still in REQUESTED)
    if (currentStatus === 'REQUESTED') {
      const risk = await RiskEngine.analyzePayout(userId, amount);
      if (risk.requiresManualReview) {
        await query(
          'UPDATE payout_requests SET status = $1, risk_score = $2, risk_notes = $3 WHERE id = $4',
          ['PENDING_REVIEW', risk.score, risk.notes.join(', '), payoutId]
        );
        await notifyUser(userId,
          `⏳ Tu solicitud de retiro de *$${amount}* fue recibida y está siendo revisada.\n\n` +
          `Esto puede demorar hasta *24 horas*. Te avisaremos cuando sea aprobada. 🙏`
        );
        logger.info({ payoutId }, '[PayoutProcessorWorker] Payout held for manual review');
        return;
      }
      
      // Auto-approve
      currentStatus = 'APPROVED';
      await query('UPDATE payout_requests SET status = $1 WHERE id = $2', [currentStatus, payoutId]);
    }

    if (currentStatus === 'APPROVED') {
      // 3. Lock Funds — if user wallet is insufficient, this throws and payout is FAILED
      await WalletEngine.lockForWithdrawal(userId, amount, payoutId);

      // 4. Call Provider (in this MVP, provider always fails, so we defer to PENDING_PAYMENT)
      await query('UPDATE payout_requests SET status = $1 WHERE id = $2', ['PROCESSING', payoutId]);

      // Obtener destination para notificar al admin
      const destRes = await query('SELECT destination FROM payout_requests WHERE id = $1', [payoutId]);
      const destination = destRes.rows[0]?.destination || 'No especificado';

      // MVP: Marcar como PENDING_PAYMENT para gestión manual
      await query(
        'UPDATE payout_requests SET status = $1, updated_at = NOW() WHERE id = $2',
        ['PENDING_PAYMENT', payoutId]
      );

      // Notificar al usuario que su retiro está siendo procesado
      await notifyUser(userId,
        `⏳ Tu solicitud de retiro de *$${amount}* está en revisión.\n\n` +
        `El dinero será transferido a tu cuenta en las *próximas 24 horas*. 🙏\n\n` +
        `Ante cualquier consulta, contactate con soporte.`
      );

      // Notificar al admin que hay un nuevo retiro pendiente
      await notifyAdminNewPayout(payoutId, userId, amount, destination);

      logger.info({ payoutId, userId, amount, destination }, '[PayoutProcessorWorker] Payout deferred to manual review (PENDING_PAYMENT)');
    }

  } catch (error: any) {
    logger.error({ payoutId, error: error.message }, '[PayoutProcessorWorker] Execution failed');
    await query('UPDATE payout_requests SET status = $1, risk_notes = $2, updated_at = NOW() WHERE id = $3', ['FAILED', error.message, payoutId]);
    throw error;
  }

}, { 
  connection,
  lockDuration: 60000 // 1 minute lock to prevent overlap
});
