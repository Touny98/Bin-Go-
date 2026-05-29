import { MercadoPagoService } from '../services/MercadoPagoService';
import { WalletEngine } from '../finance/WalletEngine';
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
   * Credits the wallet and returns the phone + amount for notification.
   */
  static async confirmDeposit(externalRef: string): Promise<{ phone: string; amount: number }> {
    // Format: DEPOSIT_{timestamp}_{phone}_{cents}
    const parts = externalRef.split('_');
    // parts[0] = 'DEPOSIT', parts[1] = timestamp, parts[2] = phone, parts[3] = cents
    if (parts.length < 4) throw new Error(`Invalid deposit externalRef: ${externalRef}`);

    const phone = parts[2];
    const cents = parseInt(parts[3], 10);
    if (!phone || isNaN(cents)) throw new Error(`Malformed deposit externalRef: ${externalRef}`);

    const amount = cents / 100;
    await WalletEngine.credit(phone, amount, 'DEPOSIT', externalRef);
    logger.info({ phone, amount, externalRef }, '[WalletDepositService] Deposit confirmed');
    return { phone, amount };
  }
}
