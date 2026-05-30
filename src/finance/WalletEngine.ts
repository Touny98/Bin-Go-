import { getClient, query } from '../db';
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
   * Bloquea fondos durante un retiro pendiente (debita con categoría 'WITHDRAWAL').
   * IDEMPOTENTE por payoutId: si el worker se reintenta tras un crash con el estado
   * todavía en APPROVED, no vuelve a debitar.
   */
  public static async lockForWithdrawal(userId: string, amount: number, payoutId: string): Promise<void> {
    const existing = await query(
      `SELECT 1 FROM ledger_entries
       WHERE wallet_id = $1 AND entry_type = 'DEBIT' AND category = 'WITHDRAWAL' AND reference_id = $2 LIMIT 1`,
      [userId, payoutId]
    );
    if (existing.rows.length > 0) {
      logger.warn({ userId, payoutId }, '[WalletEngine] lockForWithdrawal idempotente — ya estaba bloqueado');
      return;
    }
    await this.debit(userId, amount, 'WITHDRAWAL', payoutId);
  }

  /**
   * Reembolsa un retiro rechazado/fallido al wallet del usuario.
   * - Vía ledger (no toca real_balance a mano → sin drift).
   * - IDEMPOTENTE: si ya existe un REFUND de este payout, no repite.
   * - SEGURO: sólo reembolsa si realmente hubo un débito WITHDRAWAL previo
   *   (un retiro en PENDING_REVIEW nunca se debitó → NO se crea dinero).
   * Devuelve { refunded } para que el caller ajuste la notificación.
   */
  public static async refundWithdrawal(userId: string, amount: number, payoutId: string): Promise<{ refunded: boolean }> {
    const alreadyRefunded = await query(
      `SELECT 1 FROM ledger_entries
       WHERE wallet_id = $1 AND entry_type = 'CREDIT' AND category = 'REFUND' AND reference_id = $2 LIMIT 1`,
      [userId, payoutId]
    );
    if (alreadyRefunded.rows.length > 0) {
      logger.warn({ userId, payoutId }, '[WalletEngine] refundWithdrawal idempotente — ya reembolsado');
      return { refunded: false };
    }

    const debited = await query(
      `SELECT 1 FROM ledger_entries
       WHERE wallet_id = $1 AND entry_type = 'DEBIT' AND category = 'WITHDRAWAL' AND reference_id = $2 LIMIT 1`,
      [userId, payoutId]
    );
    if (debited.rows.length === 0) {
      logger.warn({ userId, payoutId }, '[WalletEngine] refundWithdrawal omitido — sin débito previo (no se crea dinero)');
      return { refunded: false };
    }

    await this.credit(userId, amount, 'REFUND', payoutId);
    logger.info({ userId, payoutId, amount }, '[WalletEngine] Withdrawal refunded');
    return { refunded: true };
  }
}
