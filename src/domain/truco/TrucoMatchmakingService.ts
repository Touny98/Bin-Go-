import { getClient, query } from '../../db';
import { logger } from '../../utils/logger';
import { TrucoMatchRow } from './types';
import { TrucoMatchService } from './TrucoMatchService';

/**
 * Cola única de Truco. El usuario elige un monto y queda en cola hasta que
 * aparezca otro jugador con el mismo monto exacto. El emparejamiento es
 * atómico (FOR UPDATE SKIP LOCKED) para soportar múltiples instancias.
 */
export class TrucoMatchmakingService {
  /**
   * Mete o actualiza al usuario en la cola con el monto deseado.
   * Si ya estaba en cola con otro monto, se reemplaza.
   */
  static async enqueue(userPhone: string, betAmount: number): Promise<void> {
    await query(
      `INSERT INTO truco_queue (user_phone, bet_amount)
       VALUES ($1, $2)
       ON CONFLICT (user_phone) DO UPDATE SET
         bet_amount = EXCLUDED.bet_amount,
         joined_at = CURRENT_TIMESTAMP`,
      [userPhone, betAmount]
    );
    logger.info({ userPhone, betAmount }, '[Matchmaking] enqueued');
  }

  static async dequeue(userPhone: string): Promise<void> {
    await query('DELETE FROM truco_queue WHERE user_phone = $1', [userPhone]);
    logger.info({ userPhone }, '[Matchmaking] dequeued');
  }

  static async isQueued(userPhone: string): Promise<boolean> {
    const res = await query('SELECT 1 FROM truco_queue WHERE user_phone = $1', [userPhone]);
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Intenta emparejar a un usuario explícito (auto-trigger al entrar).
   * Si encuentra rival con el mismo monto, crea el match en MATCH_FOUND
   * y devuelve la fila. Si no, devuelve null.
   */
  static async tryMatchForPlayer(
    userPhone: string,
    feePct: number
  ): Promise<TrucoMatchRow | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Bloquear la fila del propio usuario para no doble-matchear
      const meRes = await client.query<{ bet_amount: string }>(
        `SELECT bet_amount FROM truco_queue
         WHERE user_phone = $1 FOR UPDATE`,
        [userPhone]
      );
      if (meRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const myBet = parseFloat(meRes.rows[0].bet_amount);

      // Buscar rival con el mismo monto, distinto user
      const rivalRes = await client.query<{ user_phone: string }>(
        `SELECT user_phone FROM truco_queue
         WHERE bet_amount = $1 AND user_phone <> $2
         ORDER BY joined_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [myBet, userPhone]
      );
      if (rivalRes.rowCount === 0) {
        await client.query('COMMIT');
        return null;
      }
      const rivalPhone = rivalRes.rows[0].user_phone;

      // Crear match (player_a = más antiguo en cola, player_b = más reciente)
      // En este caso rivalPhone es el más antiguo (ORDER BY joined_at ASC)
      const match = await TrucoMatchService.createMatch(client, {
        playerAPhone: rivalPhone,
        playerBPhone: userPhone,
        betAmount: myBet,
        feePct,
      });

      // Remover ambos de la cola
      await client.query(
        'DELETE FROM truco_queue WHERE user_phone IN ($1, $2)',
        [userPhone, rivalPhone]
      );
      await client.query('COMMIT');
      logger.info(
        { matchId: match.id, playerA: rivalPhone, playerB: userPhone, bet: myBet },
        '[Matchmaking] match created'
      );
      return match;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Tick periódico que recorre la cola buscando pares (worker mode).
   * Devuelve la cantidad de matches creados en este tick.
   */
  static async tickMatch(feePct: number): Promise<number> {
    const client = await getClient();
    let createdCount = 0;
    try {
      await client.query('BEGIN');
      // Tomar hasta N candidatos disponibles
      const candidatesRes = await client.query<{ user_phone: string; bet_amount: string }>(
        `SELECT user_phone, bet_amount FROM truco_queue
         ORDER BY joined_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 200`
      );

      // Agrupar por bet_amount
      const buckets = new Map<number, string[]>();
      for (const row of candidatesRes.rows) {
        const bet = parseFloat(row.bet_amount);
        if (!buckets.has(bet)) buckets.set(bet, []);
        buckets.get(bet)!.push(row.user_phone);
      }

      for (const [bet, phones] of buckets.entries()) {
        // Emparejar de a 2 (los excedentes quedan en cola)
        for (let i = 0; i + 1 < phones.length; i += 2) {
          const a = phones[i];
          const b = phones[i + 1];
          await TrucoMatchService.createMatch(client, {
            playerAPhone: a,
            playerBPhone: b,
            betAmount: bet,
            feePct,
          });
          await client.query(
            'DELETE FROM truco_queue WHERE user_phone IN ($1, $2)',
            [a, b]
          );
          createdCount++;
          logger.info({ a, b, bet }, '[Matchmaking] tick match created');
        }
      }
      await client.query('COMMIT');
      return createdCount;
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error({ err: e }, '[Matchmaking] tick failed');
      throw e;
    } finally {
      client.release();
    }
  }
}
