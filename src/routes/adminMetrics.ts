import { Router } from 'express';
import { MetricsAggregationService } from '../services/metrics/MetricsAggregationService';
import { AlertAggregationService } from '../services/metrics/AlertAggregationService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/admin/metrics/live
 * Returns the latest operational metrics snapshot.
 * Protected by admin auth middleware (applied in index.ts).
 */
router.get('/live', async (req, res) => {
  const correlationId = req.header('x-correlation-id') || 'internal';
  
  try {
    const metrics = await MetricsAggregationService.getLiveMetrics();
    const alerts = await AlertAggregationService.getLatestAlerts(15);
    
    // Set cache headers: 5s max-age, stale-while-revalidate 30s
    res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
    res.set('x-correlation-id', correlationId);
    
    res.json({
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      stale: metrics.__cachedAt ? (Date.now() - metrics.__cachedAt > 5000) : false,
      data: {
        ...metrics,
        alerts
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, correlationId }, '[AdminMetricsRoute] Failed to fetch live metrics');
    res.status(503).json({
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      stale: true,
      data: null,
      notice: 'Metrics temporarily unavailable'
    });
  }
});

export default router;
