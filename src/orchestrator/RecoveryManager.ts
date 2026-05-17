import { query } from '../db';
import { logger } from '../utils/logger';
import { GameStatus } from '../domain/GameState';
import { ballDrawQueue } from '../queue';

export class RecoveryManager {
  private intervalId: NodeJS.Timeout | null = null;

  public start(intervalMs: number = 60000) {
    logger.info('[RecoveryManager] Started monitoring orphaned games...');
    this.intervalId = setInterval(() => this.scanAndRecover(), intervalMs);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async scanAndRecover() {
    try {
      // Find RUNNING sessions where the last draw was more than 30 seconds ago
      const result = await query(`
        SELECT s.id, s.room_id, s.drawn_numbers, s.status, 
               MAX(d.timestamp) as last_draw_time
        FROM game_sessions s
        LEFT JOIN game_draws d ON s.id = d.game_id
        WHERE s.status = $1
        GROUP BY s.id, s.room_id, s.drawn_numbers, s.status
        HAVING MAX(d.timestamp) < NOW() - INTERVAL '30 seconds' OR MAX(d.timestamp) IS NULL
      `, [GameStatus.RUNNING]);

      for (const session of result.rows) {
        logger.warn({ sessionId: session.id }, `[RecoveryManager] Detected ORPHANED session. Attempting recovery...`);
        
        // Fetch active cards for this session
        // In a real scenario, fetch them from DB: SELECT * FROM cards WHERE game_session_id = ...
        // For the demo architecture, we'll log it as requiring manual intervention if activeCards aren't stored globally yet.
        
        logger.error({ sessionId: session.id }, `[RecoveryManager] Recovery requires activeCards from DB. Please implement card fetching to resume from DLQ.`);
        
        // Pseudo-code for recovery injection:
        // await ballDrawQueue.add('drawBall', { ...recoverData }, { delay: 1000 });
      }
    } catch (e: any) {
      logger.error(`[RecoveryManager] Error during scan: ${e.message}`);
    }
  }
}
