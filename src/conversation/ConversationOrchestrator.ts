import { SessionStore, UserSession } from './SessionStore';
import { IntentRouter } from './IntentRouter';
import { MainMenuHandler } from './handlers/MainMenuHandler';
import { RoomBrowserHandler } from './handlers/RoomBrowserHandler';
import { PurchaseHandler } from './handlers/PurchaseHandler';
import { PaymentWaitHandler } from './handlers/PaymentWaitHandler';
import { CollectNameHandler } from './handlers/CollectNameHandler';
import { ProfileMenuHandler } from './handlers/ProfileMenuHandler';
import { WithdrawalHandler } from './handlers/WithdrawalHandler';
import { BaseHandler } from './handlers/BaseHandler';
import { logger } from '../utils/logger';
import { notifyHighQueue, connection } from '../queue';
import { Templates } from './templates/MessageTemplates';
import { query } from '../db';

export class ConversationOrchestrator {
  private static handlers: Record<string, BaseHandler> = {
    'IDLE': new MainMenuHandler(),
    'MAIN_MENU': new MainMenuHandler(),
    'ROOM_BROWSER': new RoomBrowserHandler(),
    'PURCHASING': new PurchaseHandler(),
    'WAITING_PAYMENT': new PaymentWaitHandler(),
    'COLLECTING_NAME': new CollectNameHandler(),
    'PROFILE_MENU': new ProfileMenuHandler(),
    'WITHDRAWAL': new WithdrawalHandler(),
  };

  /**
   * Processes an incoming message through the state machine
   */
  public static async processMessage(userId: string, input: string): Promise<void> {
    const startTime = Date.now();
    const lockKey = `lock:conversation:${userId}`;
    
    // 1. Distributed Lock (2 seconds)
    const acquired = await connection.set(lockKey, 'locked', 'EX', 2, 'NX');
    if (!acquired) {
      logger.warn({ userId }, '[ConversationOrchestrator] Lock active, skipping duplicate input');
      return;
    }

    try {
      // 2. Get or Create Session
      const session = await SessionStore.get(userId);
      const stateBefore = session.state;

      // 2b. Keep whatsapp_jid fresh in DB (fixes @lid vs @c.us for outbound notifications)
      const phone = userId.replace(/@c\.us$/, '').replace(/@lid$/, '');
      query(
        `UPDATE users SET whatsapp_jid = $1 WHERE phone_number = $2`,
        [userId, phone]
      ).catch(() => { /* non-critical */ });

      // 3. Identify Intent
      const intent = IntentRouter.route(input);

      // 4. Get Handler
      const handler = this.handlers[session.state] || this.handlers['MAIN_MENU'];

      // 5. Process
      const response = await handler.handle(session, intent, input);
      const stateAfter = response.nextState || session.state;

      // 6. Update Session
      if (response.nextState || response.nextContext) {
        await SessionStore.update(userId, {
          state: stateAfter,
          context: { ...session.context, ...response.nextContext }
        });
      }

      // 7. Send Response
      const messageText = response.message || Templates.UNKNOWN_COMMAND();
      await notifyHighQueue.add('send_notification', { to: userId, text: messageText });

      // 8. Audit Log
      await query(
        `INSERT INTO conversation_logs (user_id, state_before, state_after, intent, payload, latency_ms) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, stateBefore, stateAfter, intent, JSON.stringify({ input, response: messageText }), Date.now() - startTime]
      );

    } catch (error: any) {
      logger.error({ userId, error: error.message }, '[ConversationOrchestrator] Processing failed');
      await notifyHighQueue.add('send_notification', { to: userId, text: Templates.UNKNOWN_COMMAND() });
    } finally {
      // Release lock early if possible (optional, but good practice)
      await connection.del(lockKey);
    }
  }
}

