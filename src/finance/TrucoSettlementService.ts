import { getClient } from '../db';
import { LedgerService } from './LedgerService';
import { WalletEngine } from './WalletEngine';
import { logger } from '../utils/logger';
import { TrucoMatchService } from '../domain/truco/TrucoMatchService';
import { TrucoMatchStatus } from '../engine/truco/TrucoStateMachine';
import { TrucoMatchRow } from '../domain/truco/types';

/**
 * Settlement financiero del Truco. Todas las operaciones son idempotentes
 * cuando se ejecutan por el mismo (matchId, categoría, fase) — el ledger
 * registra el reference_id y el match.status garantiza que no se repite.
 *
 * Cuenta "plataforma" donde caen los fees: TRUCO_PLATFORM_WALLET (env) o
 * por defecto la string `platform_truco`.
 */
export class TrucoSettlementService {
  private static platformWallet(): string {
    return process.env.TRUCO_PLATFORM_WALLET || 'platform_truco';
  }

  /**
   * Hold de saldo al inicio del match. Debita la apuesta a ambos jugadores.
   * Si alguno no tiene saldo: refund al otro (si ya se le había debitado) y
   * cancela el match.
   *
   * Pre: match.status === MATCH_FOUND.
   * Post: match.status === BET_LOCKED (o CANCELLED).
   */
  static async holdBets(matchId: string): Promise<void> {
    // Pre-check fuera del lock (rápido). El check real se hace dentro del
    // lock para evitar race con otra invocación concurrente (orphan worker
    // vs lobby handler).
    const initial = await TrucoMatchService.getMatch(matchId);
    if (!initial) throw new Error(`Match ${matchId} no existe`);
    if (initial.status !== TrucoMatchStatus.MATCH_FOUND) {
      logger.info(
        { matchId, status: initial.status },
        '[TrucoSettlement] holdBets skip — match no está en MATCH_FOUND'
      );
      return;
    }

    // Reservar la transición MATCH_FOUND → BET_LOCKED de forma atómica.
    // Si otro proceso ya la hizo, salimos sin debitar nada.
    const reserved = await TrucoMatchService.withMatchLock(
      matchId,
      async (m, client) => {
        if (m.status !== TrucoMatchStatus.MATCH_FOUND) return false;
        await TrucoMatchService.updateMatch(client, m, {
          status: TrucoMatchStatus.BET_LOCKED,
          started_at: new Date(),
        });
        return true;
      }
    );
    if (!reserved) {
      logger.info(
        { matchId },
        '[TrucoSettlement] holdBets no-op — match ya pasó MATCH_FOUND (race)'
      );
      return;
    }

    // Ya tomamos la transición → debitar. Las debits son idempotentes por
    // reference_id, así que un retry no duplica saldos.
    let debitedA = false;
    try {
      await WalletEngine.debit(
        initial.player_a_phone,
        initial.bet_amount,
        'TRUCO_BET_HOLD',
        initial.id
      );
      debitedA = true;
      await WalletEngine.debit(
        initial.player_b_phone,
        initial.bet_amount,
        'TRUCO_BET_HOLD',
        initial.id
      );
      logger.info({ matchId }, '[TrucoSettlement] bets held, BET_LOCKED');
    } catch (e: any) {
      logger.warn(
        { matchId, err: e.message },
        '[TrucoSettlement] hold failed — cancelando match'
      );
      if (debitedA) {
        await WalletEngine.credit(
          initial.player_a_phone,
          initial.bet_amount,
          'TRUCO_REFUND',
          initial.id
        );
      }
      // Rollback de la transición: BET_LOCKED → CANCELLED es válido.
      await TrucoMatchService.withMatchLock(matchId, async (m, client) => {
        if (m.status === TrucoMatchStatus.BET_LOCKED) {
          await TrucoMatchService.updateMatch(client, m, {
            status: TrucoMatchStatus.CANCELLED,
            finished_at: new Date(),
          });
        }
      });
      throw e;
    }
  }

  /**
   * Payout final del match al ganador.
   * - Calcula fee = pot * fee_pct (snapshot del match).
   * - Acredita (pot - fee) al ganador con TRUCO_WIN.
   * - Registra entrada CREDIT en la wallet plataforma con TRUCO_FEE.
   * - Actualiza leaderboard.
   *
   * Pre: match.status === GAME_OVER o ABANDONED, winner_phone seteado.
   * Post: match.status === PAYOUT_DONE.
   */
  static async payout(matchId: string): Promise<void> {
    const match = await TrucoMatchService.getMatch(matchId);
    if (!match) throw new Error(`Match ${matchId} no existe`);
    if (match.status === TrucoMatchStatus.PAYOUT_DONE) {
      logger.info({ matchId }, '[TrucoSettlement] payout ya hecho, no-op');
      return;
    }
    if (
      match.status !== TrucoMatchStatus.GAME_OVER &&
      match.status !== TrucoMatchStatus.ABANDONED
    ) {
      throw new Error(
        `payout requiere GAME_OVER/ABANDONED, match está en ${match.status}`
      );
    }
    if (!match.winner_phone) {
      throw new Error(`Match ${matchId} no tiene winner_phone`);
    }

    const fee = Math.round(match.pot_amount * match.fee_pct * 100) / 100;
    const prize = Math.round((match.pot_amount - fee) * 100) / 100;

    await WalletEngine.credit(
      match.winner_phone,
      prize,
      'TRUCO_WIN',
      match.id
    );
    // Fee a cuenta plataforma (sin pasar por wallets de usuarios)
    await this.recordPlatformFee(match);

    await TrucoMatchService.withMatchLock(matchId, async (m, client) => {
      const updated = await TrucoMatchService.updateMatch(client, m, {
        fee_amount: fee,
        status: TrucoMatchStatus.PAYOUT_DONE,
        finished_at: m.finished_at ?? new Date(),
      });
      // Leaderboards de ambos
      const loserPhone =
        updated.winner_phone === updated.player_a_phone
          ? updated.player_b_phone
          : updated.player_a_phone;
      await TrucoMatchService.upsertLeaderboard(client, {
        phone: updated.winner_phone!,
        won: true,
        totalWonDelta: prize,
      });
      await TrucoMatchService.upsertLeaderboard(client, {
        phone: loserPhone,
        won: false,
        totalWonDelta: 0,
      });
    });

    logger.info(
      { matchId, winner: match.winner_phone, prize, fee },
      '[TrucoSettlement] payout completo'
    );
  }

  /**
   * Refund total a ambos jugadores. Usar cuando el match no se inició
   * correctamente o hay error sistémico.
   */
  static async refundAll(matchId: string): Promise<void> {
    const match = await TrucoMatchService.getMatch(matchId);
    if (!match) throw new Error(`Match ${matchId} no existe`);

    if (match.status === TrucoMatchStatus.PAYOUT_DONE) {
      logger.warn({ matchId }, '[TrucoSettlement] refundAll sobre match ya pagado, no-op');
      return;
    }

    await WalletEngine.credit(
      match.player_a_phone,
      match.bet_amount,
      'TRUCO_REFUND',
      match.id
    );
    await WalletEngine.credit(
      match.player_b_phone,
      match.bet_amount,
      'TRUCO_REFUND',
      match.id
    );

    await TrucoMatchService.withMatchLock(matchId, async (m, client) => {
      await TrucoMatchService.updateMatch(client, m, {
        status: TrucoMatchStatus.CANCELLED,
        finished_at: new Date(),
      });
    });
    logger.info({ matchId }, '[TrucoSettlement] refundAll completo');
  }

  // ─────────────────────────────────────────────────────────────────────

  private static async recordPlatformFee(match: TrucoMatchRow): Promise<void> {
    if (match.fee_pct <= 0) return;
    const fee = Math.round(match.pot_amount * match.fee_pct * 100) / 100;
    if (fee <= 0) return;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await LedgerService.recordEntry(
        this.platformWallet(),
        'CREDIT',
        'TRUCO_FEE',
        fee,
        match.id,
        { match_id: match.id, pot: match.pot_amount, fee_pct: match.fee_pct }
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
