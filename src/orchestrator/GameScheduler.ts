import { gameStartQueue, notificationsQueue } from '../queue';
import { BingoEngine } from '../engine/BingoGame';
import { logger } from '../utils/logger';
import { query } from '../db';
import { GameStatus } from '../domain/GameState';

export class GameScheduler {
  constructor() {
    logger.info('[GameScheduler] Initialized.');
  }

  /**
   * For the sake of architecture, this function will mock what happens when players join
   * and the session is ready to start.
   */
  public async forceStartGame(sessionId: number, roomId: number, playersPhones: string[]) {
    logger.info(`[GameScheduler] Orchestrating Session ${sessionId}`);

    // Generate mock cards for players and save them (in DB or pass to worker)
    const activeCards = playersPhones.map((phone, i) => ({
      id: i + 1,
      userId: phone,
      matrix: BingoEngine.generateCard()
    }));

    // In a real system, you persist the activeCards to the DB here.
    // For now, we'll pass them in the job data.
    
    // Simulate updating DB status
    try {
      await query('UPDATE game_sessions SET status = $1 WHERE id = $2', [GameStatus.STARTING, sessionId]);
    } catch (e: any) {
      logger.error(`Failed to update session status: ${e.message}`);
    }

    // Schedule the actual game start in BullMQ (10 seconds from now)
    await gameStartQueue.add('startGame', {
      sessionId,
      roomId,
      activeCards,
      playersPhones
    }, {
      delay: 10000 // 10 seconds of tension
    });

    logger.info(`[GameScheduler] Job added to game-start-queue for session ${sessionId} with 10s delay`);
  }
}
