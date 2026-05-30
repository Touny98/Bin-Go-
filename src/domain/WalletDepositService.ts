import { MercadoPagoService } from '../services/MercadoPagoService';
import { WalletEngine } from '../finance/WalletEngine';
import { query } from '../db';
import { logger } from '../utils/logger';

/**
 * Externalref format: DEPOSIT_{timestamp}_{phone}_{cents}
 * (amount in integer cents to avoid float in the key)
 */

export class WalletDepositService {
  /**
   * Creates a MercadoPago preference for a wallet top-up.
   * Returns { init_point, externalRef }.
   */
  static async createDepositLink(
    phone: string,
    amount: number
  ): Promise<{ init_point: string; externalRef: string }> {
    const cents = Math.round(amount * 100);
    const externalRef = `DEPOSIT_${Date.now()}_${phone}_${cents}`;

    const pref = await MercadoPagoService.createPreference(
      'Carga de saldo BinGo!',
      1,
      amount,
      phone,
      externalRef
    );

    logger.info({ phone, amount, externalRef }, '[WalletDepositService] Preference created');
    return { init_point: pref.init_point, externalRef };
  }

  /**
   * Called by PaymentConfirmationWorker when externalRef starts with "DEPOSIT_".
   * Credits the wallet and returns the phone + amount + whether it was actually applied.
   *
   * IDEMPOTENTE: los webhooks de MercadoPago son "at-least-once" (el mismo pago
   * puede llegar varias veces). Si ya existe el asiento de ledger de este depósito,
   * el webhook es un duplicado y NO se vuelve a acreditar. `applied=false` permite
   * al worker evitar notificaciones duplicadas.
   */
  static async confirmDeposit(externalRef: string): Promise<{ phone: string; amount: number; applied: boolean }> {
    // Format: DEPOSIT_{timestamp}_{phone}_{cents}
    const parts = externalRef.split('_');
    // parts[0] = 'DEPOSIT', parts[1] = timestamp, parts[2] = phone, parts[3] = cents
    if (parts.length < 4) throw new Error(`Invalid deposit externalRef: ${externalRef}`);

    const phone = parts[2];
    const cents = parseInt(parts[3], 10);
    if (!phone || isNaN(cents)) throw new Error(`Malformed deposit externalRef: ${externalRef}`);

    const amount = cents / 100;

    // Idempotencia: el asiento usa externalRef como reference_id. Si ya existe, es duplicado.
    const existing = await query(
      `SELECT 1 FROM ledger_entries
       WHERE reference_id = $1 AND category = 'DEPOSIT' AND entry_type = 'CREDIT' LIMIT 1`,
      [externalRef]
    );
    if (existing.rows.length > 0) {
      logger.warn({ phone, amount, externalRef }, '[WalletDepositService] Depósito duplicado ignorado (idempotencia)');
      return { phone, amount, applied: false };
    }

    await WalletEngine.credit(phone, amount, 'DEPOSIT', externalRef);
    logger.info({ phone, amount, externalRef }, '[WalletDepositService] Deposit confirmed');
    return { phone, amount, applied: true };
  }
}
