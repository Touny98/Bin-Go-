import { trucoTurnTimeoutQueue } from '../../queue';
import { logger } from '../../utils/logger';
import { query } from '../../db';

// Timeout final del turno: si el jugador no actúa, pierde por abandono.
const FINAL_TIMEOUT_MS = parseInt(process.env.TRUCO_TURN_TIMEOUT_MS || '90000', 10);
// Aviso previo de descalificación (por defecto al minuto, 30s antes del final).
const WARNING_TIMEOUT_MS = parseInt(process.env.TRUCO_TURN_WARNING_MS || '60000', 10);

/**
 * Encola dos jobs cancelables para el próximo turno esperado:
 *  - aviso de descalificación (WARNING_TIMEOUT_MS)
 *  - timeout final por abandono (FINAL_TIMEOUT_MS)
 * jobIds deterministas permiten remove() al avanzar el turno.
 */
// BullMQ rechaza `:` en jobIds porque lo usa como separador interno de claves
// Redis. Usamos `-` para que el ID siga siendo determinista.
function buildTimeoutJobId(matchId: string, seq: number): string {
  return `truco-timeout-${matchId}-${seq}`;
}

function buildWarningJobId(matchId: string, seq: number): string {
  return `truco-warn-${matchId}-${seq}`;
}

export async function armTurnTimeout(
  matchId: string,
  expectedSeq: number
): Promise<void> {
  // Aviso de descalificación
  await trucoTurnTimeoutQueue.add(
    'timeout',
    { matchId, expectedSeq, kind: 'warning' },
    {
      delay: WARNING_TIMEOUT_MS,
      jobId: buildWarningJobId(matchId, expectedSeq),
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  // Timeout final por abandono
  await trucoTurnTimeoutQueue.add(
    'timeout',
    { matchId, expectedSeq, kind: 'timeout' },
    {
      delay: FINAL_TIMEOUT_MS,
      jobId: buildTimeoutJobId(matchId, expectedSeq),
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
  logger.debug(
    { matchId, expectedSeq, warningMs: WARNING_TIMEOUT_MS, finalMs: FINAL_TIMEOUT_MS },
    '[TurnGuard] armed'
  );
}

export async function disarmTurnTimeout(matchId: string, seq: number): Promise<void> {
  const ids = [buildWarningJobId(matchId, seq), buildTimeoutJobId(matchId, seq)];
  for (const jobId of ids) {
    try {
      const job = await trucoTurnTimeoutQueue.getJob(jobId);
      if (job) await job.remove();
    } catch (e: any) {
      logger.debug({ matchId, seq, jobId, err: e.message }, '[TurnGuard] disarm skipped');
    }
  }
}

/**
 * Calcula el próximo sequence_number que se espera registrar en truco_actions.
 */
export async function nextExpectedSeq(matchId: string): Promise<number> {
  const res = await query(
    'SELECT COALESCE(MAX(sequence_number), 0) AS s FROM truco_actions WHERE match_id = $1',
    [matchId]
  );
  return parseInt(res.rows[0].s, 10) + 1;
}
