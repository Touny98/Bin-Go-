import { Request, Response } from 'express';
import { query } from '../db';
import { connection } from '../queue';

export class HealthCheck {
  /**
   * Kubernetes Liveness Probe: Is the process alive?
   */
  public static liveness(req: Request, res: Response) {
    res.status(200).send('OK');
  }

  /**
   * Kubernetes Readiness Probe: Is the process ready to serve traffic?
   */
  public static async readiness(req: Request, res: Response) {
    const status: any = {
      database: 'DOWN',
      redis: 'DOWN',
      uptime: process.uptime()
    };

    try {
      await query('SELECT 1');
      status.database = 'OK';
    } catch (e) {}

    try {
      await connection.ping();
      status.redis = 'OK';
    } catch (e) {}

    const isReady = status.database === 'OK' && status.redis === 'OK';
    res.status(isReady ? 200 : 503).json(status);
  }
}
