import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { RoomCatalogService } from '../../domain/RoomCatalogService';

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
        return {
          nextState: 'PURCHASING',
          nextContext: { selectedRoomId: selected.id, price: selected.card_price },
          message: `📍 *Has seleccionado: ${selected.name}*\n\n` +
                   `💰 Precio por cartón: $${selected.card_price}\n` +
                   `🏆 Jackpot actual: $${selected.jackpot_amount}\n` +
                   `👥 Jugadores: ${selected.players_count}\n\n` +
                   `¿Cuántos cartones quieres comprar? (Envía un número entre 1 y 10)`
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
