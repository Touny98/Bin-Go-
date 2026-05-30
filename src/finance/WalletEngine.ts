import { getClient } from '../db';
import { LedgerService, EntryCategory, QueryExecutor } from './LedgerService';
import { logger } from '../utils/logger';

export class WalletEngine {
  /**
   * Acredita fondos al wallet de un usuario de forma atómica.
   * Asiento de ledger + saldo denormalizado viajan en la MISMA transacción
   * sobre un cliente dedicado (no sobre el pool), para evitar fugas de
   * transacción entre requests y garantizar atomicidad real.
   */
  public static async credit(userId: string, amount: number, category: EntryCategory, referenceId: string): Promise<void> {
    const client = await getClient();
    const exec: QueryExecutor = (text, params) => client.query(text, params);
    try {
      await client.query('BEGIN');

      // 1. Asiento de ledger (fuente de verdad)
      await LedgerService.recordEntry(userId, 'CREDIT', category, amount, referenceId, {}, exec);

      // 2. Saldo denormalizado (cache de performance; el ledger manda)
      const balanceColumn = category === 'BONUS' ? 'bonus_balance' : 'real_balance';
      await client.query(
        `INSERT INTO wallets (user_id, ${balanceColumn}) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET ${balanceColumn} = wallets.${balanceColumn} + $2`,
        [userId, amount]
      );

      await client.query('COMMIT');
      logger.info({ userId, amount, category }, '[WalletEngine] Credit successful');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Debita fondos del wallet con verificación de saldo bajo bloqueo de fila.
   * El SELECT ... FOR UPDATE y el UPDATE corren en la misma transacción/cliente,
   * por lo que el lock sí serializa débitos concurrentes (anti doble-gasto).
   */
  public static async debit(userId: string, amount: number, category: EntryCategory, referenceId: string): Promise<void> {
    const client = await getClient();
    const exec: QueryExecutor = (text, params) => client.query(text, params);
    try {
      await client.query('BEGIN');

      // 1. Verificar saldo disponible bloqueando la fila del wallet
      const res = await client.query('SELECT real_balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      const currentBalance = parseFloat(res.rows[0]?.real_balance || '0');

      if (currentBalance < amount) {
        throw new Error('Insufficient funds');
      }

      // 2. Asiento de ledger
      await LedgerService.recordEntry(userId, 'DEBIT', category, amount, referenceId, {}, exec);

      // 3. Saldo denormalizado
      await client.query('UPDATE wallets SET real_balance = real_balance - $1 WHERE user_id = $2', [amount, userId]);

      await client.query('COMMIT');
      logger.info({ userId, amount, category }, '[WalletEngine] Debit successful');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Bloquea fondos durante un retiro pendiente.
   */
  public static async lockForWithdrawal(userId: string, amount: number, payoutId: string): Promise<void> {
    // Por ahora debita inmediatamente con categoría 'WITHDRAWAL'.
    // A futuro podría moverse a una columna 'locked_balance'.
    await this.debit(userId, amount, 'WITHDRAWAL', payoutId);
  }
}
