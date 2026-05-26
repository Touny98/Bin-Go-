import { query } from '../db';
import { logger } from '../utils/logger';
import { notifyHighQueue } from '../queue';
import { SocketServer } from '../realtime/SocketServer';
import { WalletEngine } from '../finance/WalletEngine';

export interface SaleOSaleResult {
  winners: Array<{ userId: string; cardId: number; hits: number }>;
  jackpotPerWinner: number;
  totalJackpot: number;
  isTie: boolean;
}

export class SaleOSaleResolver {
  /**
   * Calcula el ganador (o ganadores en empate) por mayor cantidad de aciertos.
   * Llamar cuando se alcanza max_balls sin bingo tradicional.
   */
  public static async resolve(sessionId: number): Promise<SaleOSaleResult | null> {
    // Obtener bolillas sorteadas y monto del jackpot
    const sessionRes = await query(
      `SELECT gs.drawn_numbers, gs.jackpot_amount, gs.room_id,
              r.tie_rule, r.game_mode
       FROM game_sessions gs
       JOIN rooms r ON r.id = gs.room_id
       WHERE gs.id = $1`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) return null;

    const drawnNumbers: number[] = sessionRes.rows[0].drawn_numbers as number[];
    const jackpotAmount = parseFloat(sessionRes.rows[0].jackpot_amount);
    const roomId = sessionRes.rows[0].room_id;
    const tieRule: string = sessionRes.rows[0].tie_rule;
    const drawnSet = new Set(drawnNumbers);

    // Obtener todos los cartones activos de la sesión
    const cardsRes = await query(
      `SELECT id, user_id, matrix FROM cards
       WHERE game_session_id = $1 AND status = 'active'`,
      [sessionId]
    );

    if (cardsRes.rows.length === 0) {
      logger.warn({ sessionId }, '[SaleOSaleResolver] No active cards found');
      return null;
    }

    // Calcular aciertos por cartón
    const scored = cardsRes.rows.map((card: any) => {
      const matrix: (number | null)[][] = card.matrix;
      const flatNumbers = matrix.flat().filter((n): n is number => n !== null);
      const hits = flatNumbers.filter(n => drawnSet.has(n)).length;
      return { cardId: card.id, userId: card.user_id, hits };
    });

    // Ordenar por hits descendente
    scored.sort((a, b) => b.hits - a.hits);
    const topScore = scored[0].hits;
    const winners = scored.filter(c => c.hits === topScore);

    logger.info(
      { sessionId, topScore, winnerCount: winners.length, isTie: winners.length > 1 },
      '[SaleOSaleResolver] Sale o Sale resolution complete'
    );

    const jackpotPerWinner = jackpotAmount / winners.length;
    const isoWeek = getISOWeek(new Date());

    // Registrar pagos y actualizar ledger para cada ganador
    for (const winner of winners) {
      const balanceBefore = jackpotAmount;
      const balanceAfter = 0;

      await query(
        `INSERT INTO jackpot_audit
           (session_id, room_id, event_type, amount, card_id, user_id,
            balance_before, balance_after, week_number, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          sessionId, roomId,
          winners.length > 1 ? 'SPLIT_PAYOUT' : 'PAYOUT',
          jackpotPerWinner,
          winner.cardId, winner.userId,
          balanceBefore, balanceAfter,
          isoWeek,
          JSON.stringify({ topScore, totalWinners: winners.length, tieRule }),
        ]
      );

      // Usar WalletEngine.credit() para acreditar el premio
      const phoneRes = await query('SELECT phone_number FROM users WHERE id = $1', [winner.userId]);
      const walletUserId = phoneRes.rows[0]?.phone_number ?? String(winner.userId);
      await WalletEngine.credit(walletUserId, jackpotPerWinner, 'WINNING', `SESSION_${sessionId}`);

      // Notificar al ganador por WhatsApp — obtener JID real de la DB
      const jidRes = await query('SELECT whatsapp_jid, phone_number FROM users WHERE id = $1', [winner.userId]);
      const chatId = jidRes.rows[0]?.whatsapp_jid || `${jidRes.rows[0]?.phone_number}@c.us`;
      const montoStr = new Intl.NumberFormat('es-AR').format(jackpotPerWinner);

      let msg: string;
      if (winners.length === 1) {
        msg =
          `🏆 *¡GANASTE el Sale o Sale!*\n\n` +
          `Completaste más bolillas que todos: *${topScore} aciertos* 🎯\n` +
          `💰 Premio: *$${montoStr}*\n\n` +
          `¡Felicitaciones! El monto será acreditado en breve.`;
      } else {
        msg =
          `🏆 *¡Empate! Ganaste el Sale o Sale compartido*\n\n` +
          `Vos y ${winners.length - 1} jugador${winners.length > 2 ? 'es' : ''} más ` +
          `alcanzaron *${topScore} aciertos* 🎯\n` +
          `💰 Tu parte: *$${montoStr}*\n\n` +
          `¡Felicitaciones!`;
      }

      await notifyHighQueue.add('send_notification', { to: chatId, text: msg });
    }

    // Marcar sesión como terminada
    await query(
      `UPDATE game_sessions
       SET status = 'FINISHED',
           finish_reason = 'SALE_O_SALE_WIN',
           jackpot_paid = $1,
           jackpot_amount = 0,
           updated_at = NOW()
       WHERE id = $2`,
      [jackpotAmount, sessionId]
    );

    // Emitir evento WebSocket a la sala y global
    const eventPayload = {
      sessionId,
      winners: winners.map(w => ({ userId: w.userId, hits: w.hits, prize: jackpotPerWinner })),
      totalJackpot: jackpotAmount,
      isTie: winners.length > 1,
    };
    SocketServer.emitToRoom(`game:${sessionId}`, 'sale_o_sale_resolved', eventPayload);
    SocketServer.emitGlobal('jackpot_won', eventPayload);

    return { winners, jackpotPerWinner, totalJackpot: jackpotAmount, isTie: winners.length > 1 };
  }

  /**
   * Acumula el jackpot para la semana siguiente (modo ACCUMULATIVE sin ganador).
   */
  public static async rolloverJackpot(sessionId: number): Promise<void> {
    const sessionRes = await query(
      `SELECT gs.jackpot_amount, gs.room_id, gs.rollover_weeks
       FROM game_sessions gs
       WHERE gs.id = $1`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) return;

    const { jackpot_amount, room_id, rollover_weeks } = sessionRes.rows[0];
    const amount = parseFloat(jackpot_amount);
    const isoWeek = getISOWeek(new Date());

    // Acumular en la sala
    const roomBefore = await query(
      'SELECT accumulated_jackpot FROM rooms WHERE id = $1',
      [room_id]
    );
    const accBefore = parseFloat(roomBefore.rows[0].accumulated_jackpot);
    const accAfter = accBefore + amount;

    await query(
      'UPDATE rooms SET accumulated_jackpot = $1 WHERE id = $2',
      [accAfter, room_id]
    );

    // Registrar rollover en jackpot_audit
    await query(
      `INSERT INTO jackpot_audit
         (session_id, room_id, event_type, amount, balance_before, balance_after, week_number, metadata)
       VALUES ($1,$2,'ROLLOVER',$3,$4,$5,$6,$7)`,
      [
        sessionId, room_id, amount,
        accBefore, accAfter, isoWeek,
        JSON.stringify({ rollover_weeks: rollover_weeks + 1 }),
      ]
    );

    // Cerrar la sesión
    await query(
      `UPDATE game_sessions
       SET status = 'FINISHED',
           finish_reason = 'JACKPOT_ROLLOVER',
           jackpot_paid = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    logger.info(
      { sessionId, room_id, amount, accAfter, newWeeks: rollover_weeks + 1 },
      '[SaleOSaleResolver] Jackpot rolled over to next week'
    );

    // Emitir evento WebSocket
    SocketServer.emitGlobal('jackpot_rolled', {
      sessionId, roomId: room_id,
      accumulated: accAfter,
      rolloverWeeks: rollover_weeks + 1,
    });
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
