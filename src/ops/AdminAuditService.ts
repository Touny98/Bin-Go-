import { query } from '../db';
import { logger } from '../utils/logger';

export class AdminAuditService {
  /**
   * Logs an administrative action for accountability
   */
  public static async logAction(
    adminId: number,
    action: string,
    targetType: string,
    targetId: string,
    changes: any = {},
    ipAddress?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, changes, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, action, targetType, targetId, JSON.stringify(changes), ipAddress]
      );
      
      logger.info({ adminId, action, targetType, targetId }, '[AdminAudit] Action logged');
    } catch (e: any) {
      logger.error({ error: e.message }, '[AdminAudit] Failed to log action');
    }
  }
}
