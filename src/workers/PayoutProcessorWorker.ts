import { Worker, Job, Queue } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { query } from '../db';
import { MercadoPagoPayoutProvider } from '../finance/providers/IPayoutProvider';
import { RiskEngine } from '../finance/RiskEngine';
import { WalletEngine } from '../finance/WalletEngine';

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
        logger.info({ payoutId }, '[PayoutProcessorWorker] Payout held for manual review');
        return;
      }
      
      // Auto-approve
      currentStatus = 'APPROVED';
      await query('UPDATE payout_requests SET status = $1 WHERE id = $2', [currentStatus, payoutId]);
    }

    if (currentStatus === 'APPROVED') {
      // 3. Lock Funds
      await WalletEngine.lockForWithdrawal(userId, amount, payoutId);
      
      // 4. Call Provider
      await query('UPDATE payout_requests SET status = $1 WHERE id = $2', ['PROCESSING', payoutId]);
      
      const response = await provider.process(payoutId, userId, amount, {});

      if (response.success) {
        await query(
          'UPDATE payout_requests SET status = $1, provider_tx_id = $2, updated_at = NOW() WHERE id = $3',
          ['PAID', response.providerTxId, payoutId]
        );
        logger.info({ payoutId }, '[PayoutProcessorWorker] Payout completed successfully');
      } else {
        throw new Error(response.error || 'Provider payment failed');
      }
    }

  } catch (error: any) {
    logger.error({ payoutId, error: error.message }, '[PayoutProcessorWorker] Execution failed');
    
    // We could potentially REVERSE the wallet debit here if it's a permanent failure
    await query('UPDATE payout_requests SET status = $1, risk_notes = $2 WHERE id = $3', ['FAILED', error.message, payoutId]);
    throw error;
  }

}, { 
  connection,
  lockDuration: 60000 // 1 minute lock to prevent overlap
});
