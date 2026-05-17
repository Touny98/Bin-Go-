import { Worker, Job } from 'bullmq';
import { connection, ballDrawQueue } from '../queue';
import { logger } from '../utils/logger';
import { eventBus } from '../utils/EventBus';
import { BingoEngine } from '../engine/BingoGame';
import { query } from '../db';
import { GameStatus } from '../domain/GameState';
import { GameSessionService } from '../domain/GameSessionService';

export const ballDrawWorker = new Worker('ball-draw-queue', async (job: Job) => {
  const { sessionId, roomId, activeCards, sequence, currentIdx, drawnNumbers } = job.data;
  const startTimeMs = Date.now();
  
  if (currentIdx >= sequence.length) {
    logger.info({ sessionId }, `[BallDrawWorker] All numbers drawn. No winner?`);
    return;
  }

  const ball = sequence[currentIdx];
  const drawOrder = currentIdx + 1;

  const isNewDraw = await GameSessionService.persistDraw(
    sessionId, 
    ball, 
    drawOrder, 
    ballDrawWorker.id, 
    job.id || 'unknown', 
    Date.now() - startTimeMs
  );

  if (!isNewDraw) {
    logger.warn({ sessionId, drawOrder, ball }, `[BallDrawWorker] Idempotency catch: Job retried but ball already drawn. Skipping.`);
    return;
  }

  const newDrawnNumbers = [...drawnNumbers, ball];
  const drawnNumbersSet = new Set<number>(newDrawnNumbers);

  logger.info({ sessionId, ball, drawOrder }, `[BallDrawWorker] Drew ball ${ball}`);

  try {
    await query(
      'UPDATE game_sessions SET drawn_numbers = $1 WHERE id = $2',
      [JSON.stringify(newDrawnNumbers), sessionId]
    );
  } catch(e) {}

  // EVENT BUS HANDLES NOTIFICATIONS NOW
  eventBus.publish('ball.drawn', { gameId: sessionId, number: ball, drawOrder });

  let bingoWinner = null;
  let lineWinner = null;

  for (const card of activeCards) {
    const remainingNumbers = card.matrix.flat().filter((n: number | null) => n !== null && !drawnNumbersSet.has(n));
    
    if (remainingNumbers.length === 0) {
      bingoWinner = card;
      break;
    }

    // Near-Win Detection (Hype generation)
    if (remainingNumbers.length <= 2) {
      eventBus.publish('player.near_win', { 
        gameId: sessionId, 
        userId: card.userId, 
        remaining: remainingNumbers.length,
        lastNumberNeeded: remainingNumbers.length === 1 ? remainingNumbers[0] : null
      });
    }

    if (!lineWinner && BingoEngine.checkLine(card.matrix, drawnNumbersSet)) {
      lineWinner = card; 
    }
  }

  if (bingoWinner) {
    logger.info({ sessionId, cardId: bingoWinner.id }, `[BallDrawWorker] BINGO winner detected! Attempting to lock.`);
    
    const locked = await GameSessionService.lockWinner(sessionId, bingoWinner.userId);
    
    if (locked) {
      eventBus.publish('winner.detected', {
        gameId: sessionId,
        cardId: bingoWinner.id,
        userId: bingoWinner.userId,
        type: 'bingo'
      });
    }
    return; 
  }

  // Schedule Next Ball with retry configs (DLQ preparation)
  await ballDrawQueue.add('drawBall', {
    sessionId,
    roomId,
    activeCards,
    sequence,
    currentIdx: currentIdx + 1,
    drawnNumbers: newDrawnNumbers
  }, {
    delay: 5000,
    attempts: 5, 
    backoff: { type: 'exponential', delay: 1000 }
  });

}, { connection });

ballDrawWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'BallDrawWorker failed');
});
