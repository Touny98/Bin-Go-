import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { query } from '../db';
import { LedgerService } from '../finance/LedgerService';

export const reconciliationWorker = new Worker('reconciliation-queue', async (job: Job) => {
  logger.info('[ReconciliationWorker] Starting financial audit...');

  try {
    // 1. Get all active wallets
    const walletsRes = await query('SELECT user_id, real_balance FROM wallets');
    
    let anomalies = 0;

    for (const wallet of walletsRes.rows) {
      const { user_id, real_balance } = wallet;
      
      // 2. Reconstruct balance from Ledger
      const ledgerBalance = await LedgerService.calculateBalance(user_id);
      
      const currentBalance = parseFloat(real_balance);
      const drift = Math.abs(currentBalance - ledgerBalance);

      if (drift > 0.01) { // Tolerate small precision diffs if any
        logger.error({ 
          userId: user_id, 
          currentBalance, 
          ledgerBalance, 
          drift 
        }, '[ReconciliationWorker] BALANCE DRIFT DETECTED!');
        anomalies++;
        
        // In a real system, we'd trigger an alert to Ops/Slack
      }
    }

    logger.info({ totalWallets: walletsRes.rows.length, anomalies }, '[ReconciliationWorker] Audit finished');

  } catch (error: any) {
    logger.error({ error: error.message }, '[ReconciliationWorker] Audit failed');
  }

}, { connection });
