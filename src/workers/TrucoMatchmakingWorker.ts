import { Worker, Job } from 'bullmq';
import { connection, trucoMatchmakingQueue } from '../queue';
import { logger } from '../utils/logger';
import { query } from '../db';
import { TrucoMatchmakingService } from '../domain/truco/TrucoMatchmakingService';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';
import { TrucoGameOrchestrator } from '../domain/truco/TrucoGameOrchestrator';
import { TrucoNotifier } from '../conversation/handlers/TrucoNotifier';
import { TrucoMatchStatus } from '../engine/truco/TrucoStateMachine';

function getFeePct(): number {
  const v = parseFloat(process.env.TRUCO_FEE_PCT || '');
  if (!isNaN(v) && v >= 0 && v <= 1) return v;
  return 0.10;
}

/**
 * Procesa matches MATCH_FOUND que aún no se notificaron (recovery
 * tras reinicio o handler crash post-create).
 */
async function processOrphanMatchFound(): Promise<void> {
  // Sólo procesamos matches viejos (≥ 5s) para evitar pelearle al
  // TrucoLobbyHandler que también orquesta hold+deal cuando crea el match.
  // El worker sólo entra para recuperar matches que se quedaron colgados.
  const res = await query(
    `SELECT id FROM truco_matches
     WHERE status = $1
       AND created_at < NOW() - INTERVAL '5 seconds'
     ORDER BY created_at ASC LIMIT 50`,
    [TrucoMatchStatus.MATCH_FOUND]
  );
  for (const row of res.rows) {
    const matchId = row.id as string;
    try {
      await TrucoNotifier.pushMatchFound(matchId);
      await TrucoSettlementService.holdBets(matchId);
      // holdBets puede haber sido no-op si otro proceso ya avanzó: en ese
      // caso dealNewHand puede fallar porque el match ya no está en
      // BET_LOCKED. Lo verificamos antes.
      const fresh = await query(
        `SELECT status, current_hand_id FROM truco_matches WHERE id = $1`,
        [matchId]
      );
      const status = fresh.rows[0]?.status as TrucoMatchStatus | undefined;
      const currentHandId = fresh.rows[0]?.current_hand_id;
      if (status === TrucoMatchStatus.BET_LOCKED && !currentHandId) {
        const desc = await TrucoGameOrchestrator.dealNewHand(matchId);
        await TrucoNotifier.pushTurnDescriptor(desc);
      }
    } catch (e: any) {
      logger.error(
        { matchId, err: e.message },
        '[TrucoMatchmakingWorker] orphan match processing failed'
      );
    }
  }
}

/**
 * Worker que recorre la cola de Truco buscando pares por monto.
 * Se re-encola a sí mismo cada 2s para mantener un tick continuo.
 */
export const trucoMatchmakingWorker = new Worker(
  'truco-matchmaking-queue',
  async (_job: Job) => {
    const feePct = getFeePct();
    try {
      // 1) Procesar huérfanos (recovery post-crash)
      await processOrphanMatchFound();
      // 2) Intentar emparejar
      const matchesCreated = await TrucoMatchmakingService.tickMatch(feePct);
      if (matchesCreated > 0) {
        logger.info({ matchesCreated }, '[TrucoMatchmakingWorker] tick created matches');
        await processOrphanMatchFound();
      }
    } catch (e: any) {
      logger.error({ err: e.message }, '[TrucoMatchmakingWorker] tick failed');
    } finally {
      await trucoMatchmakingQueue.add(
        'tick',
        {},
        { delay: 2000, removeOnComplete: true, removeOnFail: true }
      );
    }
  },
  { connection, concurrency: 1 }
);

trucoMatchmakingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[TrucoMatchmakingWorker] failed');
});

// Seed inicial: encolar el primer tick
(async () => {
  await trucoMatchmakingQueue.add(
    'tick',
    {},
    { delay: 500, removeOnComplete: true, removeOnFail: true }
  );
})();
