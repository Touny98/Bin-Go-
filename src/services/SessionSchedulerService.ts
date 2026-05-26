import { query } from '../db';
import { logger } from '../utils/logger';
import { notifyHighQueue, gameStartQueue } from '../queue';
import { Templates } from '../conversation/templates/MessageTemplates';

interface RoomConfig {
  id: number;
  name: string;
  game_mode: string;
  max_balls: number;
  interval_minutes: number | null;
  daily_times: string[];
  weekly_day: number | null;
  weekly_time: string | null;
  accumulated_jackpot: number;
}

const TZ = 'America/Argentina/Buenos_Aires';

// Convierte hora y minuto en timezone Argentina a un Date UTC correcto
function argToUTC(h: number, m: number, dayOffset = 0): Date {
  const now = new Date();
  const argNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const argTarget = new Date(argNow);
  argTarget.setDate(argTarget.getDate() + dayOffset);
  argTarget.setHours(h, m, 0, 0);
  const offset = now.getTime() - argNow.getTime();
  return new Date(argTarget.getTime() + offset);
}

// Devuelve la hora actual en Argentina
function argNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: TZ }));
}

export class SessionSchedulerService {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;

  public static start(): void {
    if (this.intervalHandle) return;
    logger.info('[SessionSchedulerService] Starting cron (every 5 minutes)');
    // Ejecutar inmediatamente al arrancar y luego cada 5 minutos
    this.run().catch(e => logger.error({ error: e.message }, '[SessionSchedulerService] Initial run failed'));
    this.intervalHandle = setInterval(() => {
      this.run().catch(e =>
        logger.error({ error: e.message }, '[SessionSchedulerService] Scheduled run failed')
      );
    }, 5 * 60 * 1000);
  }

  public static stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public static async run(): Promise<void> {
    logger.debug('[SessionSchedulerService] Running session check...');

    const roomsRes = await query(
      `SELECT id, name, game_mode, max_balls, interval_minutes,
              daily_times, weekly_day, weekly_time, accumulated_jackpot
       FROM rooms
       ORDER BY id`
    );

    for (const room of roomsRes.rows as RoomConfig[]) {
      try {
        if (room.interval_minutes != null) {
          await this.scheduleExpress(room);
        }
        if (room.daily_times && room.daily_times.length > 0) {
          await this.scheduleDaily(room);
        }
        if (room.weekly_day != null && room.weekly_time != null) {
          await this.scheduleWeekly(room);
        }
      } catch (e: any) {
        logger.error({ roomId: room.id, error: e.message }, '[SessionSchedulerService] Error scheduling room');
      }
    }
  }

  // ── Sala Express: crear sesiones alineadas a marcas exactas del reloj ────────
  private static async scheduleExpress(room: RoomConfig): Promise<void> {
    const interval = room.interval_minutes!;

    // Calcular próxima marca exacta del reloj en horario Argentina
    const now = new Date();
    const arg = argNow();
    const totalMinutes = arg.getHours() * 60 + arg.getMinutes();
    const nextMarkMinutes = Math.ceil((totalMinutes + 1) / interval) * interval;
    const base = argToUTC(Math.floor(nextMarkMinutes / 60) % 24, nextMarkMinutes % 60);
    if (base <= now) base.setTime(base.getTime() + interval * 60000);

    // Pre-crear las próximas 3 sesiones alineadas
    const sessionTimes = [
      base,
      new Date(base.getTime() + interval * 60000),
      new Date(base.getTime() + interval * 2 * 60000),
    ];

    const horizon = new Date(Date.now() + (interval * 3 + 5) * 60000);
    const existing = await query(
      `SELECT scheduled_at FROM game_sessions
       WHERE room_id = $1
         AND status IN ('CREATED','READY')
         AND scheduled_at BETWEEN NOW() AND $2`,
      [room.id, horizon]
    );
    const existingKeys = new Set(
      existing.rows.map((r: any) => new Date(r.scheduled_at).toISOString().substring(0, 16))
    );

    for (const scheduledAt of sessionTimes) {
      const key = scheduledAt.toISOString().substring(0, 16);
      if (!existingKeys.has(key)) {
        await this.createSession(room, scheduledAt);
        logger.info({ roomId: room.id, scheduledAt }, '[SessionSchedulerService] Created express session');
      }
    }
  }

  // ── Sala Diaria: crear sesiones para cada hora del día ─────────────────────
  private static async scheduleDaily(room: RoomConfig): Promise<void> {
    const times: string[] = Array.isArray(room.daily_times)
      ? room.daily_times
      : JSON.parse(room.daily_times as any);

    for (const timeStr of times) {
      const [h, m] = timeStr.split(':').map(Number);

      // Probar hoy y mañana (en hora Argentina)
      for (const dayOffset of [0, 1]) {
        const scheduledAt = argToUTC(h, m, dayOffset);

        // Solo crear si es en el futuro (con 1 min de margen)
        if (scheduledAt.getTime() <= Date.now() + 60000) continue;

        const existing = await query(
          `SELECT id FROM game_sessions
           WHERE room_id = $1
             AND status IN ('CREATED','READY')
             AND scheduled_at = $2`,
          [room.id, scheduledAt]
        );

        if (existing.rows.length === 0) {
          await this.createSession(room, scheduledAt);
          logger.info(
            { roomId: room.id, scheduledAt, time: timeStr },
            '[SessionSchedulerService] Created daily session'
          );
        }
      }
    }
  }

  // ── Sala Semanal: crear sesión del próximo domingo ─────────────────────────
  private static async scheduleWeekly(room: RoomConfig): Promise<void> {
    const [h, m] = room.weekly_time!.split(':').map(Number);

    // Calcular próxima ocurrencia del día de la semana en hora Argentina
    const arg = argNow();
    const daysUntil = ((room.weekly_day! - arg.getDay()) + 7) % 7 || 7;
    const nextOccurrence = argToUTC(h, m, daysUntil);

    const existing = await query(
      `SELECT id FROM game_sessions
       WHERE room_id = $1
         AND status IN ('CREATED','READY')
         AND scheduled_at BETWEEN $2 AND $3`,
      [
        room.id,
        new Date(nextOccurrence.getTime() - 60000),
        new Date(nextOccurrence.getTime() + 60000),
      ]
    );

    if (existing.rows.length === 0) {
      // Contar semanas de rollover acumuladas
      const rolloverRes = await query(
        `SELECT COUNT(*) as cnt FROM jackpot_audit
         WHERE room_id = $1 AND event_type = 'ROLLOVER'
           AND created_at > NOW() - INTERVAL '1 year'`,
        [room.id]
      );
      const rolloverWeeks = parseInt(rolloverRes.rows[0].cnt) || 0;

      await this.createSession(room, nextOccurrence, rolloverWeeks, room.accumulated_jackpot);
      logger.info(
        { roomId: room.id, nextOccurrence, rolloverWeeks },
        '[SessionSchedulerService] Created weekly session'
      );
    }
  }

  private static async createSession(
    room: RoomConfig,
    scheduledAt: Date,
    rolloverWeeks = 0,
    initialJackpot = 0
  ): Promise<number> {
    const res = await query(
      `INSERT INTO game_sessions
         (room_id, status, scheduled_at, game_mode, max_balls, rollover_weeks, jackpot_amount)
       VALUES ($1,'CREATED',$2,$3,$4,$5,$6) RETURNING id`,
      [room.id, scheduledAt, room.game_mode, room.max_balls, rolloverWeeks, initialJackpot]
    );
    const sessionId: number = res.rows[0].id;

    // Enqueue delayed game start job
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await gameStartQueue.add(
      'start_game',
      { sessionId, roomId: room.id },
      { delay, jobId: `game-start-${sessionId}` }
    );
    logger.info({ sessionId, roomId: room.id, delay }, '[SessionSchedulerService] Enqueued game start job');
    return sessionId;
  }

  // Recovery: enqueue start jobs for existing sessions that never got one
  public static async recoverPendingSessions(): Promise<void> {
    const res = await query(`
      SELECT gs.id, gs.room_id, gs.scheduled_at, gs.game_mode, gs.max_balls
      FROM game_sessions gs
      WHERE gs.status = 'CREATED'
        AND gs.scheduled_at > NOW()
    `);
    for (const row of res.rows) {
      const delay = Math.max(0, new Date(row.scheduled_at).getTime() - Date.now());
      await gameStartQueue.add(
        'start_game',
        { sessionId: row.id, roomId: row.room_id },
        { delay, jobId: `game-start-${row.id}` }
      );
      logger.info({ sessionId: row.id, delay }, '[SessionSchedulerService] Recovered pending session');
    }
  }

  public static startReminderCron(): void {
    logger.info('[SessionSchedulerService] Starting reminder cron (every 1 minute)');
    setInterval(() => {
      this.sendStartReminders().catch(e =>
        logger.error({ error: e.message }, '[SessionSchedulerService] Reminder run failed')
      );
    }, 60 * 1000);
  }

  private static async sendStartReminders(): Promise<void> {
    const sessionsRes = await query(`
      SELECT gs.id, gs.scheduled_at, r.name as room_name
      FROM game_sessions gs
      JOIN rooms r ON r.id = gs.room_id
      WHERE gs.status IN ('CREATED', 'READY')
        AND gs.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '6 minutes'
        AND gs.reminder_sent = FALSE
    `);

    for (const session of sessionsRes.rows) {
      try {
        // Marcar como enviado primero (idempotencia)
        await query(`UPDATE game_sessions SET reminder_sent = TRUE WHERE id = $1`, [session.id]);

        // Obtener todos los usuarios con cartones activos en esta sesión (usar whatsapp_jid real)
        const usersRes = await query(`
          SELECT
            COALESCE(u.whatsapp_jid, u.phone_number || '@c.us') as chat_id,
            COUNT(c.id) as card_count
          FROM cards c
          JOIN users u ON u.id = c.user_id
          WHERE c.game_session_id = $1 AND c.status = 'active'
          GROUP BY u.phone_number, u.whatsapp_jid
        `, [session.id]);

        for (const user of usersRes.rows) {
          const chatId = user.chat_id;
          const text = Templates.SESSION_REMINDER({
            roomName: session.room_name,
            scheduledAt: session.scheduled_at ? new Date(session.scheduled_at) : null,
            cardCount: parseInt(user.card_count)
          });
          await notifyHighQueue.add('send_notification', { to: chatId, text });
        }

        logger.info({ sessionId: session.id, roomName: session.room_name }, '[SessionSchedulerService] Sent 5-min reminders');
      } catch (e: any) {
        logger.error({ sessionId: session.id, error: e.message }, '[SessionSchedulerService] Error sending reminders');
      }
    }
  }
}
