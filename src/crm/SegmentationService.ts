import { query } from '../db';

export type UserSegment = 'WHALE' | 'CASUAL' | 'DORMANT' | 'NEW';

export class SegmentationService {
  /**
   * Identifies user segment based on historical data
   */
  public static async getUserSegment(userId: string): Promise<UserSegment> {
    const res = await query(`
      SELECT 
        (SELECT sum(real_balance) FROM wallets WHERE user_id = $1) as total_spent,
        (SELECT last_play_at FROM player_stats WHERE user_id = $1) as last_play
      `, [userId]
    );

    const { total_spent, last_play } = res.rows[0];

    if (!last_play) return 'NEW';

    const spent = parseFloat(total_spent || '0');
    if (spent > 10000) return 'WHALE';

    const daysSinceLastPlay = Math.floor((Date.now() - new Date(last_play).getTime()) / (1000 * 3600 * 24));
    if (daysSinceLastPlay > 7) return 'DORMANT';

    return 'CASUAL';
  }

  /**
   * Gets all userIds in a specific segment for campaigns
   */
  public static async getAudience(segment: UserSegment): Promise<string[]> {
    // Simplified logic
    const res = await query('SELECT user_id FROM player_stats');
    return res.rows.map(r => r.user_id);
  }
}
