import { connection } from '../queue';
import { logger } from '../utils/logger';

export class PresenceService {
  private static readonly PREFIX = 'presence:';
  private static readonly ROOM_PREFIX = 'presence:room:';

  /**
   * Tracks a user's connection to a specific room
   */
  public static async trackConnection(userId: string, roomId?: string): Promise<void> {
    const multi = connection.multi();
    
    // Global online count
    multi.sadd(`${this.PREFIX}online`, userId);
    
    if (roomId) {
      // Room specific count
      multi.sadd(`${this.ROOM_PREFIX}${roomId}`, userId);
    }

    await multi.exec();
    logger.debug({ userId, roomId }, '[PresenceService] User connected');
  }

  /**
   * Tracks a user's disconnection
   */
  public static async trackDisconnect(userId: string, roomId?: string): Promise<void> {
    const multi = connection.multi();
    
    multi.srem(`${this.PREFIX}online`, userId);
    
    if (roomId) {
      multi.srem(`${this.ROOM_PREFIX}${roomId}`, userId);
    }

    await multi.exec();
    logger.debug({ userId }, '[PresenceService] User disconnected');
  }

  /**
   * Gets statistics for a room
   */
  public static async getRoomStats(roomId: string): Promise<{ viewers: number }> {
    const viewers = await connection.scard(`${this.ROOM_PREFIX}${roomId}`);
    return { viewers };
  }

  /**
   * Gets global online statistics
   */
  public static async getGlobalStats(): Promise<{ online: number }> {
    const online = await connection.scard(`${this.PREFIX}online`);
    return { online };
  }
}
