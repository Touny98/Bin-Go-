import { SocketServer } from './SocketServer';
import { logger } from '../utils/logger';
import { MetricsAggregationService } from '../services/metrics/MetricsAggregationService';

export class AdminRealtimeGateway {
  private static interval: NodeJS.Timeout | null = null;
  private static lastSnapshot: any = null;

  /**
   * Starts periodic broadcast of operational metrics to the Admin Namespace
   */
  public static initialize() {
    logger.info('[AdminRealtimeGateway] Initializing operational metrics fanout...');

    // Broadcast snapshot every 5 seconds
    this.interval = setInterval(async () => {
      try {
        const metrics = await MetricsAggregationService.getLiveMetrics();
        
        // Emit full snapshot
        SocketServer.emitToRoom('admin_dashboard', 'metrics.snapshot', metrics);
        
        // Emit delta if possible
        if (this.lastSnapshot) {
          const delta = MetricsAggregationService.computeDelta(metrics);
          if (delta && Object.keys(delta).length > 0) {
            SocketServer.emitToRoom('admin_dashboard', 'metrics.delta', delta);
          }
        }
        
        this.lastSnapshot = metrics;
      } catch (e: any) {
        logger.error({ error: e.message }, '[AdminRealtimeGateway] Failed to broadcast metrics');
      }
    }, 5000);
  }

  /**
   * Cleanup for graceful shutdown
   */
  public static shutdown() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
