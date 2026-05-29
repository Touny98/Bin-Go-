import { PoolClient } from 'pg';
import { getClient, query } from '../../db';
import { TrucoMatchStatus, TrucoStateMachine } from '../../engine/truco/TrucoStateMachine';
import { TrucoEngine } from '../../engine/truco/TrucoEngine';
import { logger } from '../../utils/logger';
import {
  TrucoHandRow,
  TrucoMatchRow,
} from './types';

/**
 * Servicio de persistencia y locks pesimistas del match de Truco.
 * Réplica del patrón GameSessionService.lockWinner (src/domain/GameSessionService.ts:10-66).
 */
export class TrucoMatchService {
  /**
   * Crea un match nuevo en estado MATCH_FOUND con un deck_seed determinista.
   * Se invoca desde el TrucoMatchmakingService dentro de su transacción.
   */
  static async createMatch(
    client: PoolClient,
    opts: {
      playerAPhone: string;
      playerBPhone: string;
      betAmount: number;
      feePct: number;
      targetScore?: number;
    }
  ): Promise<TrucoMatchRow> {
    const seed = TrucoEngine.generateSeed();
    const targetScore = opts.targetScore ?? 15;
    const potAmount = opts.betAmount * 2;
    // Crear placeholder id para hash
    const tempId = TrucoEngine.generateSeed().substring(0, 36);
    const integrityHash = TrucoEngine.integrityHash(tempId, seed, [
      opts.playerAPhone,
      opts.playerBPhone,
    ]);

    const res = await client.query<TrucoMatchRow>(
      `INSERT INTO truco_matches (
         player_a_phone, player_b_phone, bet_amount, pot_amount, fee_pct,
         status, target_score, deck_seed, integrity_hash, mano_phone, current_turn_phone
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $1, $1)
       RETURNING *`,
      [
        opts.playerAPhone,
        opts.playerBPhone,
        opts.betAmount,
        potAmount,
        opts.feePct,
        TrucoMatchStatus.MATCH_FOUND,
        targetScore,
        seed,
        integrityHash,
      ]
    );
    return this.normalizeRow(res.rows[0]);
  }

  /**
   * Lee un match por id sin lock.
   */
  static async getMatch(matchId: string): Promise<TrucoMatchRow | null> {
    const res = await query('SELECT * FROM truco_matches WHERE id = $1', [matchId]);
    if (res.rowCount === 0) return null;
    return this.normalizeRow(res.rows[0]);
  }

  /**
   * Lee el match activo (no terminal) de un jugador, si existe.
   */
  static async getActiveMatchForPlayer(phone: string): Promise<TrucoMatchRow | null> {
    const terminal = [
      TrucoMatchStatus.PAYOUT_DONE,
      TrucoMatchStatus.CANCELLED,
    ];
    const res = await query(
      `SELECT * FROM truco_matches
       WHERE (player_a_phone = $1 OR player_b_phone = $1)
         AND status NOT IN (${terminal.map((_, i) => `$${i + 2}`).join(',')})
       ORDER BY created_at DESC LIMIT 1`,
      [phone, ...terminal]
    );
    if (res.rowCount === 0) return null;
    return this.normalizeRow(res.rows[0]);
  }

  /**
   * Ejecuta una operación dentro de un lock pesimista (FOR UPDATE) sobre el match.
   * fn recibe la fila normalizada y un cliente abierto. Debe lanzar para revertir.
   *
   * Si nextStatus se provee, valida la transición legal antes de ejecutar fn.
   * Si la fn no actualiza el status manualmente, lo hace este wrapper.
   */
  static async withMatchLock<T>(
    matchId: string,
    fn: (match: TrucoMatchRow, client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const res = await client.query<TrucoMatchRow>(
        'SELECT * FROM truco_matches WHERE id = $1 FOR UPDATE',
        [matchId]
      );
      if (res.rowCount === 0) {
        throw new Error(`Match ${matchId} no existe`);
      }
      const match = this.normalizeRow(res.rows[0]);
      const result = await fn(match, client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza campos del match validando la transición de status si cambia.
   * Incrementa version (optimistic).
   */
  static async updateMatch(
    client: PoolClient,
    currentMatch: TrucoMatchRow,
    patch: Partial<TrucoMatchRow>
  ): Promise<TrucoMatchRow> {
    if (patch.status && patch.status !== currentMatch.status) {
      TrucoStateMachine.validateTransition(currentMatch.status, patch.status);
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed: (keyof TrucoMatchRow)[] = [
      'status',
      'score_a',
      'score_b',
      'current_hand_id',
      'mano_phone',
      'current_turn_phone',
      'winner_phone',
      'abandoned_by_phone',
      'fee_amount',
      'started_at',
      'finished_at',
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(patch[key]);
      }
    }
    if (fields.length === 0) return currentMatch;
    fields.push(`version = version + 1`);
    values.push(currentMatch.id);
    values.push(currentMatch.version);
    const res = await client.query<TrucoMatchRow>(
      `UPDATE truco_matches SET ${fields.join(', ')}
       WHERE id = $${idx++} AND version = $${idx}
       RETURNING *`,
      values
    );
    if (res.rowCount === 0) {
      throw new Error(
        `Optimistic lock failed actualizando match ${currentMatch.id} (version ${currentMatch.version})`
      );
    }
    return this.normalizeRow(res.rows[0]);
  }

  // ───── Manos ──────────────────────────────────────────────────────────

  /**
   * Crea una nueva mano dentro del match (dentro de un lock activo).
   */
  static async createHand(
    client: PoolClient,
    opts: {
      matchId: string;
      handNumber: number;
      manoPhone: string;
      cardsA: any[];
      cardsB: any[];
    }
  ): Promise<TrucoHandRow> {
    const res = await client.query<TrucoHandRow>(
      `INSERT INTO truco_hands (match_id, hand_number, mano_phone, cards_a, cards_b, truco_state)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        opts.matchId,
        opts.handNumber,
        opts.manoPhone,
        JSON.stringify(opts.cardsA),
        JSON.stringify(opts.cardsB),
        JSON.stringify({ level: 1, lastCaller: null, accepted: null }),
      ]
    );
    return this.normalizeHandRow(res.rows[0]);
  }

  static async getHand(client: PoolClient, handId: string): Promise<TrucoHandRow | null> {
    const res = await client.query('SELECT * FROM truco_hands WHERE id = $1 FOR UPDATE', [handId]);
    if (res.rowCount === 0) return null;
    return this.normalizeHandRow(res.rows[0]);
  }

  static async updateHand(
    client: PoolClient,
    handId: string,
    patch: Partial<TrucoHandRow>
  ): Promise<TrucoHandRow> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed: (keyof TrucoHandRow)[] = [
      'cards_a',
      'cards_b',
      'baza_winners',
      'envido_state',
      'truco_level',
      'truco_state',
      'hand_winner_phone',
      'points_truco',
      'points_envido',
      'finished_at',
    ];
    const jsonbCols = new Set([
      'cards_a',
      'cards_b',
      'baza_winners',
      'envido_state',
      'truco_state',
    ]);
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(jsonbCols.has(key) ? JSON.stringify(patch[key]) : patch[key]);
      }
    }
    if (fields.length === 0) {
      const hand = await this.getHand(client, handId);
      if (!hand) throw new Error(`Hand ${handId} no existe`);
      return hand;
    }
    values.push(handId);
    const res = await client.query<TrucoHandRow>(
      `UPDATE truco_hands SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return this.normalizeHandRow(res.rows[0]);
  }

  // ───── Normalización ─────────────────────────────────────────────────

  private static normalizeRow(raw: any): TrucoMatchRow {
    return {
      ...raw,
      bet_amount: parseFloat(raw.bet_amount),
      pot_amount: parseFloat(raw.pot_amount),
      fee_pct: parseFloat(raw.fee_pct),
      fee_amount: raw.fee_amount === null ? null : parseFloat(raw.fee_amount),
    };
  }

  private static normalizeHandRow(raw: any): TrucoHandRow {
    return {
      ...raw,
      cards_a: typeof raw.cards_a === 'string' ? JSON.parse(raw.cards_a) : raw.cards_a,
      cards_b: typeof raw.cards_b === 'string' ? JSON.parse(raw.cards_b) : raw.cards_b,
      baza_winners:
        typeof raw.baza_winners === 'string'
          ? JSON.parse(raw.baza_winners)
          : raw.baza_winners,
      envido_state:
        typeof raw.envido_state === 'string'
          ? JSON.parse(raw.envido_state)
          : raw.envido_state,
      truco_state:
        typeof raw.truco_state === 'string'
          ? JSON.parse(raw.truco_state)
          : raw.truco_state,
    };
  }

  // ───── Historial ──────────────────────────────────────────────────────

  static async getRecentMatchesForPlayer(
    phone: string,
    limit = 10
  ): Promise<TrucoMatchRow[]> {
    const res = await query(
      `SELECT * FROM truco_matches
       WHERE (player_a_phone = $1 OR player_b_phone = $1)
         AND status = $2
       ORDER BY finished_at DESC NULLS LAST LIMIT $3`,
      [phone, TrucoMatchStatus.PAYOUT_DONE, limit]
    );
    return res.rows.map((r: any) => this.normalizeRow(r));
  }

  static async upsertLeaderboard(
    client: PoolClient,
    opts: {
      phone: string;
      won: boolean;
      totalWonDelta: number;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO truco_leaderboards (user_phone, matches_played, matches_won, total_won, current_streak, best_streak, last_match_at)
       VALUES ($1, 1, $2, $3, $4, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_phone) DO UPDATE SET
         matches_played = truco_leaderboards.matches_played + 1,
         matches_won = truco_leaderboards.matches_won + $2,
         total_won = truco_leaderboards.total_won + $3,
         current_streak = CASE WHEN $5 THEN truco_leaderboards.current_streak + 1 ELSE 0 END,
         best_streak = GREATEST(truco_leaderboards.best_streak, CASE WHEN $5 THEN truco_leaderboards.current_streak + 1 ELSE truco_leaderboards.best_streak END),
         last_match_at = CURRENT_TIMESTAMP`,
      [opts.phone, opts.won ? 1 : 0, opts.totalWonDelta, opts.won ? 1 : 0, opts.won]
    );
    logger.debug({ phone: opts.phone, won: opts.won }, '[TrucoMatchService] leaderboard updated');
  }
}
