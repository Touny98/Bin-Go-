import { connection as redis } from '../../queue';
import { SocketServer } from '../../realtime/SocketServer';
import { logger } from '../../utils/logger';

export interface LockStatus {
  isLocked: boolean;
  operatorId?: string;
  operatorName?: string;
  expiresAt?: number;
}

/**
 * OperatorActionLockService
 *
 * Manages distributed locks for administrative actions to prevent collisions
 * between multiple operators working on the same resource (e.g., a payout).
 * Uses Redis with TTL and heartbeat support.
 */
export class OperatorActionLockService {
  private static readonly LOCK_PREFIX = 'oplock:';
  private static readonly DEFAULT_TTL_SEC = 30;

  /**
   * Attempts to acquire a lock on a resource.
   */
  public static async acquire(
    resourceId: string, 
    operatorId: string, 
    operatorName: string,
    ttlSec: number = this.DEFAULT_TTL_SEC
  ): Promise<boolean> {
    const key = `${this.LOCK_PREFIX}${resourceId}`;
    const value = JSON.stringify({ operatorId, operatorName, expiresAt: Date.now() + (ttlSec * 1000) });
    
    // Use SET with NX (not exists) and EX (expire)
    const result = await redis.set(key, value, 'EX', ttlSec, 'NX');
    
    if (result === 'OK') {
      logger.info({ resourceId, operatorId }, '[OperatorActionLockService] Lock acquired');
      
      // Notify other operators via WebSockets
      SocketServer.emitToRoom('admin_dashboard', 'payout.locked', {
        resourceId,
        operatorId,
        operatorName,
        expiresAt: Date.now() + (ttlSec * 1000)
      });
      
      return true;
    }

    return false;
  }

  /**
   * Releases a lock, but only if it belongs to the specified operator.
   */
  public static async release(resourceId: string, operatorId: string): Promise<boolean> {
    const key = `${this.LOCK_PREFIX}${resourceId}`;
    const currentLock = await redis.get(key);
    
    if (!currentLock) return true;
    
    const lockData = JSON.parse(currentLock);
    if (lockData.operatorId === operatorId) {
      await redis.del(key);
      logger.info({ resourceId, operatorId }, '[OperatorActionLockService] Lock released');
      
      SocketServer.emitToRoom('admin_dashboard', 'payout.released', { resourceId });
      return true;
    }

    return false;
  }

  /**
   * Renews an existing lock (heartbeat).
   */
  public static async renew(resourceId: string, operatorId: string, ttlSec: number = this.DEFAULT_TTL_SEC): Promise<boolean> {
    const key = `${this.LOCK_PREFIX}${resourceId}`;
    const currentLock = await redis.get(key);
    
    if (!currentLock) return false;
    
    const lockData = JSON.parse(currentLock);
    if (lockData.operatorId === operatorId) {
      const newValue = JSON.stringify({ ...lockData, expiresAt: Date.now() + (ttlSec * 1000) });
      await redis.set(key, newValue, 'EX', ttlSec);
      return true;
    }

    return false;
  }

  /**
   * Gets the current status of a lock.
   */
  public static async getStatus(resourceId: string): Promise<LockStatus> {
    const key = `${this.LOCK_PREFIX}${resourceId}`;
    const data = await redis.get(key);
    
    if (!data) return { isLocked: false };
    
    const lockData = JSON.parse(data);
    return {
      isLocked: true,
      operatorId: lockData.operatorId,
      operatorName: lockData.operatorName,
      expiresAt: lockData.expiresAt
    };
  }
}
