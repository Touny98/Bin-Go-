import { eventBus } from '../utils/EventBus';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { SessionStore } from '../conversation/SessionStore';
import { renderQueue } from '../queue';
import { query } from '../db';
import { ReferralService } from '../growth/ReferralService';
import { LoyaltyService } from '../growth/LoyaltyService';

export class EventSubscribers {
  public static initialize() {
    logger.info('[EventSubscribers] Binding domain events to NotificationService...');

    eventBus.subscribe('winner.detected', async (payload) => {
      await NotificationService.handleWinnerDetected(payload);
      // Reward Winner with XP
      await LoyaltyService.addXP(payload.userId, 500);
    });

    eventBus.subscribe('payment.confirmed', async (payload) => {
      // 1. Notify Text
      await NotificationService.handlePaymentConfirmed(payload);
      
      // 2. Automagically transition session state
      try {
        await SessionStore.update(payload.userId, { state: 'GAME_ACTIVE' });
      } catch (e) {}

      // 3. Trigger Render for cards
      try {
        const cardsRes = await query('SELECT id, matrix, integrity_hash FROM cards WHERE user_id = $1 AND status = $2', [payload.userId, 'active']);
        for (const row of cardsRes.rows) {
          await renderQueue.add('render_initial_card', {
            userId: payload.userId,
            cardMatrix: row.matrix,
            options: { integrityHash: row.integrity_hash },
            caption: `🎫 ¡Tu cartón #${row.id} para la próxima partida!`
          });
        }
      } catch (e) {}

      // 4. Growth & Loyalty Logic
      await ReferralService.processConversion(payload.userId);
      await LoyaltyService.updateStreak(payload.userId);
      await LoyaltyService.addXP(payload.userId, 100);
    });

    eventBus.subscribe('player.near_win', async (payload) => {
      // 1. Notify Text (Hype)
      await NotificationService.handleNearWin(payload);

      // 2. Trigger "Near Win" Render
      try {
        const cardRes = await query('SELECT matrix, integrity_hash FROM cards WHERE user_id = $1 AND game_session_id = $2 AND status = $3 LIMIT 1', [payload.userId, payload.gameId, 'active']);
        if (cardRes.rows.length > 0) {
          const { matrix, integrity_hash } = cardRes.rows[0];
          const drawnRes = await query('SELECT drawn_numbers FROM game_sessions WHERE id = $1', [payload.gameId]);
          const drawnNumbersSet = new Set<number>(drawnRes.rows[0].drawn_numbers || []);

          await renderQueue.add('render_near_win', {
            userId: payload.userId,
            cardMatrix: matrix,
            options: { 
              integrityHash: integrity_hash,
              highlightedNumbers: Array.from(drawnNumbersSet),
              overlayText: '¡CASI GANAS!'
            },
            caption: `🔥 ¡Míralo tú mismo! Te falta muy poco...`
          });
        }
      } catch (e) {}
    });

    eventBus.subscribe('game.started', async (payload) => {
      await NotificationService.handleGameStarted(payload);
    });

    eventBus.subscribe('ball.drawn', async (payload) => {
      await NotificationService.handleBallDrawn(payload);
    });
  }
}

