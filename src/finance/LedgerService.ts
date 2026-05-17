import { query } from '../db';
import { logger } from '../utils/logger';

export type EntryType = 'DEBIT' | 'CREDIT';
export type EntryCategory = 'WINNING' | 'WITHDRAWAL' | 'DEPOSIT' | 'BONUS' | 'FEE' | 'REFUND';

export class LedgerService {
  /**
   * Records an immutable entry in the financial ledger
   */
  public static async recordEntry(
    walletId: string, 
    type: EntryType, 
    category: EntryCategory, 
    amount: number, 
    referenceId: string,
    metadata: any = {}
  ): Promise<number> {
    try {
      const res = await query(
        `INSERT INTO ledger_entries (wallet_id, entry_type, category, amount, reference_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [walletId, type, category, amount, referenceId, JSON.stringify(metadata)]
      );
      
      logger.debug({ walletId, type, amount, referenceId }, '[LedgerService] Entry recorded');
      return res.rows[0].id;
    } catch (e: any) {
      logger.error({ error: e.message }, '[LedgerService] Failed to record entry');
      throw e;
    }
  }

  /**
   * Reconstructs a wallet balance from all its ledger entries
   */
  public static async calculateBalance(walletId: string): Promise<number> {
    const res = await query(
      `SELECT 
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END) as balance 
       FROM ledger_entries WHERE wallet_id = $1`,
      [walletId]
    );
    return parseFloat(res.rows[0].balance || '0');
  }
}
