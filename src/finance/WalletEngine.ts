import { query } from '../db';
import { LedgerService, EntryCategory } from './LedgerService';
import { logger } from '../utils/logger';

export class WalletEngine {
  /**
   * Safely adds funds to a user's wallet
   */
  public static async credit(userId: string, amount: number, category: EntryCategory, referenceId: string): Promise<void> {
    await query('BEGIN');
    try {
      // 1. Record Ledger Entry
      await LedgerService.recordEntry(userId, 'CREDIT', category, amount, referenceId);

      // 2. Update Denormalized Balance (for performance, but Ledger is Truth)
      const balanceColumn = category === 'BONUS' ? 'bonus_balance' : 'real_balance';
      await query(
        `INSERT INTO wallets (user_id, ${balanceColumn}) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET ${balanceColumn} = wallets.${balanceColumn} + $2`,
        [userId, amount]
      );

      await query('COMMIT');
      logger.info({ userId, amount, category }, '[WalletEngine] Credit successful');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }
  }

  /**
   * Safely deducts funds from a user's wallet with balance check
   */
  public static async debit(userId: string, amount: number, category: EntryCategory, referenceId: string): Promise<void> {
    await query('BEGIN');
    try {
      // 1. Check Available Balance (Lock row)
      const res = await query('SELECT real_balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      const currentBalance = parseFloat(res.rows[0]?.real_balance || '0');

      if (currentBalance < amount) {
        throw new Error('Insufficient funds');
      }

      // 2. Record Ledger Entry
      await LedgerService.recordEntry(userId, 'DEBIT', category, amount, referenceId);

      // 3. Update Denormalized Balance
      await query('UPDATE wallets SET real_balance = real_balance - $1 WHERE user_id = $2', [amount, userId]);

      await query('COMMIT');
      logger.info({ userId, amount, category }, '[WalletEngine] Debit successful');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }
  }

  /**
   * Locks funds during a pending withdrawal
   */
  public static async lockForWithdrawal(userId: string, amount: number, payoutId: string): Promise<void> {
    // Similar to debit but could move to a 'locked_balance' column if needed
    // For now, we debit immediately but use 'WITHDRAWAL' category
    await this.debit(userId, amount, 'WITHDRAWAL', payoutId);
  }
}
