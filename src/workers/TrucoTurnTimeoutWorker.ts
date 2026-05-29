import { Worker, Job } from 'bullmq';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { TrucoGameOrchestrator } from '../domain/truco/TrucoGameOrchestrator';
import { TrucoNotifier } from '../conversation/handlers/TrucoNotifier';
import { TrucoMsg } from '../conversation/templates/TrucoMessages';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';

interface TimeoutJobData {
  matchId: string;
  expectedSeq: number;
  kind?: 'warning' | 'timeout';
}

/**
 * Worker de timeout por turno. Para cada turno se arman dos jobs:
 *  - 'warning' (≈60s): avisa al jugador que está por ser descalificado.
 *  - 'timeout' (≈90s): si sigue sin jugar, el match termina por abandono y
 *    se settlea como ganador del rival.
 * Si la sequence avanzó (acción cumplida) ambos son no-op.
 */
export const trucoTurnTimeoutWorker = new Worker(
  'truco-turn-timeout-queue',
  async (job: Job<TimeoutJobData>) => {
    const { matchId, expectedSeq, kind } = job.data;
    logger.info({ matchId, expectedSeq, kind }, '[TrucoTurnTimeoutWorker] firing');
    try {
      // Aviso de descalificación previo al timeout final.
      if (kind === 'warning') {
        const phone = await TrucoGameOrchestrator.timeoutWarningTarget({ matchId, expectedSeq });
        if (phone) {
          await TrucoNotifier.sendText(phone, TrucoMsg.TURN_TIMEOUT_WARNING());
          // Reenviamos el prompt pendiente (cartas/cantos o respuesta a un
          // canto): si el mensaje original se perdió, el jugador recibe ahora
          // los botones para actuar y no pierde por un timeout que nunca vio.
          await TrucoNotifier.repromptPendingActor(matchId, phone);
        } else {
          logger.info({ matchId, expectedSeq }, '[TrucoTurnTimeoutWorker] warning obsolete');
        }
        return;
      }

      const desc = await TrucoGameOrchestrator.handleTimeout({ matchId, expectedSeq });
      if (!desc) {
        logger.info({ matchId, expectedSeq }, '[TrucoTurnTimeoutWorker] obsolete or no-op');
        return;
      }
      await TrucoNotifier.pushTurnDescriptor(desc);
      if (desc.kind === 'GAME_OVER') {
        await TrucoSettlementService.payout(desc.match.id);
      }
    } catch (e: any) {
      logger.error(
        { matchId, expectedSeq, err: e.message },
        '[TrucoTurnTimeoutWorker] failed'
      );
      throw e;
    }
  },
  { connection, concurrency: 4 }
);

trucoTurnTimeoutWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, '[TrucoTurnTimeoutWorker] failed');
});

// El armado/desarmado real de timeouts vive en TrucoTurnGuard
// (armTurnTimeout / disarmTurnTimeout). Las funciones scheduleTurnTimeout /
// cancelTurnTimeout que vivían acá eran código muerto (nadie las importaba) y
// se eliminaron para evitar dos caminos paralelos de timeout.
