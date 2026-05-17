import { query } from '../db';
import { connection } from '../queue';
import { logger } from '../utils/logger';

export interface Room {
  id: number;
  name: string;
  card_price: number;
  jackpot_amount: number;
  players_count: number;
  status: string;
  starts_in_seconds?: number;
}

export class RoomCatalogService {
  private static readonly CACHE_KEY = 'catalog:active_rooms';
  private static readonly CACHE_TTL = 10; // 10 seconds

  /**
   * Returns active rooms with a hybrid cache strategy
   */
  public static async getAvailableRooms(): Promise<Room[]> {
    // 1. Try Cache
    const cached = await connection.get(this.CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Fetch from DB
    logger.debug('[RoomCatalogService] Cache miss, fetching rooms from DB');
    const result = await query(`
      SELECT 
        r.id, r.name, r.card_price, 
        s.id as session_id, s.status, s.jackpot_amount,
        (SELECT count(*) FROM cards WHERE game_session_id = s.id AND status = 'active') as players_count
      FROM rooms r
      JOIN game_sessions s ON r.id = s.room_id
      WHERE s.status IN ('CREATED', 'READY')
      ORDER BY s.scheduled_at ASC
    `);

    const rooms: Room[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      card_price: parseFloat(row.card_price),
      jackpot_amount: parseFloat(row.jackpot_amount),
      players_count: parseInt(row.players_count),
      status: row.status
    }));

    // 3. Save to Cache
    await connection.set(this.CACHE_KEY, JSON.stringify(rooms), 'EX', this.CACHE_TTL);

    return rooms;
  }

  public static async getRoomById(id: number): Promise<Room | null> {
    const rooms = await this.getAvailableRooms();
    return rooms.find(r => r.id === id) || null;
  }
}
