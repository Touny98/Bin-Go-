import { connection } from '../../queue';

// We could use Postgres for heavy analytics, but Redis counters are great for realtime ARPU/Retention
export class RetentionMetrics {
  /**
   * Tracks a user interaction for Daily Active Users (DAU)
   */
  static async trackActiveUser(userId: string) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `analytics:dau:${today}`;
    
    // Add user to a Redis HyperLogLog or Set
    await connection.pfadd(key, userId);
  }

  /**
   * Tracks revenue for ARPU calculation
   */
  static async trackRevenue(amount: number) {
    const today = new Date().toISOString().split('T')[0];
    const key = `analytics:revenue:${today}`;
    
    await connection.incrbyfloat(key, amount);
  }

  /**
   * Gets current Daily ARPU
   */
  static async getDailyARPU(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const dauStr = await connection.pfcount(`analytics:dau:${today}`);
    const revenueStr = await connection.get(`analytics:revenue:${today}`);
    
    const dau = Number(dauStr) || 0;
    const revenue = parseFloat(revenueStr || '0');

    if (dau === 0) return 0;
    return revenue / dau;
  }
}
