import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { CardReservationService } from '../../domain/CardReservationService';
import { logger } from '../../utils/logger';

export class PurchaseHandler extends BaseHandler {
  public async handle(
    session: UserSession, 
    intent: IntentType, 
    rawInput: string
  ): Promise<HandlerResponse> {
    
    const { selectedRoomId, price, pendingQuantity } = session.context;

    // 1. If we are in the quantity selection phase
    const quantity = parseInt(rawInput);
    if (!isNaN(quantity) && quantity > 0 && quantity <= 10) {
      const total = quantity * price;
      return {
        nextContext: { pendingQuantity: quantity },
        message: Templates.PURCHASE_CONFIRMATION({ quantity, total })
      };
    }

    // 2. If confirming the purchase
    if (intent === 'CONFIRM' && pendingQuantity) {
      try {
        const mpPreference = await CardReservationService.reserveCards(
          parseInt(session.userId), // Simplification for user_id mapping
          selectedRoomId,
          pendingQuantity,
          price
        );

        return {
          nextState: 'WAITING_PAYMENT',
          message: Templates.PAYMENT_LINK(mpPreference.init_point)
        };
      } catch (error: any) {
        logger.error({ error: error.message }, '[PurchaseHandler] Reservation failed');
        return {
          nextState: 'MAIN_MENU',
          message: `❌ Lo siento, no pudimos procesar tu reserva: ${error.message}\n\nVolviendo al menú principal.`
        };
      }
    }

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', message: Templates.MAIN_MENU() };
    }

    return {
      message: `Por favor, confirma enviando *SI* o cancela enviando *NO*.`
    };
  }
}
