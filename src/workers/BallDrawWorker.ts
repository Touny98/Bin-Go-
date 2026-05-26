import { Worker, Job } from 'bullmq';
import { connection, ballDrawQueue, notifyHighQueue } from '../queue';
import { logger } from '../utils/logger';
import { eventBus } from '../utils/EventBus';
import { BingoEngine } from '../engine/BingoGame';
import { query } from '../db';
import { GameSessionService } from '../domain/GameSessionService';
import { SaleOSaleResolver } from '../game/SaleOSaleResolver';
import { WalletEngine } from '../finance/WalletEngine';
import { TensionEventEmitter } from '../game/TensionEventEmitter';
import { buildCardBlock, getNearWinThreshold } from '../utils/cardFormatter';

export const ballDrawWorker = new Worker('ball-draw-queue', async (job: Job) => {
  const {
    sessionId, roomId, activeCards,
    sequence, currentIdx, drawnNumbers,
    gameMode, maxBalls,
  } = job.data;

  const startTimeMs = Date.now();

  if (currentIdx >= sequence.length) {
    logger.info({ sessionId }, `[BallDrawWorker] Sequence exhausted without winner`);
    await handleNoWinner(sessionId, gameMode ?? 'SALE_O_SALE', maxBalls ?? sequence.length);
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
    logger.warn({ sessionId, drawOrder, ball }, `[BallDrawWorker] Idempotency: ball already drawn`);
    return;
  }

  const newDrawnNumbers = [...drawnNumbers, ball];
  const drawnSet = new Set<number>(newDrawnNumbers);

  logger.info({ sessionId, ball, drawOrder }, `[BallDrawWorker] Drew ball ${ball}`);

  try {
    await query(
      'UPDATE game_sessions SET drawn_numbers = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newDrawnNumbers), sessionId]
    );
  } catch (e) { /* non-critical */ }

  eventBus.publish('ball.drawn', { gameId: sessionId, number: ball, drawOrder });

  const effectiveMaxBalls = maxBalls ?? sequence.length;
  const remaining = effectiveMaxBalls - newDrawnNumbers.length;

  // ── Notificar cada 3 bolillas (1 mensaje por minuto) ─────────────────────
  const isBatchEnd = drawOrder % 3 === 0 || remaining === 0;
  if (isBatchEnd) {
    const batchStart = drawOrder - (drawOrder % 3 === 0 ? 2 : (drawOrder % 3) - 1);
    const batchBalls = newDrawnNumbers.slice(batchStart - 1, drawOrder);

    const threshold = getNearWinThreshold(gameMode ?? 'SALE_O_SALE', effectiveMaxBalls);
    const byPhone = groupByPhone(activeCards as Array<{ phone: string; matrix: (number | null)[][] }>);
    for (const [phone, userCards] of byPhone) {
      let msg = `🎱 *Bolillas: ${batchBalls.map(n => String(n).padStart(2, '0')).join(' — ')}*\n\n`;
      if (userCards.length === 1) {
        msg += `Tu cartón:\n${buildCardBlock(userCards[0].matrix, drawnSet, threshold)}\n\n`;
      } else {
        for (let i = 0; i < userCards.length; i++) {
          msg += `🎟️ *Cartón ${i + 1}*\n${buildCardBlock(userCards[i].matrix, drawnSet, threshold)}\n\n`;
        }
      }
      msg += `Sorteadas: ${newDrawnNumbers.length}/${effectiveMaxBalls}`;
      await notifyHighQueue.add('send_notification', { to: phone, text: msg });
    }
  }

  // ── Mensaje de tensión: quedan 5 bolillas (una vez por usuario) ───────────
  if (remaining === 5) {
    const uniquePhones = [...new Set(activeCards.map((c: any) => c.phone))];
    for (const phone of uniquePhones) {
      const msg =
        `🔥 *¡SALE O SALE!* ¡Quedan solo *5 bolillas*!\n\n` +
        `Ahora es cuando se define todo. ¡Concentrate en tu cartón! 🎯`;
      await notifyHighQueue.add('send_notification', { to: phone, text: msg });
    }
  }

  // ── Alertas de tensión ──────────────────────────────────────────────────────
  await TensionEventEmitter.check(sessionId, newDrawnNumbers.length, effectiveMaxBalls, gameMode ?? 'SALE_O_SALE');

  // ── Detectar ganador de BINGO completo ─────────────────────────────────────
  let bingoWinner = null;
  let lineWinner = null;

  for (const card of activeCards) {
    const remaining = card.matrix.flat().filter(
      (n: number | null) => n !== null && !drawnSet.has(n)
    );

    if (remaining.length === 0) {
      bingoWinner = card;
      break;
    }

    if (remaining.length <= 2) {
      eventBus.publish('player.near_win', {
        gameId: sessionId,
        userId: card.userId,
        remaining: remaining.length,
        lastNumberNeeded: remaining.length === 1 ? remaining[0] : null,
      });
    }

    if (!lineWinner && BingoEngine.checkLine(card.matrix, drawnSet)) {
      lineWinner = card;
    }
  }

  if (bingoWinner) {
    logger.info({ sessionId, cardId: bingoWinner.id }, `[BallDrawWorker] BINGO winner detected!`);
    const locked = await GameSessionService.lockWinner(sessionId, bingoWinner.userId);
    if (locked) {
      await payoutJackpot(sessionId, bingoWinner.userId, bingoWinner.id, 'BINGO_WIN');

      // Mark all cards as completed when game ends
      await query('UPDATE cards SET status = $1 WHERE game_session_id = $2 AND status = $3',
        ['completed', sessionId, 'active']);

      // Mark session as completed
      await query('UPDATE game_sessions SET status = $1 WHERE id = $2',
        ['COMPLETED', sessionId]);

      eventBus.publish('winner.detected', {
        gameId: sessionId,
        cardId: bingoWinner.id,
        userId: bingoWinner.userId,
        type: 'bingo',
      });
    }
    return;
  }

  // ── Verificar si se alcanzó el máximo de bolillas ─────────────────────────
  if (newDrawnNumbers.length >= effectiveMaxBalls) {
    logger.info({ sessionId, effectiveMaxBalls, gameMode }, `[BallDrawWorker] Max balls reached`);
    await handleNoWinner(sessionId, gameMode ?? 'SALE_O_SALE', effectiveMaxBalls);
    return;
  }

  // ── Programar siguiente bolilla (10 seg → 3 bolillas cada 30 seg) ──────────
  await ballDrawQueue.add('drawBall', {
    sessionId, roomId, activeCards,
    sequence, currentIdx: currentIdx + 1,
    drawnNumbers: newDrawnNumbers,
    gameMode, maxBalls,
  }, {
    delay: 10000,
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });

}, { connection });

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByPhone<T extends { phone: string }>(cards: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const card of cards) {
    if (!map.has(card.phone)) map.set(card.phone, []);
    map.get(card.phone)!.push(card);
  }
  return map;
}


async function handleNoWinner(sessionId: number, gameMode: string, maxBalls: number): Promise<void> {
  if (gameMode === 'SALE_O_SALE') {
    logger.info({ sessionId }, '[BallDrawWorker] Triggering Sale o Sale resolution');
    await SaleOSaleResolver.resolve(sessionId);
  } else if (gameMode === 'ACCUMULATIVE') {
    logger.info({ sessionId }, '[BallDrawWorker] No winner — rolling over jackpot');
    await SaleOSaleResolver.rolloverJackpot(sessionId);

    // Notificar a jugadores del rollover
    try {
      const playersRes = await query(
        `SELECT DISTINCT u.phone_number, u.whatsapp_jid, gs.jackpot_amount
         FROM cards c
         JOIN users u ON u.id = c.user_id
         JOIN game_sessions gs ON gs.id = c.game_session_id
         WHERE c.game_session_id = $1 AND c.status = 'active'`,
        [sessionId]
      );
      if (playersRes.rows.length > 0) {
        const jackpot = parseFloat(playersRes.rows[0].jackpot_amount);
        const montoStr = new Intl.NumberFormat('es-AR').format(jackpot);
        const msg =
          `😮 *¡Esta semana el Jackpot quedó sin ganador!*\n\n` +
          `El pozo de *$${montoStr}* se acumula para el próximo Domingo Millonario 🏆\n\n` +
          `¡El próximo domingo podés ganar más que nunca!\n` +
          `Escribí *MENU* para ver el próximo sorteo.`;

        for (const row of playersRes.rows) {
          const chatId = row.whatsapp_jid || (row.phone_number.includes('@') ? row.phone_number : `${row.phone_number}@c.us`);
          await notifyHighQueue.add('send_notification', { to: chatId, text: msg });
        }
      }
    } catch (e: any) {
      logger.warn({ sessionId, error: e.message }, '[BallDrawWorker] Failed to notify rollover');
    }
  }

  // Mark cards as completed and session as COMPLETED after resolving
  await query('UPDATE cards SET status = $1 WHERE game_session_id = $2 AND status = $3',
    ['completed', sessionId, 'active']);
  await query('UPDATE game_sessions SET status = $1 WHERE id = $2',
    ['COMPLETED', sessionId]);
}

async function payoutJackpot(
  sessionId: number,
  userId: string,
  cardId: number,
  reason: string
): Promise<void> {
  const sessionRes = await query(
    `SELECT gs.jackpot_amount, gs.room_id, gs.rollover_weeks,
            r.game_mode, r.accumulated_jackpot
     FROM game_sessions gs
     JOIN rooms r ON r.id = gs.room_id
     WHERE gs.id = $1`,
    [sessionId]
  );
  if (sessionRes.rows.length === 0) return;

  const { jackpot_amount, room_id, rollover_weeks, game_mode, accumulated_jackpot } = sessionRes.rows[0];
  let totalJackpot = parseFloat(jackpot_amount);

  // Para sala acumulativa, sumar el jackpot acumulado de semanas anteriores
  if (game_mode === 'ACCUMULATIVE') {
    totalJackpot += parseFloat(accumulated_jackpot);
    await query('UPDATE rooms SET accumulated_jackpot = 0 WHERE id = $1', [room_id]);
  }

  const isoWeek = getISOWeek(new Date());
  const montoStr = new Intl.NumberFormat('es-AR').format(totalJackpot);

  // Registrar en jackpot_audit
  await query(
    `INSERT INTO jackpot_audit
       (session_id, room_id, event_type, amount, card_id, user_id,
        balance_before, balance_after, week_number, metadata)
     VALUES ($1,$2,'PAYOUT',$3,$4,$5,$6,0,$7,$8)`,
    [
      sessionId, room_id, totalJackpot, cardId, userId,
      totalJackpot, isoWeek,
      JSON.stringify({ reason, rollover_weeks }),
    ]
  );

  // Usar WalletEngine.credit() para acreditar el premio
  const phoneRes = await query('SELECT phone_number FROM users WHERE id = $1', [userId]);
  const walletUserId = phoneRes.rows[0]?.phone_number ?? String(userId);
  await WalletEngine.credit(walletUserId, totalJackpot, 'WINNING', `SESSION_${sessionId}`);

  // Actualizar leaderboard
  await query(
    `INSERT INTO leaderboards (user_id, total_wins, total_jackpot_won, last_win_at)
     VALUES ($1, 1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET total_wins = leaderboards.total_wins + 1,
         total_jackpot_won = leaderboards.total_jackpot_won + $2,
         last_win_at = NOW()`,
    [userId, totalJackpot]
  );

  // Cerrar sesión
  await query(
    `UPDATE game_sessions
     SET status = 'FINISHED', finish_reason = $1, jackpot_paid = $2, jackpot_amount = 0, updated_at = NOW()
     WHERE id = $3`,
    [reason, totalJackpot, sessionId]
  );

  // Notificar al ganador — obtener su JID correcto
  const winnerJidRes = await query('SELECT whatsapp_jid, phone_number FROM users WHERE id = $1', [userId]);
  const chatId = winnerJidRes.rows[0]?.whatsapp_jid || `${winnerJidRes.rows[0]?.phone_number}@c.us`;

  let winMsg: string;

  if (game_mode === 'ACCUMULATIVE' && rollover_weeks > 0) {
    winMsg =
      `🏆 *¡¡JACKPOT ACUMULADO!!* 🏆\n\n` +
      `¡Cantaste BINGO en el Domingo Millonario!\n` +
      `¡El pozo llevaba *${rollover_weeks} semana${rollover_weeks > 1 ? 's' : ''}* acumulando!\n\n` +
      `💰 *GANASTE $${montoStr}*\n\n` +
      `¡Felicitaciones! El monto será acreditado en breve.`;
  } else {
    winMsg =
      `🏆 *¡¡BINGO!! ¡GANASTE!* 🏆\n\n` +
      `¡Completaste tu cartón primero!\n\n` +
      `💰 *Premio: $${montoStr}*\n\n` +
      `¡Felicitaciones! El monto será acreditado en breve.`;
  }

  await notifyHighQueue.add('send_notification', { to: chatId, text: winMsg });

  logger.info({ sessionId, userId, totalJackpot, reason }, '[BallDrawWorker] Jackpot paid out');
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

ballDrawWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'BallDrawWorker failed');
});
