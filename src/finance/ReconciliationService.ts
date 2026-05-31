import { query } from '../db';
import { LedgerService } from './LedgerService';
import { logger } from '../utils/logger';

export interface WalletDrift {
  userId: string;
  realBalance: number;
  bonusBalance: number;
  ledgerBalance: number;
  expectedBalance: number; // real + bonus
  drift: number;
}

/**
 * Reconciliación financiera: el ledger es la fuente de verdad. El saldo denormalizado
 * (`wallets.real_balance` + `wallets.bonus_balance`) debe coincidir con la suma del ledger.
 *
 * Invariante: calculateBalance(wallet) == real_balance + bonus_balance.
 * (El ReconciliationWorker original comparaba el ledger SOLO contra real_balance, lo que
 *  generaba un falso positivo de drift en cuanto el wallet tuviera saldo de BONUS.)
 */
export class ReconciliationService {
  static readonly TOLERANCE = 0.01; // tolera diferencias de precisión decimal

  /**
   * Recorre todos los wallets y devuelve los que tienen drift entre el saldo
   * denormalizado y la verdad del ledger.
   */
  static async findDrift(): Promise<WalletDrift[]> {
    const walletsRes = await query('SELECT user_id, real_balance, bonus_balance FROM wallets');
    const anomalies: WalletDrift[] = [];

    for (const w of walletsRes.rows) {
      const realBalance = parseFloat(w.real_balance ?? '0');
      const bonusBalance = parseFloat(w.bonus_balance ?? '0');
      const ledgerBalance = await LedgerService.calculateBalance(w.user_id);
      const expectedBalance = realBalance + bonusBalance;
      const drift = Math.abs(ledgerBalance - expectedBalance);

      if (drift > this.TOLERANCE) {
        anomalies.push({
          userId: w.user_id,
          realBalance,
          bonusBalance,
          ledgerBalance,
          expectedBalance,
          drift,
        });
      }
    }

    return anomalies;
  }

  /**
   * Ejecuta la auditoría y loguea cada anomalía. Devuelve la cantidad encontrada.
   * Pensado para correr periódicamente (worker) o on-demand (endpoint admin).
   */
  static async audit(): Promise<{ totalWallets: number; anomalies: WalletDrift[] }> {
    const walletsRes = await query('SELECT COUNT(*)::int AS n FROM wallets');
    const totalWallets = walletsRes.rows[0].n;
    const anomalies = await this.findDrift();

    for (const a of anomalies) {
      logger.error(a, '[Reconciliation] BALANCE DRIFT DETECTED!');
    }
    logger.info({ totalWallets, anomalies: anomalies.length }, '[Reconciliation] Audit finished');

    return { totalWallets, anomalies };
  }
}
