import { Worker, Job } from 'bullmq';
import { connection, ballDrawQueue } from '../queue';
import { logger } from '../utils/logger';
import { eventBus } from '../utils/EventBus';
import { GameStatus } from '../domain/GameState';
import { query } from '../db';
import { BingoEngine } from '../engine/BingoGame';
import { buildCardBlock } from '../utils/cardFormatter';

export const gameStartWorker = new Worker('game-start-queue', async (job: Job) => {
  const { sessionId, roomId } = job.data;

  logger.info({ sessionId }, `[GameStartWorker] Processing startGame job`);

  // Fetch session details and active cards at start time
  const sessionRes = await query(
    `SELECT gs.game_mode, gs.max_balls, gs.room_id
     FROM game_sessions gs WHERE gs.id = $1`,
    [sessionId]
  );
  if (!sessionRes.rows.length) {
    logger.error({ sessionId }, '[GameStartWorker] Session not found, aborting');
    return;
  }
  const { game_mode: gameMode, max_balls: maxBalls, room_id: actualRoomId } = sessionRes.rows[0];

  const cardsRes = await query(
    `SELECT c.id, c.matrix, u.id as user_id,
            COALESCE(u.whatsapp_jid, u.phone_number || '@c.us') as phone
     FROM cards c
     JOIN users u ON u.id = c.user_id
     WHERE c.game_session_id = $1 AND c.status = 'active'`,
    [sessionId]
  );
  const activeCards = cardsRes.rows.map((r: any) => ({
    id: r.id,
    matrix: r.matrix,
    userId: r.user_id,
    phone: r.phone,
  }));

  logger.info({ sessionId, playerCount: activeCards.length }, `[GameStartWorker] Starting game`);

  // Update DB state to RUNNING
  try {
    await query('UPDATE game_sessions SET status = $1 WHERE id = $2', [GameStatus.RUNNING, sessionId]);
  } catch (e: any) {
    logger.warn(`Could not update session ${sessionId} to RUNNING: ${e.message}`);
  }

  // Secuencia siempre de 1-99; el max_balls de la sala controla cuántas se sortean
  const sequence = BingoEngine.generateDrawSequence(undefined, 99);

  // Publish game started event
  eventBus.publish('game.started', { gameId: sessionId, startTime: new Date() });

  // Agrupar cartones por usuario y enviar un único mensaje con todos sus cartones
  const byPhone = new Map<string, typeof activeCards>();
  for (const card of activeCards) {
    if (!byPhone.has(card.phone)) byPhone.set(card.phone, []);
    byPhone.get(card.phone)!.push(card);
  }

  for (const [phone, userCards] of byPhone) {
    let msg = `🎰 *¡EL BINGO EMPIEZA AHORA!* 🎰\n\n`;
    if (userCards.length === 1) {
      msg += `Tu cartón:\n${buildCardBlock(userCards[0].matrix, new Set())}\n\n`;
    } else {
      for (let i = 0; i < userCards.length; i++) {
        msg += `🎟️ *Cartón ${i + 1}*\n${buildCardBlock(userCards[i].matrix, new Set())}\n\n`;
      }
    }
    msg += `Recibirás 3 bolillas cada 30 segundos. ¡Buena suerte! 🍀`;
    await import('../queue').then(({ notifyHighQueue }) =>
      notifyHighQueue.add('send_notification', { to: phone, text: msg })
    );
  }

  // Enqueue first ball draw (10 seg de delay inicial)
  await ballDrawQueue.add('drawBall', {
    sessionId,
    roomId: actualRoomId ?? roomId,
    activeCards,
    sequence,
    currentIdx: 0,
    drawnNumbers: [],
    gameMode,
    maxBalls,
  }, {
    delay: 10000
  });

  logger.info({ sessionId }, `[GameStartWorker] Scheduled first drawBall job`);
}, { connection });

gameStartWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'GameStartWorker failed');
});
