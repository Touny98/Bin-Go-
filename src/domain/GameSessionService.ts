import { getClient, query } from '../db';
import { logger } from '../utils/logger';
import { GameStatus } from './GameState';

export class GameSessionService {
  /**
   * Attempts to lock a winner using PostgreSQL FOR UPDATE mechanism.
   * Returns true if successful, false if a winner was already locked.
   */
  public static async lockWinner(sessionId: number, winnerUserId: string): Promise<boolean> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Lock the session row
      const result = await client.query(
        'SELECT winner_id, status FROM game_sessions WHERE id = $1 FOR UPDATE',
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found.`);
      }

      const session = result.rows[0];

      // If a winner is already assigned, we lost the race condition.
      if (session.winner_id || session.status === GameStatus.WINNER_PENDING_VALIDATION || session.status === GameStatus.FINISHED) {
        await client.query('ROLLBACK');
        logger.warn({ sessionId, attemptWinner: winnerUserId }, `[GameSessionService] Race condition: Winner already locked.`);
        return false;
      }

      // We resolve the winnerUserId (phone number string or string ID) to the actual internal DB User ID.
      const userRes = await client.query('SELECT id FROM users WHERE phone_number = $1 OR id::text = $1', [winnerUserId]);
      if (userRes.rows.length === 0) {
        throw new Error(`User with phone/ID ${winnerUserId} not found.`);
      }
      const internalUserId = userRes.rows[0].id;

      // We won the race! Lock the winner.
      await client.query(
        `UPDATE game_sessions 
         SET status = $1, winner_id = $2, winner_locked_at = NOW(), version = version + 1, updated_at = NOW() 
         WHERE id = $3`,
        [GameStatus.WINNER_PENDING_VALIDATION, internalUserId, sessionId]
      );

      // Log event to Audit Trail
      await client.query(
        'INSERT INTO game_events (game_id, event_type, payload) VALUES ($1, $2, $3)',
        [sessionId, 'WINNER_LOCKED', JSON.stringify({ winnerUserId, lockedAt: new Date() })]
      );

      await client.query('COMMIT');
      logger.info({ sessionId, winnerUserId }, `[GameSessionService] Successfully locked winner.`);
      return true;

    } catch (e: any) {
      await client.query('ROLLBACK');
      logger.error({ sessionId, error: e.message }, `[GameSessionService] Failed to lock winner.`);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Persists a ball draw with idempotency guarantees
   */
  public static async persistDraw(
    sessionId: number, 
    ball: number, 
    drawOrder: number, 
    workerId: string, 
    jobId: string, 
    processingTimeMs: number
  ): Promise<boolean> {
    try {
      await query(
        `INSERT INTO game_draws (game_id, number, draw_order, worker_id, job_id, processing_time_ms) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, ball, drawOrder, workerId, jobId, processingTimeMs]
      );
      return true;
    } catch (e: any) {
      if (e.code === '23505') { // Postgres UNIQUE constraint violation
        logger.warn({ sessionId, ball, drawOrder }, `[GameSessionService] Idempotency catch: Ball already drawn.`);
        return false;
      }
      throw e;
    }
  }
}
