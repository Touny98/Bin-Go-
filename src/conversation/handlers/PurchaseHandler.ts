import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { CardReservationService } from '../../domain/CardReservationService';
import { logger } from '../../utils/logger';
import { query } from '../../db';

export class PurchaseHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    const { selectedRoomId, price, pendingQuantity, roomName, pendingPaymentChoice } = session.context;
    const phone = String(session.userId).replace(/@c\.us$/, '').replace(/@lid$/, '');

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      const bingoMenuText = Templates.BINGO_MAIN_MENU();
      return {
        nextState: 'BINGO_MENU',
        nextContext: {},
        message: bingoMenuText,
        list: {
          text: bingoMenuText,
          buttonLabel: 'Elegir opción',
          title: 'BinGo! 🎰',
          footer: 'BinGo! — tu plataforma de juegos',
          sections: [{
            title: '¿Qué querés hacer?',
            rows: [
              { id: 'bingo_rooms',   title: '1. Ver Salas Disponibles 🎰',  description: 'Explorá las salas activas y próximas'      },
              { id: 'bingo_buy',     title: '2. Comprar Cartones 🎟️',       description: 'Comprá cartones para la próxima sala'      },
              { id: 'bingo_profile', title: '3. Ver mi Perfil 👤',           description: 'Tu saldo, cartones activos y retiros'      },
              { id: 'bingo_switch',  title: '4. Cambiar de juego 🔄',       description: 'Volver al menú principal de la plataforma' },
            ],
          }],
        },
      };
    }

    // Paso 3: elección de método de pago
    if (pendingPaymentChoice && pendingQuantity) {
      const normalized = rawInput.trim().toUpperCase();
      const isWallet = normalized === '1' || normalized === 'WALLET' || normalized === 'SALDO';
      const isMp     = normalized === '2' || normalized === 'MP'     || normalized === 'MERCADOPAGO';

      if (isWallet) {
        try {
          const total = pendingQuantity * price;
          await CardReservationService.reserveAndPayWithWallet(session.userId, selectedRoomId, pendingQuantity, price);
          const walletRes = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [phone]);
          const newBalance = parseFloat(walletRes.rows[0]?.real_balance ?? '0');
          const successText = Templates.WALLET_PAYMENT_SUCCESS({ quantity: pendingQuantity, total, roomName, newBalance });
          return {
            nextState: 'MAIN_MENU',
            nextContext: {},
            message: successText,
            list: {
              text: successText,
              buttonLabel: '¿Qué hacemos?',
              title: '¡Cartones comprados! 🎉',
              footer: 'BinGo! 🎰',
              sections: [{
                title: '¿Qué querés hacer ahora?',
                rows: [
                  { id: 'bingo_rooms',   title: '🎰 Comprar más cartones', description: 'Ver otras salas disponibles' },
                  { id: 'bingo_profile', title: '👤 Ver mi perfil',         description: 'Tu saldo y cartones activos' },
                  { id: '0',             title: '🏠 Menú principal',        description: 'Volver al inicio'            },
                ],
              }],
            },
          };
        } catch (error: any) {
          logger.error({ error: error.message }, '[PurchaseHandler] Wallet payment failed');
          return { nextState: 'MAIN_MENU', nextContext: {}, message: `❌ No se pudo procesar el pago con saldo: ${error.message}` };
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
              footer: 'BinGo! 🎰',
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
        list: {
          text: paymentText,
          buttonLabel: 'Elegir método',
          title: 'Método de pago',
          footer: `Total: ${formatARS(total)} — BinGo! 🎰`,
          sections: [{
            title: '¿Cómo querés pagar?',
            rows: [
              { id: '1', title: `💰 Con mi saldo (${formatARS(currentBalance)})`, description: 'Instantáneo, sin redireccionamiento' },
              { id: '2', title: '💳 MercadoPago',                                  description: 'Pagá con tarjeta o dinero en cuenta' },
            ],
          }],
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
            list: {
              text: paymentText,
              buttonLabel: 'Elegir método',
              title: 'Método de pago',
              footer: `Total: ${formatARS(total)} — BinGo! 🎰`,
              sections: [{
                title: '¿Cómo querés pagar?',
                rows: [
                  { id: '1', title: `💰 Con mi saldo (${formatARS(walletBalance)})`, description: 'Instantáneo, sin redireccionamiento' },
                  { id: '2', title: '💳 MercadoPago',                                 description: 'Pagá con tarjeta o dinero en cuenta' },
                ],
              }],
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
            footer: 'BinGo! 🎰',
          },
        };
      } catch (error: any) {
        logger.error({ error: error.message }, '[PurchaseHandler] Reservation failed');
        return { nextState: 'MAIN_MENU', nextContext: {}, message: `❌ No pudimos procesar tu reserva: ${error.message}` };
      }
    }

    // Paso 1: confirmación de cantidad
    const quantity = parseInt(rawInput);
    if (!isNaN(quantity) && quantity > 0 && quantity <= 10) {
      const total = quantity * price;
      const confirmText = Templates.PURCHASE_CONFIRMATION({ quantity, total });
      return {
        nextContext: { pendingQuantity: quantity },
        message: confirmText,
        list: {
          text: confirmText,
          buttonLabel: 'Confirmar',
          title: 'Confirmar compra',
          footer: `Total: ${formatARS(total)} — BinGo! 🎰`,
          sections: [{
            title: '¿Confirmás la compra?',
            rows: [
              { id: 'si', title: '✅ Sí, comprar', description: `${quantity} cartón${quantity !== 1 ? 'es' : ''} por ${formatARS(total)}` },
              { id: 'no', title: '❌ Cancelar',    description: 'Volver sin comprar'                                                      },
            ],
          }],
        },
      };
    }

    // Selector inicial de cantidad
    const priceStr = price ? formatARS(price) : '';
    const quantityText = `🎟️ *${roomName || 'Sala seleccionada'}*\n\n¿Cuántos cartones querés comprar?${priceStr ? ` (${priceStr} c/u)` : ''}\n\n_También podés escribir cualquier número del 1 al 10._`;
    return {
      message: quantityText,
      list: {
        text: quantityText,
        buttonLabel: 'Elegir cantidad',
        title: 'Cantidad de cartones',
        footer: priceStr ? `${priceStr} por cartón — BinGo! 🎰` : 'BinGo! 🎰',
        sections: [{
          title: 'Seleccioná cuántos querés',
          rows: [
            { id: '1', title: '1 cartón',   description: priceStr ? `Total: ${formatARS(price * 1)}` : '' },
            { id: '2', title: '2 cartones', description: priceStr ? `Total: ${formatARS(price * 2)}` : '' },
            { id: '3', title: '3 cartones', description: priceStr ? `Total: ${formatARS(price * 3)}` : '' },
            { id: '5', title: '5 cartones', description: priceStr ? `Total: ${formatARS(price * 5)}` : '' },
          ],
        }],
      },
    };
  }
}
