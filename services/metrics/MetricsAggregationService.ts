import { connection as redisConnection } from '../../src/queue';
import { query } from '../../src/db';
import { 
  gameStartQueue,
  ballDrawQueue,
  whatsappInboundQueue,
  notifyHighQueue,
  notifyBulkQueue,
  paymentConfirmationQueue,
  payoutQueue,
  reconciliationQueue,
  renderQueue,
  fraudQueue
} from '../../src/queue';
import { logger } from '../../src/utils/logger';
import { SocketServer } from '../../src/realtime/SocketServer';
import { PresenceService } from '../../src/realtime/PresenceService';

// Types for metrics payload
export interface Metrics {
  timestamp: string;
  queues: Record<string, number>;
  workers: Record<string, { status: string; uptime: number; jobsPerSec: number; memoryMB: number }>;
  system: { cpuUsage: number; memoryUsage: number; redisHealth: string; postgresHealth: string };
  business: { dailyRevenue: number; activeRooms: number; pendingPayouts: number; dau: number };
  alerts: Array<{ severity: string; message: string; timestamp: string }>; // simplified
}

/**
 * MetricsAggregationService aggregates all operational metrics.
 * It uses Redis caching with a 5‑second TTL and stale‑while‑revalidate.
 * A simple anti‑flood guard ensures we do not refresh more than once per second.
 */
export class MetricsAggregationService {
  private static readonly CACHE_KEY = 'liveops:metrics';
  private static readonly CACHE_TTL_MS = 5000; // 5 seconds
  private static lastRefresh = 0;

  /**
   * Returns cached metrics if fresh, otherwise triggers background refresh.
   */
  public static async getMetrics(): Promise<Metrics> {
    const now = Date.now();
    const cached = await redisConnection.get(this.CACHE_KEY);
    if (cached) {
      const parsed: Metrics = JSON.parse(cached);
      // If stale, fire async refresh (no await)
      if (now - this.lastRefresh > 1000) {
        this.lastRefresh = now;
        this.refreshMetrics().catch((e) => logger.error(e, 'Metrics refresh failed'));
      }
      return parsed;
    }
    // No cache, fetch synchronously
    const fresh = await this.refreshMetrics();
    return fresh;
  }

  /**
   * Performs aggregation and stores result in Redis.
   */
  private static async refreshMetrics(): Promise<Metrics> {
    // 1️⃣ Queue depths
    const queueMetrics = {
      gameStart: await gameStartQueue.count(),
      ballDraw: await ballDrawQueue.count(),
      whatsappInbound: await whatsappInboundQueue.count(),
      notifyHigh: await notifyHighQueue.count(),
      notifyBulk: await notifyBulkQueue.count(),
      paymentConfirm: await paymentConfirmationQueue.count(),
      payout: await payoutQueue.count(),
      reconciliation: await reconciliationQueue.count(),
      render: await renderQueue.count(),
      fraud: await fraudQueue.count()
    };

    // 2️⃣ Business metrics (simple queries)
    const revenueRes = await query(`SELECT COALESCE(SUM(amount),0) as total FROM ledger_entries WHERE category='DEPOSIT' AND created_at > NOW() - INTERVAL '24 hours'`);
    const activeRoomsRes = await query("SELECT COUNT(*) as cnt FROM game_sessions WHERE status IN ('READY','IN_PROGRESS')");
    const pendingPayoutsRes = await query('SELECT COUNT(*) as cnt FROM payouts WHERE status = \'PENDING\'');
    const dauRes = await query('SELECT COUNT(DISTINCT user_id) as cnt FROM session_events WHERE event = \'login\' AND created_at > NOW() - INTERVAL \'24 hours\'');

    // 3️⃣ System health (placeholder values)
    const cpuUsage = process.cpuUsage().user / 1e6; // ms -> % approximation
    const memoryUsage = process.memoryUsage().rss / (1024 * 1024);
    const redisHealth = redisConnection.status;
    const postgresHealth = 'OK'; // could be replaced with a simple SELECT 1

    // 4️⃣ Worker status (placeholder static data)
    const workers = {
      realtimeGateway: { status: 'online', uptime: process.uptime(), jobsPerSec: 0, memoryMB: memoryUsage },
      adminRealtime: { status: 'online', uptime: process.uptime(), jobsPerSec: 0, memoryMB: memoryUsage }
    };

    const metrics: Metrics = {
      timestamp: new Date().toISOString(),
      queues: queueMetrics,
      workers,
      system: { cpuUsage, memoryUsage, redisHealth, postgresHealth },
      business: {
        dailyRevenue: parseFloat(revenueRes.rows[0].total),
        activeRooms: parseInt(activeRoomsRes.rows[0].cnt),
        pendingPayouts: parseInt(pendingPayoutsRes.rows[0].cnt),
        dau: parseInt(dauRes.rows[0].cnt)
      },
      alerts: []
    };
    // Cache result
    await redisConnection.set(this.CACHE_KEY, JSON.stringify(metrics), 'PX', this.CACHE_TTL_MS);
    // Emit snapshot event for live dashboard
    SocketServer.emitToRoom('admin_dashboard', 'metrics.snapshot', metrics);
    return metrics;
  }
}
