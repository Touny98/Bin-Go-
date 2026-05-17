import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export type AdminRole = 'SUPER_ADMIN' | 'FINANCE_ADMIN' | 'SUPPORT_AGENT' | 'CAMPAIGN_MANAGER' | 'MODERATOR';

export interface AdminUser {
  id: number;
  username: string;
  role: AdminRole;
}

const PERMISSIONS: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ['*'],
  FINANCE_ADMIN: ['view_payouts', 'approve_payouts', 'view_ledger', 'manage_wallets'],
  SUPPORT_AGENT: ['view_users', 'view_conversations', 'view_ledger', 'manual_rejection'],
  CAMPAIGN_MANAGER: ['manage_campaigns', 'view_analytics', 'send_bulk'],
  MODERATOR: ['view_rooms', 'shutdown_room', 'ban_user']
};

export class RBACService {
  /**
   * Middleware to check if the admin has the required permission
   */
  public static checkPermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const admin = (req as any).admin as AdminUser;
      
      if (!admin) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const allowedPermissions = PERMISSIONS[admin.role] || [];
      
      if (allowedPermissions.includes('*') || allowedPermissions.includes(permission)) {
        return next();
      }

      logger.warn({ adminId: admin.id, role: admin.role, attemptedPermission: permission }, '[RBAC] Permission denied');
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    };
  }
}
