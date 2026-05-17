import { eventBus } from '../utils/EventBus';
import { query } from '../db';
import { logger } from '../utils/logger';

export class ReplayService {
  /**
   * Subscribes to events to create a persistent replay timeline
   */
  public static initialize() {
    logger.info('[ReplayService] Binding internal events for persistence...');

    const persist = async (gameId: number, type: string, payload: any) => {
      try {
        await query(
          'INSERT INTO game_event_logs (game_id, event_type, payload) VALUES ($1, $2, $3)',
          [gameId, type, JSON.stringify(payload)]
        );
      } catch (e: any) {
        logger.error({ gameId, type, error: e.message }, '[ReplayService] Failed to persist event');
      }
    };

    eventBus.subscribe('ball.drawn', (p) => persist(p.gameId, 'ball_drawn', p));
    eventBus.subscribe('winner.detected', (p) => persist(p.gameId, 'winner_detected', p));
    eventBus.subscribe('game.started', (p) => persist(p.gameId, 'game_started', p));
    eventBus.subscribe('game.finished', (p) => persist(p.gameId, 'game_finished', p));
  }

  /**
   * Retrieves the full timeline of a game for replay
   */
  public static async getGameTimeline(gameId: number) {
    const result = await query(
      'SELECT event_type, payload, created_at FROM game_event_logs WHERE game_id = $1 ORDER BY created_at ASC',
      [gameId]
    );
    return result.rows;
  }
}
