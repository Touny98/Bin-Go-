import { eventBus } from '../utils/EventBus';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { SessionStore } from '../conversation/SessionStore';
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

      // 3. Growth & Loyalty Logic
      await ReferralService.processConversion(payload.userId);
      await LoyaltyService.updateStreak(payload.userId);
      await LoyaltyService.addXP(payload.userId, 100);
    });

    eventBus.subscribe('player.near_win', async (payload) => {
      await NotificationService.handleNearWin(payload);
    });

    eventBus.subscribe('game.started', async (payload) => {
      await NotificationService.handleGameStarted(payload);
    });

    eventBus.subscribe('ball.drawn', async (payload) => {
      await NotificationService.handleBallDrawn(payload);
    });
  }
}

