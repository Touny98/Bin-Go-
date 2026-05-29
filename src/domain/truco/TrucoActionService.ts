import { PoolClient } from 'pg';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { TrucoActionRow, TrucoActionType } from './types';

/**
 * Servicio append-only de acciones del Truco.
 * Toda mutación significativa del estado pasa por aquí, dejando una pista
 * inmutable para replay y auditoría anti-cheat.
 *
 * El UNIQUE(match_id, idempotency_key) impide procesar dos veces la misma
 * acción cuando el usuario hace doble-click o reenvía el mensaje.
 */
export class TrucoActionService {
  /**
   * Inserta una acción. Si la idempotency_key ya existe para el match, devuelve
   * la acción previa (no-op).
   *
   * Requiere ser invocada DENTRO del lock de match (withMatchLock).
   */
  static async append(
    client: PoolClient,
    opts: {
      matchId: string;
      handId?: string | null;
      userPhone: string;
      actionType: TrucoActionType;
      payload?: Record<string, any>;
      idempotencyKey?: string | null;
    }
  ): Promise<{ inserted: boolean; action: TrucoActionRow }> {
    // Calcular siguiente sequence_number para el match
    const seqRes = await client.query<{ next_seq: number }>(
      'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM truco_actions WHERE match_id = $1',
      [opts.matchId]
    );
    const nextSeq = seqRes.rows[0].next_seq;

    const payload = opts.payload ?? {};
    const key = opts.idempotencyKey ?? null;
    try {
      const res = await client.query<TrucoActionRow>(
        `INSERT INTO truco_actions (
           match_id, hand_id, user_phone, action_type, payload, sequence_number, idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          opts.matchId,
          opts.handId ?? null,
          opts.userPhone,
          opts.actionType,
          JSON.stringify(payload),
          nextSeq,
          key,
        ]
      );
      logger.debug(
        { matchId: opts.matchId, seq: nextSeq, action: opts.actionType, user: opts.userPhone },
        '[TrucoActionService] action appended'
      );
      return { inserted: true, action: this.normalize(res.rows[0]) };
    } catch (e: any) {
      // 23505 = unique_violation (idempotency_key duplicada)
      if (e?.code === '23505' && key) {
        const dup = await client.query<TrucoActionRow>(
          'SELECT * FROM truco_actions WHERE match_id = $1 AND idempotency_key = $2',
          [opts.matchId, key]
        );
        if (dup.rowCount && dup.rowCount > 0) {
          logger.info(
            { matchId: opts.matchId, key, action: opts.actionType },
            '[TrucoActionService] idempotent replay ignored'
          );
          return { inserted: false, action: this.normalize(dup.rows[0]) };
        }
      }
      throw e;
    }
  }

  static async listForMatch(matchId: string): Promise<TrucoActionRow[]> {
    const res = await query(
      'SELECT * FROM truco_actions WHERE match_id = $1 ORDER BY sequence_number ASC',
      [matchId]
    );
    return res.rows.map((r: any) => this.normalize(r));
  }

  private static normalize(raw: any): TrucoActionRow {
    return {
      ...raw,
      payload: typeof raw.payload === 'string' ? JSON.parse(raw.payload) : raw.payload,
    };
  }
}
