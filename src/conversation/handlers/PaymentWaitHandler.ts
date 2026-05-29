import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';

function buildPlatformMenuButtons(): Pick<HandlerResponse, 'message' | 'buttons'> {
  const text = Templates.MAIN_MENU();
  return {
    message: text,
    buttons: {
      text,
      buttons: [
        { id: 'bingo',      label: '🎡 Bingo' },
        { id: 'play_truco', label: '🃏 Truco'  },
      ],
      footer: 'TIMBA — tu plataforma de juegos',
    },
  };
}

export class PaymentWaitHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    _rawInput: string
  ): Promise<HandlerResponse> {

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', nextContext: {}, ...buildPlatformMenuButtons() };
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
        footer: 'TIMBA 🎡',
      },
    };
  }
}
