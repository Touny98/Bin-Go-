import { query } from '../db';
import { logger } from '../utils/logger';

export interface RiskAnalysis {
  score: number;
  notes: string[];
  requiresManualReview: boolean;
}

export class RiskEngine {
  private static readonly MANUAL_REVIEW_THRESHOLD = 5000;

  /**
   * Performs risk analysis on a payout request
   */
  public static async analyzePayout(userId: string, amount: number): Promise<RiskAnalysis> {
    const notes: string[] = [];
    let score = 0;

    // 1. Threshold check
    if (amount >= this.MANUAL_REVIEW_THRESHOLD) {
      score += 50;
      notes.push('High amount withdrawal');
    }

    // 2. Velocity check (Withdrawals in last 24h)
    const velocityRes = await query(
      "SELECT COUNT(*) FROM payout_requests WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'",
      [userId]
    );
    const count = parseInt(velocityRes.rows[0].count);
    if (count > 3) {
      score += 30;
      notes.push('High frequency of withdrawals');
    }

    // 3. New user check
    const userStats = await query('SELECT created_at FROM player_stats WHERE user_id = $1', [userId]);
    // Simplified check: if no stats yet, it's risky
    if (userStats.rows.length === 0) {
      score += 20;
      notes.push('User has no play history');
    }

    return {
      score,
      notes,
      requiresManualReview: score >= 50
    };
  }
}
