import { connection as redis } from '../../queue';
import { SocketServer } from '../../realtime/SocketServer';
import { logger } from '../../utils/logger';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  correlationId?: string;
  source: string;
}

/**
 * AlertAggregationService
 *
 * Centralizes operational alerts, handles deduplication within a cooldown window,
 * persists alerts to a Redis list for historical view, and broadcasts them via WebSockets.
 */
export class AlertAggregationService {
  private static readonly ALERTS_KEY = 'liveops:alerts';
  private static readonly MAX_ALERTS = 100;
  private static readonly COOLDOWN_KEY_PREFIX = 'alert:cooldown:';
  private static readonly DEFAULT_COOLDOWN_SEC = 30;

  /**
   * Processes a new alert.
   * If a similar alert (by message and source) was raised recently, it's ignored (deduplication).
   */
  public static async raise(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<void> {
    const { severity, message, source, correlationId } = alert;
    
    // 1. Deduplication logic (per source + message snippet)
    const cooldownKey = `${this.COOLDOWN_KEY_PREFIX}${source}:${message.substring(0, 32)}`;
    const isOnCooldown = await redis.get(cooldownKey);
    
    if (isOnCooldown && severity !== 'CRITICAL') {
      return; // Skip if not critical and on cooldown
    }

    const fullAlert: Alert = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      ...alert
    };

    // 2. Persist to Redis (bounded list)
    await redis.lpush(this.ALERTS_KEY, JSON.stringify(fullAlert));
    await redis.ltrim(this.ALERTS_KEY, 0, this.MAX_ALERTS - 1);

    // 3. Set cooldown
    await redis.set(cooldownKey, '1', 'EX', this.DEFAULT_COOLDOWN_SEC);

    // 4. Broadcast via WebSockets
    SocketServer.emitToRoom('admin_dashboard', 'alerts.feed', fullAlert);
    
    if (severity === 'CRITICAL') {
      SocketServer.emitToRoom('admin_dashboard', 'alerts.critical', fullAlert);
      logger.error({ alert: fullAlert }, '[AlertAggregationService] CRITICAL ALERT RAISED');
    } else {
      logger.info({ alert: fullAlert }, `[AlertAggregationService] ${severity} Alert`);
    }
  }

  /**
   * Retrieves the last N alerts.
   */
  public static async getLatestAlerts(limit: number = 20): Promise<Alert[]> {
    const rawAlerts = await redis.lrange(this.ALERTS_KEY, 0, limit - 1);
    return rawAlerts.map(raw => JSON.parse(raw));
  }
}
