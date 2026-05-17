import { connection } from '../queue';
import { logger } from '../utils/logger';

export interface UserSession {
  userId: string;
  state: string;
  context: any;
  lastActivity: number;
}

export class SessionStore {
  private static readonly PREFIX = 'session:';
  private static readonly TTL = 3600 * 24; // 24 hours

  /**
   * Retrieves user session from Redis
   */
  public static async get(userId: string): Promise<UserSession> {
    const data = await connection.get(`${this.PREFIX}${userId}`);
    if (!data) {
      return {
        userId,
        state: 'IDLE',
        context: {},
        lastActivity: Date.now(),
      };
    }
    return JSON.parse(data);
  }

  /**
   * Saves user session to Redis
   */
  public static async save(session: UserSession): Promise<void> {
    session.lastActivity = Date.now();
    await connection.set(
      `${this.PREFIX}${session.userId}`,
      JSON.stringify(session),
      'EX',
      this.TTL
    );
  }

  /**
   * Updates state and context atomically (simple version)
   */
  public static async update(userId: string, updates: Partial<UserSession>): Promise<UserSession> {
    const session = await this.get(userId);
    const updated = { ...session, ...updates };
    await this.save(updated);
    return updated;
  }
}
