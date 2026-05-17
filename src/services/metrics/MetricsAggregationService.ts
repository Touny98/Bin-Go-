import { connection as redisConnection } from '../../queue';
import {
  gameStartQueue,
  ballDrawQueue,
  whatsappInboundQueue,
  notifyHighQueue,
  paymentConfirmationQueue,
  reservationExpireQueue,
  renderQueue,
  mediaCleanupQueue,
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
      render: await renderQueue.count(),
      mediaCleanup: await mediaCleanupQueue.count(),
      campaign: await campaignQueue.count(),
      payout: await payoutQueue.count(),
      reconciliation: await reconciliationQueue.count(),
      fraud: await fraudQueue.count(),
    };

    // DB health (simple SELECT 1)
    let dbHealthy = false;
    try {
      const res = await query('SELECT 1');
      dbHealthy = res.rowCount > 0;
    } catch (_) {}

    // Redis health (PING)
    let redisHealthy = false;
    try {
      const pong = await redisConnection.ping();
      redisHealthy = pong === 'PONG';
    } catch (_) {}

    // System metrics
    const cpuLoad = os.loadavg(); // [1,5,15] minute averages
    const memoryUsage = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    };

    // Business metrics – placeholder aggregates
    const revenueRes = await query(`
      SELECT SUM(amount) as total FROM ledger_entries
      WHERE category = 'DEPOSIT' AND created_at > NOW() - INTERVAL '24 hours'
    `);
    const dailyRevenue = parseFloat(revenueRes.rows[0].total || '0');

    const activeRoomsRes = await query(
      "SELECT COUNT(*) FROM game_sessions WHERE status IN ('READY','IN_PROGRESS')",
    );
    const activeRooms = parseInt(activeRoomsRes.rows[0].count);

    const snapshot = {
      timestamp: new Date().toISOString(),
      queueDepths,
      health: {
        db: dbHealthy,
        redis: redisHealthy,
      },
      system: {
        cpuLoad,
        memoryUsage,
      },
      business: {
        dailyRevenue,
        activeRooms,
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
