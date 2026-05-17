import { Worker, Job } from 'bullmq';
import { connection, ballDrawQueue, notificationsQueue } from '../queue';
import { logger } from '../utils/logger';
import { eventBus } from '../utils/EventBus';
import { GameStatus } from '../domain/GameState';
import { query } from '../db';
import { BingoEngine } from '../engine/BingoGame';

export const gameStartWorker = new Worker('game-start-queue', async (job: Job) => {
  const { sessionId, roomId, activeCards, playersPhones } = job.data;
  
  logger.info({ sessionId }, `[GameStartWorker] Processing startGame job`);

  // Update DB state
  try {
    await query('UPDATE game_sessions SET status = $1 WHERE id = $2', [GameStatus.RUNNING, sessionId]);
  } catch (e: any) {
    logger.warn(`Could not update session ${sessionId} to RUNNING: ${e.message}`);
  }

  // Generate sequence for the session
  const sequence = BingoEngine.generateDrawSequence();
  
  // Publish Event
  eventBus.publish('game.started', { gameId: sessionId, startTime: new Date() });

  // Schedule the FIRST ball draw
  await ballDrawQueue.add('drawBall', {
    sessionId,
    roomId,
    activeCards,
    sequence,
    currentIdx: 0,
    drawnNumbers: []
  }, {
    delay: 5000 // 5 seconds before the first draw
  });

  logger.info({ sessionId }, `[GameStartWorker] Scheduled first drawBall job`);
}, { connection });

gameStartWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'GameStartWorker failed');
});
