import { Router } from 'express';
import { OperatorActionLockService } from '../services/admin/OperatorActionLockService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/admin/finance/lock/:resourceId
 * Attempts to acquire a lock for a resource.
 */
router.post('/lock/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  const { operatorId, operatorName } = (req as any).admin; // From auth middleware

  try {
    const success = await OperatorActionLockService.acquire(resourceId, operatorId, operatorName);
    
    if (success) {
      res.json({ success: true, message: 'Lock acquired' });
    } else {
      const status = await OperatorActionLockService.getStatus(resourceId);
      res.status(409).json({ 
        success: false, 
        message: 'Resource is already locked by another operator',
        lockedBy: status.operatorName,
        expiresAt: status.expiresAt
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message, resourceId }, '[AdminFinanceRoute] Lock acquisition failed');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/finance/lock/:resourceId
 * Releases a lock.
 */
router.delete('/lock/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  const { operatorId } = (req as any).admin;

  try {
    const success = await OperatorActionLockService.release(resourceId, operatorId);
    res.json({ success });
  } catch (error: any) {
    logger.error({ error: error.message, resourceId }, '[AdminFinanceRoute] Lock release failed');
    res.status(500).json({ success: false });
  }
});

/**
 * GET /api/admin/finance/lock/status/:resourceId
 */
router.get('/lock/status/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  try {
    const status = await OperatorActionLockService.getStatus(resourceId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
