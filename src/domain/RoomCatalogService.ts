import { query } from '../db';
import { connection } from '../queue';
import { logger } from '../utils/logger';

export interface Room {
  id: number;
  name: string;
  description?: string;
  card_price: number;
  platform_fee: number;
  jackpot_fee: number;
  jackpot_amount: number;
  accumulated_jackpot: number;
  total_jackpot: number;   // session + accumulated
  players_count: number;
  status: string;
  game_mode: string;
  max_balls: number;
  is_featured: boolean;
  scheduled_at?: Date | null;
  rollover_weeks?: number;
  session_id?: number;
  weekly_day?: number | null;
  weekly_time?: string | null;
  daily_times?: string;
  interval_minutes?: number | null;
}

export class RoomCatalogService {
  private static readonly CACHE_KEY = 'catalog:active_rooms';
  private static readonly CACHE_TTL = 10;

  public static async getAvailableRooms(): Promise<Room[]> {
    const cached = await connection.get(this.CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    logger.debug('[RoomCatalogService] Cache miss, fetching rooms from DB');
    const result = await query(`
      SELECT * FROM (
        SELECT DISTINCT ON (r.id)
          r.id, r.name, r.description, r.card_price,
          r.platform_fee, r.jackpot_fee,
          r.game_mode, r.max_balls, r.is_featured,
          r.accumulated_jackpot,
          r.weekly_day, r.daily_times, r.interval_minutes,
          s.id as session_id, s.status, s.jackpot_amount,
          s.scheduled_at, s.rollover_weeks,
          (SELECT COUNT(*) FROM cards c WHERE c.game_session_id = s.id AND c.status = 'active') AS players_count
        FROM rooms r
        JOIN game_sessions s ON r.id = s.room_id
        WHERE s.status IN ('CREATED', 'READY')
          AND s.scheduled_at > NOW() + INTERVAL '1 minute'
        ORDER BY r.id, s.scheduled_at ASC
      ) sub
      ORDER BY
        CASE
          WHEN weekly_day IS NOT NULL THEN 1
          WHEN daily_times != '[]' THEN 2
          ELSE 3
        END ASC,
        scheduled_at ASC
    `);

    const rooms: Room[] = result.rows.map((row: any) => {
      const sessionJackpot = parseFloat(row.jackpot_amount) || 0;
      const accumulated = parseFloat(row.accumulated_jackpot) || 0;
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        card_price: parseFloat(row.card_price),
        platform_fee: parseFloat(row.platform_fee),
        jackpot_fee: parseFloat(row.jackpot_fee),
        jackpot_amount: sessionJackpot,
        accumulated_jackpot: accumulated,
        total_jackpot: sessionJackpot + accumulated,
        players_count: parseInt(row.players_count),
        status: row.status,
        game_mode: row.game_mode,
        max_balls: parseInt(row.max_balls),
        is_featured: row.is_featured,
        scheduled_at: row.scheduled_at ? new Date(row.scheduled_at) : null,
        rollover_weeks: parseInt(row.rollover_weeks) || 0,
        session_id: parseInt(row.session_id) || undefined,
        weekly_day: row.weekly_day,
        weekly_time: row.weekly_time,
        daily_times: row.daily_times,
        interval_minutes: row.interval_minutes,
      };
    });

    await connection.set(this.CACHE_KEY, JSON.stringify(rooms), 'EX', this.CACHE_TTL);
    return rooms;
  }

  public static async getRoomById(id: number): Promise<Room | null> {
    const rooms = await this.getAvailableRooms();
    return rooms.find(r => r.id === id) || null;
  }

  public static invalidateCache(): Promise<number> {
    return connection.del(this.CACHE_KEY);
  }
}
