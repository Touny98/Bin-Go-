import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { CardReservationService } from '../../domain/CardReservationService';
import { logger } from '../../utils/logger';
import { query } from '../../db';

function buildBingoMenuButtons(): Pick<HandlerResponse, 'message' | 'buttons'> {
  const text = Templates.BINGO_MAIN_MENU();
  return {
    message: text,
    buttons: {
      text,
      buttons: [
        { id: 'bingo_rooms',   label: '🎡 Ver Salas'        },
        { id: 'bingo_profile', label: '👤 Mi Perfil'         },
        { id: 'bingo_switch',  label: '🔄 Cambiar de juego'  },
      ],
      footer: 'TIMBA — tu plataforma de juegos',
    },
  };
}

function buildBingoMenuFollowUp() {
  const text = Templates.BINGO_MAIN_MENU();
  return {
    text,
    buttons: [
      { id: 'bingo_rooms',   label: '🎡 Ver Salas'        },
      { id: 'bingo_profile', label: '👤 Mi Perfil'         },
      { id: 'bingo_switch',  label: '🔄 Cambiar de juego'  },
    ],
    footer: 'TIMBA — tu plataforma de juegos',
  };
}

export class PurchaseHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const { selectedRoomId, price, pendingQuantity, roomName, pendingPaymentChoice } = session.context;
    const phone = String(session.userId).replace(/@c\.us$/, '').replace(/@lid$/, '');

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'BINGO_MENU', nextContext: {}, ...buildBingoMenuButtons() };
    }

    // Paso 3: elección de método de pago
    if (pendingPaymentChoice && pendingQuantity) {
      const normalized = rawInput.trim().toUpperCase();
      const isWallet = normalized === '1' || normalized === 'WALLET' || normalized === 'SALDO' || normalized === 'PAY_WALLET';
      const isMp     = normalized === '2' || normalized === 'MP'     || normalized === 'MERCADOPAGO' || normalized === 'PAY_MP';

      if (isWallet) {
        try {
          const total = pendingQuantity * price;
          await CardReservationService.reserveAndPayWithWallet(session.userId, selectedRoomId, pendingQuantity, price);
          const walletRes = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [phone]);
          const newBalance = parseFloat(walletRes.rows[0]?.real_balance ?? '0');
          const successText = Templates.WALLET_PAYMENT_SUCCESS({ quantity: pendingQuantity, total, roomName, newBalance });
          return {
            nextState: 'BINGO_MENU',
            nextContext: {},
            message: successText,
            buttons: {
              text: successText,
              buttons: [
                { id: 'bingo_rooms',   label: '🎡 Ver Salas'        },
                { id: 'bingo_profile', label: '👤 Mi Perfil'         },
                { id: 'bingo_switch',  label: '🔄 Cambiar de juego'  },
              ],
              footer: 'TIMBA — tu plataforma de juegos',
            },
          };
        } catch (error: any) {
          logger.error({ error: error.message }, '[PurchaseHandler] Wallet payment failed');
          return { nextState: 'BINGO_MENU', nextContext: {}, message: `❌ No se pudo procesar el pago con saldo: ${error.message}` };
        }
      }

      if (isMp) {
        try {
          const mpPreference = await CardReservationService.reserveCards(session.userId, selectedRoomId, pendingQuantity, price);
          const paymentText = Templates.PAYMENT_LINK(mpPreference.init_point);
          return {
            nextState: 'WAITING_PAYMENT',
            nextContext: { paymentUrl: mpPreference.init_point },
            message: paymentText,
            buttons: {
              text: paymentText,
              buttons: [{ id: 'no', label: '❌ Cancelar reserva' }],
              footer: 'TIMBA 🎡',
            },
          };
        } catch (error: any) {
          logger.error({ error: error.message }, '[PurchaseHandler] MP reservation failed');
          return { nextState: 'MAIN_MENU', nextContext: {}, message: `❌ No pudimos procesar tu reserva: ${error.message}` };
        }
      }

      const total = pendingQuantity * price;
      const walletRes2 = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [phone]);
      const currentBalance = parseFloat(walletRes2.rows[0]?.real_balance ?? '0');
      const paymentText = Templates.PAYMENT_METHOD_CHOICE({ total, walletBalance: currentBalance });
      return {
        message: paymentText,
        buttons: {
          text: paymentText,
          buttons: [
            { id: 'pay_wallet', label: `💰 Mi saldo (${formatARS(currentBalance)})` },
            { id: 'pay_mp',     label: '💳 MercadoPago'                              },
          ],
          footer: `Total: ${formatARS(total)} — TIMBA 🎡`,
        },
      };
    }

    // Paso 2: confirmación de compra
    if (intent === 'CONFIRM' && pendingQuantity) {
      const total = pendingQuantity * price;
      try {
        const walletRes = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [phone]);
        const walletBalance = parseFloat(walletRes.rows[0]?.real_balance ?? '0');

        if (walletBalance >= total) {
          const paymentText = Templates.PAYMENT_METHOD_CHOICE({ total, walletBalance });
          return {
            nextContext: { ...session.context, pendingPaymentChoice: true },
            message: paymentText,
            buttons: {
              text: paymentText,
              buttons: [
                { id: 'pay_wallet', label: `💰 Mi saldo (${formatARS(walletBalance)})` },
                { id: 'pay_mp',     label: '💳 MercadoPago'                              },
              ],
              footer: `Total: ${formatARS(total)} — TIMBA 🎡`,
            },
          };
        }

        const mpPreference = await CardReservationService.reserveCards(session.userId, selectedRoomId, pendingQuantity, price);
        const payText = Templates.PAYMENT_LINK(mpPreference.init_point);
        return {
          nextState: 'WAITING_PAYMENT',
          nextContext: { paymentUrl: mpPreference.init_point },
          message: payText,
          buttons: {
            text: payText,
            buttons: [{ id: 'no', label: '❌ Cancelar reserva' }],
            footer: 'TIMBA 🎡',
          },
        };
      } catch (error: any) {
        logger.error({ error: error.message }, '[PurchaseHandler] Reservation failed');
        return { nextState: 'MAIN_MENU', nextContext: {}, message: `❌ No pudimos procesar tu reserva: ${error.message}` };
      }
    }

    // Paso 1: confirmación de cantidad
    const quantity = parseInt(rawInput);
    if (!isNaN(quantity) && quantity > 0 && quantity <= 5) {
      const total = quantity * price;
      const confirmText = Templates.PURCHASE_CONFIRMATION({ quantity, total });
      return {
        nextState: 'PURCHASING',
        nextContext: { pendingQuantity: quantity },
        message: confirmText,
        buttons: {
          text: confirmText,
          buttons: [
            { id: 'si', label: '✅ Confirmar' },
            { id: 'no', label: '❌ Cancelar'  },
          ],
          footer: `Total: ${formatARS(total)} — TIMBA 🎡`,
        },
      };
    }

    // Selector inicial de cantidad
    const priceStr = price ? formatARS(price) : '';
    const quantityText = `🎟️ *${roomName || 'Sala seleccionada'}*\n\n¿Cuántos cartones querés comprar?${priceStr ? ` (${priceStr} c/u)` : ''}`;
    return {
      nextState: 'PURCHASING',
      message: quantityText,
      list: {
        text: quantityText,
        buttonLabel: 'Elegir cantidad',
        sections: [{
          title: 'Cantidad',
          rows: [
            { id: '1', title: '1 cartón',   description: priceStr ? `Total: ${formatARS(price * 1)}` : '' },
            { id: '2', title: '2 cartones', description: priceStr ? `Total: ${formatARS(price * 2)}` : '' },
            { id: '3', title: '3 cartones', description: priceStr ? `Total: ${formatARS(price * 3)}` : '' },
            { id: '4', title: '4 cartones', description: priceStr ? `Total: ${formatARS(price * 4)}` : '' },
            { id: '5', title: '5 cartones', description: priceStr ? `Total: ${formatARS(price * 5)}` : '' },
          ],
        }],
      },
    };
  }
}
