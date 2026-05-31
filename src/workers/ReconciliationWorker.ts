import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { ReconciliationService } from '../finance/ReconciliationService';

export const reconciliationWorker = new Worker('reconciliation-queue', async (_job: Job) => {
  logger.info('[ReconciliationWorker] Starting financial audit...');
  try {
    // El invariante (ledger == real_balance + bonus_balance) y el logueo de anomalías
    // viven en ReconciliationService.audit() — testeable y reutilizable desde el panel admin.
    await ReconciliationService.audit();
  } catch (error: any) {
    logger.error({ error: error.message }, '[ReconciliationWorker] Audit failed');
  }
}, { connection });
