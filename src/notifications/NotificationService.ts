import { notifyHighQueue, notifyBulkQueue } from '../queue';
import { logger } from '../utils/logger';
import { query } from '../db';

export class NotificationService {
  /**
   * Translates a raw domain event into a Notification Job.
   * Uses notifyHighQueue for critical messages (winners, payments).
   */
  public static async notifyHighPriority(userId: string, eventType: string, text: string) {
    logger.info({ userId, eventType }, `[NotificationService] Enqueueing HIGH priority notification`);
    
    // Log intent to DB
    const logRes = await query(
      `INSERT INTO notification_logs (user_id, event_type, provider, status, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, eventType, 'whatsapp', 'PENDING', text]
    );

    await notifyHighQueue.add('send_notification', {
      logId: logRes.rows[0].id,
      to: userId,
      text
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 }
    });
  }

  public static async notifyWithImage(userId: string, eventType: string, mediaPath: string, caption?: string) {
    logger.info({ userId, eventType }, `[NotificationService] Enqueueing MEDIA notification`);
    
    const logRes = await query(
      `INSERT INTO notification_logs (user_id, event_type, provider, status, payload) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, eventType, 'whatsapp', 'PENDING', caption || 'Media']
    );

    await notifyHighQueue.add('send_media_notification', {
      logId: logRes.rows[0].id,
      to: userId,
      text: caption,
      mediaPath
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });
  }

  /**
   * Translates a raw domain event into a Bulk Notification Job.
   * Uses notifyBulkQueue which is heavily rate-limited.
   */
  public static async notifyBulk(userId: string, eventType: string, text: string) {
    // For bulk, we might not want to bloat the DB with 1000s of rows for every ball.
    // In a real system, we'd log bulk messages grouped by session, but for this architecture
    // we'll enqueue directly to save DB I/O.
    
    await notifyBulkQueue.add('send_notification', {
      to: userId,
      text
    });
  }

  // --- Handlers for Specific Domain Events ---

  public static async handleWinnerDetected(payload: { gameId: number, cardId: number, userId: string, type: string }) {
    const text = `🏆 ¡ERES EL GANADOR! 🏆\n\nHas cantado BINGO con tu cartón #${payload.cardId}.`;
    await this.notifyHighPriority(payload.userId, 'winner.detected', text);
  }

  public static async handlePaymentConfirmed(payload: { paymentId: string, userId: string, amount: number }) {
    const text = `✅ ¡Pago Confirmado!\n\nTu pago de $${payload.amount} ha sido procesado. Tus cartones están activos para la próxima sala.`;
    await this.notifyHighPriority(payload.userId, 'payment.confirmed', text);
  }

  public static async handleNearWin(payload: { gameId: number, userId: string, remaining: number, lastNumberNeeded: number | null }) {
    let text = '';
    if (payload.remaining === 1) {
      text = `😱🔥 ¡SOLO TE FALTA UNO!\n\nNecesitas el número *${payload.lastNumberNeeded}* para cantar BINGO en la sala #${payload.gameId}. ¡Mucha suerte!`;
    } else {
      text = `🔥 ¡Estás muy cerca!\n\nSolo te faltan *2 números* para el BINGO en la sala #${payload.gameId}.`;
    }
    
    // We notify this via High Priority because it's high-engagement
    await this.notifyHighPriority(payload.userId, 'player.near_win', text);
  }

  public static async handleGameStarted(payload: { gameId: number, startTime: Date }) {
    const text = `🎰 ¡La sala #${payload.gameId} ha cerrado puertas!\n⏳ La partida comienza AHORA.`;
    // In a real app, you'd fetch all active userIds for this game and map over notifyBulk
    await this.notifyBulk('all_players', 'game.started', text); 
  }

  public static async handleBallDrawn(payload: { gameId: number, number: number, drawOrder: number }) {
    // Conversational UX: We only notify every 3 balls to prevent spam
    if (payload.drawOrder % 3 === 0) {
      const text = `🎱 ¡Nueva Bola: ${payload.number}!\n(Extracción #${payload.drawOrder})`;
      await this.notifyBulk('all_players', 'ball.drawn', text);
    }
  }
}
