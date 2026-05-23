import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';

/**
 * Handler for WAITING_PAYMENT state
 * User has received payment link, we wait for MercadoPago webhook confirmation
 */
export class PaymentWaitHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    // In WAITING_PAYMENT state, we ignore most inputs
    // Only allow cancellation or going back to menu
    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return {
        nextState: 'MAIN_MENU',
        message: Templates.MAIN_MENU()
      };
    }

    // For any other input, remind user to complete payment
    return {
      message: `⏳ Estamos esperando la confirmación de tu pago.\n\nSi ya pagaste, por favor espera a que se procese (puede tomar unos segundos).\n\nSi quieres cancelar, escribe: *NO* o *MENU`
    };
  }
}
