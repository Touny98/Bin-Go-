import { logger } from '../utils/logger';
import { notifyHighQueue } from '../queue';
import { SocketServer } from '../realtime/SocketServer';
import { query } from '../db';

// Cuántas bolillas restantes disparan cada alerta (por max_balls)
const TENSION_THRESHOLDS: Record<number, number[]> = {
  45: [10, 5, 3, 1],
  60: [15, 10, 5, 1],
  75: [20, 10, 5, 1],
};

const TENSION_MESSAGES: Record<number, string> = {
  20: '⚡ ¡Quedan 20 bolillas! ¿Alguien hace bingo?',
  15: '⚡ ¡Quedan 15 bolillas! El juego se pone caliente 🔥',
  10: '🔥 ¡Solo quedan 10 bolillas! ¿Estás cerca?',
  5:  '😰 ¡QUEDAN 5 BOLILLAS! La tensión es máxima',
  3:  '💥 ¡3 BOLILLAS! El Sale o Sale está por activarse',
  1:  '🚨 ¡ÚLTIMA BOLILLA! Si nadie canta BINGO, gana el mejor cartón',
};

export class TensionEventEmitter {
  /**
   * Evalúa si corresponde emitir una alerta de tensión después de cada bolilla sorteada.
   * Se llama desde BallDrawWorker.
   */
  public static async check(
    sessionId: number,
    drawnCount: number,
    maxBalls: number,
    gameMode: string
  ): Promise<void> {
    // Solo en Sale o Sale
    if (gameMode !== 'SALE_O_SALE') return;

    const remaining = maxBalls - drawnCount;
    const thresholds = TENSION_THRESHOLDS[maxBalls] ?? [10, 5, 3, 1];

    if (!thresholds.includes(remaining)) return;

    const msg = TENSION_MESSAGES[remaining] ?? `⚡ ¡Quedan ${remaining} bolillas!`;

    logger.info({ sessionId, remaining, maxBalls }, '[TensionEventEmitter] Emitting tension alert');

    // Emitir por WebSocket a la sala
    SocketServer.emitToRoom(`game:${sessionId}`, 'tension_alert', {
      sessionId,
      remaining,
      maxBalls,
      message: msg,
    });

    // Obtener jugadores activos de esta sesión y notificar por WhatsApp
    try {
      const playersRes = await query(
        `SELECT DISTINCT u.phone_number
         FROM cards c
         JOIN users u ON u.id = c.user_id
         WHERE c.game_session_id = $1 AND c.status = 'active'`,
        [sessionId]
      );

      for (const row of playersRes.rows) {
        const chatId = row.phone_number.includes('@')
          ? row.phone_number
          : `${row.phone_number}@c.us`;

        await notifyHighQueue.add('send_notification', {
          to: chatId,
          text: msg,
        });
      }
    } catch (e: any) {
      logger.warn({ sessionId, error: e.message }, '[TensionEventEmitter] Failed to notify players');
    }
  }
}
