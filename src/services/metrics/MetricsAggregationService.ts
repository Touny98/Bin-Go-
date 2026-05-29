import { connection as redisConnection } from '../../queue';
import {
  gameStartQueue,
  ballDrawQueue,
  whatsappInboundQueue,
  notifyHighQueue,
  paymentConfirmationQueue,
  reservationExpireQueue,
  campaignQueue,
  payoutQueue,
  reconciliationQueue,
  fraudQueue,
} from '../../queue';
import { query } from '../../db';
import os from 'os';
import { logger } from '../../utils/logger';

/**
 * Service responsible for aggregating operational metrics across the platform.
 *
 * It caches the result in Redis for 5 seconds (configurable) using a
 * stale‑while‑revalidate strategy to minimise load on the DB and workers.
 */
export class MetricsAggregationService {
  private static readonly CACHE_KEY = 'metrics:live';
  private static readonly CACHE_TTL_SECONDS = 5;
  private static lastSnapshot: any = null; // for delta calculation

  /**
   * Public entry‑point used by API and admin realtime gateway.
   */
  public static async getLiveMetrics(): Promise<any> {
    try {
      const cached = await redisConnection.get(MetricsAggregationService.CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Trigger background refresh if stale (near TTL expiry)
        MetricsAggregationService.refreshIfStale();
        return parsed;
      }
      // No cache – compute synchronously
      const fresh = await MetricsAggregationService.computeMetrics();
      await redisConnection.setex(
        MetricsAggregationService.CACHE_KEY,
        MetricsAggregationService.CACHE_TTL_SECONDS,
        JSON.stringify(fresh),
      );
      return fresh;
    } catch (err) {
      logger.error({ err }, 'MetricsAggregationService.getLiveMetrics failed');
      // Fallback – compute directly (no caching)
      return MetricsAggregationService.computeMetrics();
    }
  }

  /**
   * Compute metrics from all sources.
   */
  private static async computeMetrics(): Promise<any> {
    // Queue depths
    const queueDepths = {
      gameStart: await gameStartQueue.count(),
      ballDraw: await ballDrawQueue.count(),
      whatsappInbound: await whatsappInboundQueue.count(),
      notifyHigh: await notifyHighQueue.count(),
      paymentConfirmation: await paymentConfirmationQueue.count(),
      reservationExpire: await reservationExpireQueue.count(),
      campaign: await campaignQueue.count(),
      payout: await payoutQueue.count(),
      reconciliation: await reconciliationQueue.count(),
      fraud: await fraudQueue.count(),
    };

    // DB health (simple SELECT 1)
    let dbHealthy = false;
    try {
      const res = await query('SELECT 1');
      dbHealthy = res && res.rowCount !== null && res.rowCount > 0;
    } catch (_) {}

    // Redis health (PING)
    let redisHealthy = false;
    try {
      const pong = await redisConnection.ping();
      redisHealthy = pong === 'PONG';
    } catch (_) {}

    // System metrics
    const cpuLoad = os.loadavg(); // [1,5,15] minute averages
    const memoryUsageBytes = os.totalmem() - os.freemem();
    const memoryUsagePercent = (memoryUsageBytes / os.totalmem()) * 100;

    // Business metrics – placeholder aggregates
    let dailyRevenue = 0;
    let activeRooms = 0;
    let pendingPayouts = 0;

    try {
      // Ingresos del día = ventas de cartones CONFIRMADAS (status PAID) en las últimas 24 hs
      const revenueRes = await query(`
        SELECT COALESCE(SUM(r.card_price), 0) as total
        FROM card_reservations cr
        JOIN cards c ON c.id = cr.card_id
        JOIN game_sessions gs ON gs.id = c.game_session_id
        JOIN rooms r ON r.id = gs.room_id
        WHERE cr.status = 'PAID'
          AND cr.created_at > NOW() - INTERVAL '24 hours'
      `);
      dailyRevenue = parseFloat(revenueRes.rows[0]?.total || '0');
    } catch (e) {
      logger.warn('Failed to compute daily revenue');
    }

    try {
      // Contar salas DISTINTAS con al menos una sesión activa o próxima (no total de sesiones)
      const activeRoomsRes = await query(
        `SELECT COUNT(DISTINCT room_id) FROM game_sessions
         WHERE status = 'RUNNING'
            OR (status IN ('CREATED','READY')
                AND scheduled_at BETWEEN NOW() - INTERVAL '10 minutes' AND NOW() + INTERVAL '25 hours')`,
      );
      activeRooms = parseInt(activeRoomsRes.rows[0]?.count || '0');
    } catch (e) {
      logger.warn('Failed to compute active rooms');
    }

    try {
      const payoutRes = await query(
        "SELECT COUNT(*) FROM payout_requests WHERE status = 'PENDING'",
      );
      pendingPayouts = parseInt(payoutRes.rows[0]?.count || '0');
    } catch (e) {
      logger.warn('Failed to compute pending payouts');
    }

    // Presence (online users) – active card holders in live sessions
    let onlineUsers = 0;
    try {
      const onlineRes = await query(
        `SELECT COUNT(DISTINCT c.user_id)
         FROM cards c
         JOIN game_sessions gs ON c.game_session_id = gs.id
         WHERE gs.status = 'RUNNING' AND c.status = 'active'`,
      );
      onlineUsers = parseInt(onlineRes.rows[0]?.count || '0');
    } catch (e) {
      logger.warn('Failed to compute online users');
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      __cachedAt: Date.now(),
      queueDepths,
      health: {
        db: dbHealthy,
        redis: redisHealthy,
      },
      system: {
        cpuLoad,
        memoryUsage: memoryUsagePercent,
        redisHealth: redisHealthy ? 'healthy' : 'unhealthy',
      },
      business: {
        dailyRevenue,
        activeRooms,
        pendingPayouts,
      },
      presence: {
        online: onlineUsers,
      },
    };

    // Store for delta calculation
    MetricsAggregationService.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Refresh cache in background if the stored value is older than TTL‑1 seconds.
   */
  private static async refreshIfStale() {
    try {
      const ttl = await redisConnection.ttl(MetricsAggregationService.CACHE_KEY);
      if (ttl !== null && ttl <= 1) {
        // Fire‑and‑forget recompute
        MetricsAggregationService.computeMetrics().then((fresh) => {
          redisConnection.setex(
            MetricsAggregationService.CACHE_KEY,
            MetricsAggregationService.CACHE_TTL_SECONDS,
            JSON.stringify(fresh),
          );
        });
      }
    } catch (_) {
      // ignore – cache will be refreshed on next request
    }
  }

  /**
   * Compute delta against the previously stored snapshot.
   */
  public static computeDelta(current: any): any {
    if (!MetricsAggregationService.lastSnapshot) return null;
    const delta: any = {};
    // Simple shallow diff for numeric fields
    for (const key of Object.keys(current)) {
      if (typeof current[key] === 'object') continue; // skip nested for brevity
      if (current[key] !== MetricsAggregationService.lastSnapshot[key]) {
        delta[key] = { previous: MetricsAggregationService.lastSnapshot[key], current: current[key] };
      }
    }
    return delta;
  }
}
