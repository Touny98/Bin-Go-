import { query } from '../db';
import { logger } from '../utils/logger';

export class ReferralService {
  /**
   * Tracks a new referral relationship
   */
  public static async trackReferral(referrerId: string, referredId: string): Promise<void> {
    try {
      await query(
        'INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [referrerId, referredId]
      );
      logger.info({ referrerId, referredId }, '[ReferralService] Referral relationship tracked');
    } catch (e: any) {
      logger.error({ error: e.message }, '[ReferralService] Failed to track referral');
    }
  }

  /**
   * Validates and pays out referral rewards after a conversion (e.g. first payment)
   */
  public static async processConversion(referredId: string): Promise<void> {
    const res = await query(
      'SELECT id, referrer_id FROM referrals WHERE referred_id = $1 AND status = $2 AND reward_paid = FALSE',
      [referredId, 'PENDING']
    );

    if (res.rows.length === 0) return;

    const { id, referrer_id } = res.rows[0];

    try {
      // 1. Mark as converted
      await query('UPDATE referrals SET status = $1, reward_paid = TRUE WHERE id = $2', ['CONVERTED', id]);

      // 2. Pay reward to referrer (e.g. $500 bonus balance)
      await query(
        `INSERT INTO wallets (user_id, bonus_balance) VALUES ($1, $2) 
         ON CONFLICT (user_id) DO UPDATE SET bonus_balance = wallets.bonus_balance + $2`,
        [referrer_id, 500]
      );

      logger.info({ referrer_id, referredId }, '[ReferralService] Reward paid to referrer');
    } catch (e: any) {
      logger.error({ error: e.message }, '[ReferralService] Failed to process conversion');
    }
  }
}
