import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { RoomCatalogService } from '../../domain/RoomCatalogService';
import { query } from '../../db';

export class RoomBrowserHandler extends BaseHandler {
  public async handle(
    session: UserSession, 
    intent: IntentType, 
    rawInput: string
  ): Promise<HandlerResponse> {
    
    // If input is a number, try to select that room
    const selection = parseInt(rawInput);
    if (!isNaN(selection) && selection > 0) {
      const rooms = await RoomCatalogService.getAvailableRooms();
      const selected = rooms[selection - 1];

      if (selected) {
        // Check if user already has active cards for this session
        let existingCardCount = 0;
        const phone = session.userId.replace('@c.us', '').replace('@lid', '');
        const userRes = await query(`SELECT id FROM users WHERE phone_number = $1`, [phone]);
        const userId = userRes.rows[0]?.id;

        if (userId && selected.session_id) {
          const existing = await query(
            `SELECT COUNT(*) as cnt FROM cards WHERE user_id = $1 AND game_session_id = $2 AND status = 'active'`,
            [userId, selected.session_id]
          );
          existingCardCount = parseInt(existing.rows[0]?.cnt) || 0;
        }

        return {
          nextState: 'PURCHASING',
          nextContext: { selectedRoomId: selected.session_id, price: selected.card_price, scheduledAt: selected.scheduled_at, roomName: selected.name },
          message: Templates.ROOM_DETAIL(selected, existingCardCount)
        };
      } else {
        const rooms = await RoomCatalogService.getAvailableRooms();
        return {
          message: `⚠️ El número ${selection} no es válido. Por favor, elige una opción de la lista:\n\n${
            rooms.length > 0 ? Templates.ROOM_LIST(rooms) : 'No hay salas disponibles en este momento.'
          }`
        };
      }
    }

    if (intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', message: Templates.MAIN_MENU() };
    }

    const rooms = await RoomCatalogService.getAvailableRooms();
    return {
      message: Templates.ROOM_LIST(rooms)
    };
  }
}
