import { SessionStore, UserSession } from './SessionStore';
import { IntentRouter } from './IntentRouter';
import { MainMenuHandler } from './handlers/MainMenuHandler';
import { RoomBrowserHandler } from './handlers/RoomBrowserHandler';
import { PurchaseHandler } from './handlers/PurchaseHandler';
import { PaymentWaitHandler } from './handlers/PaymentWaitHandler';
import { CollectNameHandler } from './handlers/CollectNameHandler';
import { CollectProfileHandler } from './handlers/CollectProfileHandler';
import { ProfileMenuHandler } from './handlers/ProfileMenuHandler';
import { WithdrawalHandler } from './handlers/WithdrawalHandler';
import { BingoMenuHandler } from './handlers/BingoMenuHandler';
import { TrucoLobbyHandler } from './handlers/TrucoLobbyHandler';
import { TrucoGameHandler } from './handlers/TrucoGameHandler';
import { BaseHandler } from './handlers/BaseHandler';
import { logger } from '../utils/logger';
import { notifyHighQueue } from '../queue';
import { acquireLock, releaseLock } from '../utils/redisLock';
import { Templates } from './templates/MessageTemplates';
import { query } from '../db';

/**
 * Se lanza cuando el usuario ya tiene un mensaje en procesamiento (lock tomado).
 * El ConversationWorker la captura y RE-ENCOLA el mensaje con un pequeño delay
 * en vez de descartarlo: así no se pierde ningún input aunque el usuario
 * responda muy rápido.
 */
export class ConversationBusyError extends Error {
  constructor(public readonly userId: string) {
    super(`Conversation busy for ${userId}`);
    this.name = 'ConversationBusyError';
  }
}

/**
 * TTL del lock de conversación por usuario. Holgado a propósito: debe cubrir el
 * peor caso de un procesamiento (Redis + DB + withMatchLock + N encolados +
 * insert de log). La liberación es por token, así que aunque el TTL venza no se
 * borra el lock de otra ejecución.
 */
const CONVERSATION_LOCK_TTL_MS = parseInt(
  process.env.CONVERSATION_LOCK_TTL_MS || '20000',
  10
);

export class ConversationOrchestrator {
  private static handlers: Record<string, BaseHandler> = {
    'IDLE': new MainMenuHandler(),
    'MAIN_MENU': new MainMenuHandler(),
    'BINGO_MENU': new BingoMenuHandler(),
    'ROOM_BROWSER': new RoomBrowserHandler(),
    'PURCHASING': new PurchaseHandler(),
    'WAITING_PAYMENT': new PaymentWaitHandler(),
    'COLLECTING_NAME': new CollectNameHandler(),
    'COLLECTING_PROFILE': new CollectProfileHandler(),
    'PROFILE_MENU': new ProfileMenuHandler(),
    'WITHDRAWAL': new WithdrawalHandler(),
    'TRUCO_LOBBY': new TrucoLobbyHandler(),
    'TRUCO_QUEUED': new TrucoLobbyHandler(),
    'TRUCO_PROFILE': new TrucoLobbyHandler(),
    'TRUCO_DEPOSIT': new TrucoLobbyHandler(),
    'TRUCO_PLAYING': new TrucoGameHandler(),
  };

  /**
   * Processes an incoming message through the state machine
   */
  public static async processMessage(
    userId: string,
    input: string,
    messageId?: string
  ): Promise<void> {
    const startTime = Date.now();
    const lockKey = `lock:conversation:${userId}`;

    // 1. Lock fencing por usuario. Serializa el procesamiento del MISMO usuario
    //    (evita ejecución concurrente y carreras de sesión) sin serializar a
    //    usuarios distintos. Si está tomado NO descartamos el mensaje: lanzamos
    //    ConversationBusyError y el worker lo re-encola (cero pérdida de input).
    const lockToken = await acquireLock(lockKey, CONVERSATION_LOCK_TTL_MS);
    if (!lockToken) {
      throw new ConversationBusyError(userId);
    }

    try {
      // 2. Get or Create Session
      const session = await SessionStore.get(userId);
      const stateBefore = session.state;

      // Número efectivo para DB queries y logs (Meta Cloud API envía números planos)
      const phone = (session.context.resolvedPhone ?? userId)
        .replace(/@c\.us$/, '')
        .replace(/@s\.whatsapp\.net$/, '')
        .replace(/@lid$/, '');

      // Guardar/actualizar el JID en DB para notificaciones salientes futuras
      query(
        `UPDATE users SET whatsapp_jid = $1 WHERE phone_number = $2`,
        [userId, phone]
      ).catch(() => { /* non-critical */ });

      // 3. Identify Intent
      const intent = IntentRouter.route(input);

      // Global override: bingo_switch → menú principal de plataforma (desde cualquier estado bingo)
      if (input.trim().toLowerCase() === 'bingo_switch') {
        const platformText = Templates.MAIN_MENU();
        await SessionStore.update(userId, { state: 'MAIN_MENU', context: {} });
        await notifyHighQueue.add('send_buttons', {
          to: userId,
          text: platformText,
          buttons: [
            { id: 'bingo',      label: '🎡 Bingo' },
            { id: 'play_truco', label: '🃏 Truco'  },
          ],
          footer: 'TIMBA — tu plataforma de juegos',
          fallbackText: platformText,
        });
        return;
      }

      // 4. Get Handler
      const handler = this.handlers[session.state] || this.handlers['MAIN_MENU'];

      // 5. Process
      const response = await handler.handle(session, intent, input, { messageId });
      const stateAfter = response.nextState || session.state;

      // 6. Update Session
      if (response.nextState || response.nextContext) {
        await SessionStore.update(userId, {
          state: stateAfter,
          context: { ...session.context, ...response.nextContext }
        });
      }

      // 7. Send Response — soporta texto, botones y listas
      // Si la respuesta está marcada como `silent`, el handler ya empujó las
      // notificaciones por canal lateral; no enviamos nada inline.
      if (response.silent) {
        await query(
          `INSERT INTO conversation_logs (user_id, state_before, state_after, intent, payload, latency_ms)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, stateBefore, stateAfter, intent, JSON.stringify({ input, response: '[SILENT]' }), Date.now() - startTime]
        );
        return;
      }

      const fallbackText = response.message || Templates.UNKNOWN_COMMAND();

      if (response.buttons) {
        // Mensaje con botones interactivos
        await notifyHighQueue.add('send_buttons', {
          to: userId,
          text: response.buttons.text,
          buttons: response.buttons.buttons,
          footer: response.buttons.footer,
          fallbackText,
        });
      } else if (response.list) {
        // Si hay mensaje separado, enviarlo primero
        if (response.message && response.message !== response.list.text) {
          await notifyHighQueue.add('send_notification', { to: userId, text: response.message });
        }
        // Mensaje de lista interactiva
        await notifyHighQueue.add('send_list', {
          to: userId,
          text: response.list.text,
          buttonLabel: response.list.buttonLabel,
          sections: response.list.sections,
          title: response.list.title,
          footer: response.list.footer,
          fallbackText,
        });
      } else {
        // Texto plano (comportamiento original)
        await notifyHighQueue.add('send_notification', { to: userId, text: fallbackText });
      }

      // 7b. Follow-up nav message — delayed so it arrives after the main message
      if (response.followUp) {
        await notifyHighQueue.add('send_buttons', {
          to: userId,
          text: response.followUp.text,
          buttons: response.followUp.buttons,
          footer: response.followUp.footer,
          fallbackText: '',
        }, { delay: 1000 });
      }

      // 8. Audit Log
      const messagePreview = response.buttons
        ? `[BUTTONS] ${response.buttons.text.substring(0, 60)}`
        : response.list
          ? `[LIST] ${response.list.text.substring(0, 60)}`
          : fallbackText;

      await query(
        `INSERT INTO conversation_logs (user_id, state_before, state_after, intent, payload, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, stateBefore, stateAfter, intent, JSON.stringify({ input, response: messagePreview }), Date.now() - startTime]
      );

    } catch (error: any) {
      logger.error({ userId, error: error.message }, '[ConversationOrchestrator] Processing failed');
      await notifyHighQueue.add('send_notification', { to: userId, text: Templates.UNKNOWN_COMMAND() });
    } finally {
      // Liberación por token: nunca borra el lock de otra ejecución.
      await releaseLock(lockKey, lockToken);
    }
  }
}
