import { query } from '../db';
import { connection } from '../queue';
import { logger } from '../utils/logger';

export class ConfigService {
  private static cache: Map<string, any> = new Map();
  private static readonly REDIS_KEY = 'bingo:dynamic_config';

  /**
   * Gets a configuration value, prioritizing cache -> Redis -> DB
   */
  public static async get(key: string, defaultValue: any = null): Promise<any> {
    // 1. Memory Cache
    if (this.cache.has(key)) return this.cache.get(key);

    // 2. Redis Cache
    const redisVal = await connection.hget(this.REDIS_KEY, key);
    if (redisVal) {
      const parsed = JSON.parse(redisVal);
      this.cache.set(key, parsed);
      return parsed;
    }

    // 3. Database
    const res = await query('SELECT value FROM dynamic_configs WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      const value = res.rows[0].value;
      await connection.hset(this.REDIS_KEY, key, JSON.stringify(value));
      this.cache.set(key, value);
      return value;
    }

    return defaultValue;
  }

  /**
   * Sets a configuration value and invalidates caches
   */
  public static async set(key: string, value: any): Promise<void> {
    await query(
      'INSERT INTO dynamic_configs (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [key, JSON.stringify(value)]
    );
    
    await connection.hset(this.REDIS_KEY, key, JSON.stringify(value));
    this.cache.set(key, value);
    
    logger.info({ key, value }, '[ConfigService] Configuration updated');
  }

  /**
   * Feature Flag check
   */
  public static async isEnabled(flag: string): Promise<boolean> {
    const value = await this.get(`flag:${flag}`, false);
    return value === true;
  }
}
