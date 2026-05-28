import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';

const MAIN_MENU_LIST = (): Pick<HandlerResponse, 'message' | 'list'> => {
  const text = Templates.MAIN_MENU();
  return {
    message: text,
    list: {
      text,
      buttonLabel: 'Elegir juego',
      title: 'BinGo! 🎰🃏',
      footer: 'BinGo! — tu plataforma de juegos',
      sections: [{
        title: '¿A qué querés jugar?',
        rows: [
          { id: '1', title: '1 · 🎰 Bingo',  description: 'Salas en vivo'      },
          { id: '2', title: '2 · 🃏 Truco', description: '1 vs 1 con apuestas' },
        ],
      }],
    },
  };
};

export class PaymentWaitHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    _rawInput: string
  ): Promise<HandlerResponse> {

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', nextContext: {}, ...MAIN_MENU_LIST() };
    }

    const paymentUrl = session.context?.paymentUrl;
    const text = paymentUrl
      ? `⏳ Tu pago aún no fue confirmado.\n\nPodés completarlo acá: ${paymentUrl}\n\nSi querés cancelar la reserva tocá el botón.`
      : `⏳ Estamos esperando la confirmación de tu pago.\n\nSi querés cancelar la reserva tocá el botón.`;

    return {
      message: text,
      buttons: {
        text,
        buttons: [{ id: 'no', label: '❌ Cancelar reserva' }],
        footer: 'BinGo! 🎰',
      },
    };
  }
}
