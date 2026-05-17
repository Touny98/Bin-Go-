import { v4 as uuidv4 } from 'uuid';
import { connection } from '../../queue';
import { logger } from '../../utils/logger';

export class SecurityManager {
  private static readonly SESSION_PREFIX = 'session:';

  /**
   * Tracks a new login session with device fingerprinting
   */
  public static async createSession(userId: string, metadata: any = {}): Promise<string> {
    const sessionId = uuidv4();
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    
    // Store session with TTL (e.g. 24h)
    await connection.setex(key, 86400, JSON.stringify({
      userId,
      ...metadata,
      createdAt: new Date()
    }));

    return sessionId;
  }

  /**
   * Validates a session and checks for anomalies
   */
  public static async validateSession(sessionId: string, currentIp?: string): Promise<boolean> {
    const data = await connection.get(`${this.SESSION_PREFIX}${sessionId}`);
    if (!data) return false;

    const session = JSON.parse(data);
    
    // Anomaly detection: IP mismatch
    if (currentIp && session.lastIp && session.lastIp !== currentIp) {
      logger.warn({ userId: session.userId, oldIp: session.lastIp, newIp: currentIp }, '[SecurityManager] IP Mismatch detected!');
      // Could trigger account lock or re-auth here
    }

    return true;
  }

  /**
   * Revokes a specific session
   */
  public static async revokeSession(sessionId: string): Promise<void> {
    await connection.del(`${this.SESSION_PREFIX}${sessionId}`);
  }
}
