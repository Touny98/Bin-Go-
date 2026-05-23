import { Request, Response, NextFunction } from 'express';
import { AdminAuthService } from '../auth/AdminAuthService';
import { logger } from '../utils/logger';

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = AdminAuthService.verifyToken(token);
    (req as any).admin = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      operatorId: payload.operatorId,
      operatorName: payload.operatorName,
    };
    next();
  } catch (err: any) {
    logger.warn({ error: err.message }, '[AdminAuth] Invalid token');
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
