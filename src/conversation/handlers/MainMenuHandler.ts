import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { RoomCatalogService } from '../../domain/RoomCatalogService';
import { query } from '../../db';

export class MainMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    // Gate de recopilación de nombre: solo en estado IDLE
    if (session.state === 'IDLE') {
      const phone = session.userId.replace('@c.us', '').replace('@lid', '');
      const userCheck = await query(`
        SELECT u.name,
               (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id) AS total_cards
        FROM users u
        WHERE u.phone_number = $1
      `, [phone]);

      if (userCheck.rows.length > 0) {
        const { name, total_cards } = userCheck.rows[0];
        const hasPlayed = parseInt(total_cards) > 0;
        if (hasPlayed && !name) {
          return {
            nextState: 'COLLECTING_NAME',
            message: Templates.ASK_NAME()
          };
        }
      }
    }

    switch (intent) {
      case 'VIEW_ROOMS':
      case 'BUY_CARDS': {
        const rooms = await RoomCatalogService.getAvailableRooms();
        return {
          nextState: 'ROOM_BROWSER',
          message: Templates.ROOM_LIST(rooms)
        };
      }

      case 'VIEW_PROFILE': {
        const phone = session.userId.replace('@c.us', '').replace('@lid', '');
        const profileRes = await query(`
          SELECT
            u.name,
            COALESCE(w.real_balance, 0) + COALESCE(w.bonus_balance, 0) AS balance,
            (SELECT COUNT(*) FROM cards c WHERE c.user_id = u.id AND c.status = 'active') AS active_cards
          FROM users u
          LEFT JOIN wallets w ON w.user_id = $1
          WHERE u.phone_number = $1
        `, [phone]);

        const data = profileRes.rows[0];
        const balance = parseFloat(data?.balance || '0');
        const activeCards = parseInt(data?.active_cards || '0');
        const name = data?.name || null;

        return {
          nextState: 'PROFILE_MENU',
          nextContext: { walletBalance: balance },
          message: Templates.PROFILE(phone, name, balance, activeCards)
        };
      }

      case 'HELP':
        return {
          message: `🛠️ *SOPORTE*\n\nSi tenés problemas, contactá a nuestro equipo administrador.\nEscribí *MENU* para volver.`
        };

      default:
        return {
          message: Templates.MAIN_MENU()
        };
    }
  }
}
