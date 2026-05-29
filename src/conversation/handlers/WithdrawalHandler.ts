import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates, formatARS } from '../templates/MessageTemplates';
import { query } from '../../db';
import { payoutQueue } from '../../queue';
import { logger } from '../../utils/logger';

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

export class WithdrawalHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', ...buildPlatformMenuButtons() };
    }

    const { withdrawalStep, withdrawalAmount, withdrawalCbu } = session.context;
    const phone = this.getPhone(session);

    if (withdrawalStep === 'AMOUNT') {
      const raw = rawInput.replace(/[$.]/g, '').replace(/,/g, '.').trim();
      const amount = parseFloat(raw);
      const MIN_WITHDRAWAL = 1000;

      if (isNaN(amount) || amount <= 0) {
        return { message: `Por favor, ingresá un monto válido.\n\nEjemplo: *5000*` };
      }
      if (amount < MIN_WITHDRAWAL) {
        return { message: `❌ El monto mínimo de retiro es *${formatARS(MIN_WITHDRAWAL)}*.\n\nIngresá un monto mayor o escribí *NO* para cancelar.` };
      }

      const walletRes = await query(`SELECT COALESCE(real_balance, 0) AS balance FROM wallets WHERE user_id = $1`, [phone]);
      const liveBalance = parseFloat(walletRes.rows[0]?.balance || '0');
      if (amount > liveBalance) {
        return { message: Templates.WITHDRAWAL_INSUFFICIENT(liveBalance) };
      }

      return {
        nextContext: { withdrawalStep: 'CBU', withdrawalAmount: amount },
        message: Templates.WITHDRAWAL_ASK_CBU(amount),
      };
    }

    if (withdrawalStep === 'CBU') {
      const cbu = rawInput.trim();
      if (cbu.length < 3) {
        return { message: `Por favor, ingresá un CBU, CVU o alias válido.\n\nEjemplo: *alias.mp* o *0000003100...* (22 dígitos)` };
      }
      const confirmText = Templates.WITHDRAWAL_CONFIRM(withdrawalAmount, cbu);
      return {
        nextContext: { withdrawalStep: 'CONFIRM', withdrawalCbu: cbu },
        message: confirmText,
        buttons: {
          text: confirmText,
          buttons: [
            { id: 'si', label: '✅ Confirmar' },
            { id: 'no', label: '❌ Cancelar'  },
          ],
          footer: `Transferencia de ${formatARS(withdrawalAmount)} — TIMBA 🎡`,
        },
      };
    }

    if (withdrawalStep === 'CONFIRM') {
      if (intent !== 'CONFIRM') {
        const confirmText = Templates.WITHDRAWAL_CONFIRM(withdrawalAmount, withdrawalCbu);
        return {
          message: confirmText,
          buttons: {
            text: confirmText,
            buttons: [
              { id: 'si', label: '✅ Confirmar' },
              { id: 'no', label: '❌ Cancelar'  },
            ],
            footer: `Transferencia de ${formatARS(withdrawalAmount)} — TIMBA 🎡`,
          },
        };
      }

      const walletRes = await query(`SELECT COALESCE(real_balance, 0) AS balance FROM wallets WHERE user_id = $1`, [phone]);
      const liveBalance = parseFloat(walletRes.rows[0]?.balance || '0');
      if (withdrawalAmount > liveBalance) {
        return {
          nextState: 'MAIN_MENU',
          message: Templates.WITHDRAWAL_INSUFFICIENT(liveBalance) + `\n\nVolvé al perfil para intentar con un monto menor.`,
        };
      }

      const idempotencyKey = `WD_${phone}_${Date.now()}`;
      try {
        const payoutRes = await query(
          `INSERT INTO payout_requests (user_id, amount, status, provider, idempotency_key, destination)
           VALUES ($1, $2, 'REQUESTED', 'MERCADOPAGO', $3, $4) RETURNING id`,
          [phone, withdrawalAmount, idempotencyKey, withdrawalCbu]
        );
        await payoutQueue.add('process_approved_payout', {
          payoutId: payoutRes.rows[0].id,
          userId: phone,
          amount: withdrawalAmount,
        });
        logger.info({ userId: phone, amount: withdrawalAmount }, '[WithdrawalHandler] Payout request created');
      } catch (e: any) {
        logger.error({ error: e.message }, '[WithdrawalHandler] Failed to create payout request');
        return { nextState: 'MAIN_MENU', message: `❌ Hubo un error al procesar tu solicitud. Por favor, intentá más tarde.` };
      }

      const successText = Templates.WITHDRAWAL_SUCCESS();
      return {
        nextState: 'MAIN_MENU',
        nextContext: { withdrawalStep: null, withdrawalAmount: null, withdrawalCbu: null },
        message: successText,
        buttons: {
          text: successText,
          buttons: [
            { id: 'bingo',      label: '🎡 Ir al Bingo' },
            { id: 'play_truco', label: '🃏 Ir al Truco'  },
          ],
          footer: 'TIMBA 🎡',
        },
      };
    }

    return { message: Templates.UNKNOWN_COMMAND() };
  }
}
