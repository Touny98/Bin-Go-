import { logger } from '../utils/logger';

export class WorkerFactory {
  /**
   * Selectively boots workers based on environment variables
   */
  public static async boot() {
    const mode = process.env.WORKER_MODE || 'ALL';
    logger.info({ mode }, '[WorkerFactory] Booting workers...');

    if (mode === 'ALL' || mode === 'CONVERSATION') {
      await import('../workers/ConversationWorker');
    }

    if (mode === 'ALL' || mode === 'FINANCE') {
      await import('../workers/PaymentConfirmationWorker');
      await import('../workers/PayoutProcessorWorker');
      await import('../workers/ReservationExpireWorker');
      await import('../workers/ReconciliationWorker');
    }

    if (mode === 'ALL' || mode === 'GAME') {
      await import('../workers/GameStartWorker');
      await import('../workers/BallDrawWorker');
    }

    if (mode === 'ALL' || mode === 'NOTIFICATIONS') {
      await import('../workers/NotificationWorker');
    }

    if (mode === 'ALL' || mode === 'GROWTH') {
      await import('../workers/CampaignWorker');
    }

    if (mode === 'ALL' || mode === 'TRUCO') {
      await import('../workers/TrucoMatchmakingWorker');
      await import('../workers/TrucoTurnTimeoutWorker');
      await import('../workers/TrucoPayoutWorker');
    }
  }
}
