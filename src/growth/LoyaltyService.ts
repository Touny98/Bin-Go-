import { query } from '../db';
import { logger } from '../utils/logger';

export class LoyaltyService {
  private static readonly XP_PER_PLAY = 100;
  private static readonly XP_PER_WIN = 500;

  /**
   * Adds XP and updates player level/stats
   */
  public static async addXP(userId: string, amount: number): Promise<void> {
    try {
      const res = await query(
        `INSERT INTO player_stats (user_id, xp) VALUES ($1, $2) 
         ON CONFLICT (user_id) DO UPDATE SET xp = player_stats.xp + $2 
         RETURNING xp, level`,
        [userId, amount]
      );

      const { xp, level } = res.rows[0];
      const nextLevel = Math.floor(Math.sqrt(xp / 100)) + 1;

      if (nextLevel > level) {
        await query('UPDATE player_stats SET level = $1 WHERE user_id = $2', [nextLevel, userId]);
        logger.info({ userId, level: nextLevel }, '[LoyaltyService] Player leveled up!');
      }
    } catch (e: any) {
      logger.error({ userId, error: e.message }, '[LoyaltyService] Failed to update stats');
    }
  }

  /**
   * Updates daily play streak
   */
  public static async updateStreak(userId: string): Promise<void> {
    const res = await query('SELECT last_play_at, current_streak FROM player_stats WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) return;

    const lastPlay = res.rows[0].last_play_at;
    const now = new Date();
    
    if (!lastPlay) {
      await query('UPDATE player_stats SET current_streak = 1, last_play_at = NOW() WHERE user_id = $1', [userId]);
      return;
    }

    const diffDays = Math.floor((now.getTime() - new Date(lastPlay).getTime()) / (1000 * 3600 * 24));

    if (diffDays === 1) {
      await query('UPDATE player_stats SET current_streak = current_streak + 1, last_play_at = NOW() WHERE user_id = $1', [userId]);
    } else if (diffDays > 1) {
      await query('UPDATE player_stats SET current_streak = 1, last_play_at = NOW() WHERE user_id = $1', [userId]);
    }
  }
}
