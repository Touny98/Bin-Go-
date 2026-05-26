import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { query } from '../../db';
import { payoutQueue } from '../../queue';
import { logger } from '../../utils/logger';

export class WithdrawalHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', message: Templates.MAIN_MENU() };
    }

    const { withdrawalStep, withdrawalAmount, withdrawalCbu } = session.context;
    const phone = session.userId.replace('@c.us', '').replace('@lid', '');

    // ── Paso 1: recopilar monto ───────────────────────────────────────────────
    if (withdrawalStep === 'AMOUNT') {
      const raw = rawInput.replace(/[$.]/g, '').replace(/,/g, '.').trim();
      const amount = parseFloat(raw);

      if (isNaN(amount) || amount <= 0) {
        return { message: `Por favor, ingresá un monto válido mayor a $0.\n\nEjemplo: *5000*` };
      }

      const walletRes = await query(
        `SELECT COALESCE(real_balance, 0) AS balance FROM wallets WHERE user_id = $1`,
        [phone]
      );
      const liveBalance = parseFloat(walletRes.rows[0]?.balance || '0');

      if (amount > liveBalance) {
        return { message: Templates.WITHDRAWAL_INSUFFICIENT(liveBalance) };
      }

      return {
        nextContext: { withdrawalStep: 'CBU', withdrawalAmount: amount },
        message: Templates.WITHDRAWAL_ASK_CBU(amount)
      };
    }

    // ── Paso 2: recopilar CBU/CVU/alias ──────────────────────────────────────
    if (withdrawalStep === 'CBU') {
      const cbu = rawInput.trim();
      if (cbu.length < 3) {
        return { message: `Por favor, ingresá un CBU, CVU o alias válido.\n\nEjemplo: *alias.mp* o *0000003100...* (22 dígitos)` };
      }
      return {
        nextContext: { withdrawalStep: 'CONFIRM', withdrawalCbu: cbu },
        message: Templates.WITHDRAWAL_CONFIRM(withdrawalAmount, cbu)
      };
    }

    // ── Paso 3: confirmación ─────────────────────────────────────────────────
    if (withdrawalStep === 'CONFIRM') {
      if (intent !== 'CONFIRM') {
        return { message: `Respondé *SI* para confirmar o *NO* para cancelar.` };
      }

      // Re-verificar saldo antes de crear la solicitud
      const walletRes = await query(
        `SELECT COALESCE(real_balance, 0) AS balance FROM wallets WHERE user_id = $1`,
        [phone]
      );
      const liveBalance = parseFloat(walletRes.rows[0]?.balance || '0');

      if (withdrawalAmount > liveBalance) {
        return {
          nextState: 'MAIN_MENU',
          message: Templates.WITHDRAWAL_INSUFFICIENT(liveBalance) + `\n\nVolvé al perfil para intentar con un monto menor.`
        };
      }

      // Crear solicitud de pago
      const idempotencyKey = `WD_${phone}_${Date.now()}`;
      try {
        const payoutRes = await query(
          `INSERT INTO payout_requests
             (user_id, amount, status, provider, idempotency_key, destination)
           VALUES ($1, $2, 'REQUESTED', 'MERCADOPAGO', $3, $4)
           RETURNING id`,
          [phone, withdrawalAmount, idempotencyKey, withdrawalCbu]
        );
        const payoutId = payoutRes.rows[0].id;

        await payoutQueue.add('process_approved_payout', {
          payoutId,
          userId: phone,
          amount: withdrawalAmount
        });

        logger.info({ payoutId, userId: phone, amount: withdrawalAmount }, '[WithdrawalHandler] Payout request created');
      } catch (e: any) {
        logger.error({ error: e.message }, '[WithdrawalHandler] Failed to create payout request');
        return {
          nextState: 'MAIN_MENU',
          message: `❌ Hubo un error al procesar tu solicitud. Por favor, intentá más tarde.`
        };
      }

      return {
        nextState: 'MAIN_MENU',
        nextContext: { withdrawalStep: null, withdrawalAmount: null, withdrawalCbu: null },
        message: Templates.WITHDRAWAL_SUCCESS()
      };
    }

    return { message: Templates.UNKNOWN_COMMAND() };
  }
}
