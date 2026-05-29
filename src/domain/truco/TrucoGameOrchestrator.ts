import { PoolClient } from 'pg';
import { TrucoEngine } from '../../engine/truco/TrucoEngine';
import {
  TrucoMatchStatus,
  TrucoStateMachine,
} from '../../engine/truco/TrucoStateMachine';
import {
  envidoPoints,
  envidoScore,
  resolveEnvido,
} from '../../engine/truco/EnvidoCalculator';
import {
  gameOver,
  resolveBaza,
  resolveHand,
  trucoPoints,
} from '../../engine/truco/HandResolver';
import {
  BazaWinner,
  Card,
  EnvidoLevel,
  PlayerSeat,
  TrucoLevel,
} from '../../engine/truco/types';
import { logger } from '../../utils/logger';
import { TrucoActionService } from './TrucoActionService';
import { TrucoMatchService } from './TrucoMatchService';
import {
  BazaPlayed,
  EnvidoState,
  TrucoActionType,
  TrucoHandRow,
  TrucoMatchRow,
  TrucoState,
  opponentPhone,
  opponentSeat,
  phoneOfSeat,
  seatOf,
} from './types';

/**
 * Anuncio narrativo que precede al cambio de estado.
 * Se adjunta a un TurnDescriptor cuando hubo una resolución (envido, truco,
 * mazo) que merece un mensaje a ambos jugadores antes de mostrar el siguiente
 * estado del juego.
 */
export type Announcement =
  | {
      type: 'ENVIDO_RESOLVED';
      accepted: boolean;
      winnerPhone: string;
      loserPhone: string;
      points: number;
      scoreWinner?: number;
      scoreLoser?: number;
      level: EnvidoLevel;
    }
  | {
      type: 'TRUCO_ACCEPTED';
      callerPhone: string;
      responderPhone: string;
      level: TrucoLevel;
    }
  | {
      type: 'TRUCO_DECLINED';
      callerPhone: string;
      responderPhone: string;
      level: TrucoLevel;
      pointsAwarded: number;
    }
  | {
      type: 'GO_TO_MAZO';
      losingPhone: string;
      winnerPhone: string;
      pointsAwarded: number;
    };

export type TurnDescriptor = (
  | {
      kind: 'WAITING_FOR_CARD';
      match: TrucoMatchRow;
      hand: TrucoHandRow;
      currentTurnPhone: string;
      bazaIndex: 0 | 1 | 2;
      /**
       * Presente sólo cuando ESTE turno se origina por el cierre de una baza
       * (no al repartir, ni al responder un canto). Permite al notifier enviar
       * el resumen de bazas ganadas una sola vez, al cerrarse cada baza.
       */
      bazaResolved?: { baza: number; winner: BazaWinner };
    }
  | {
      kind: 'WAITING_TRUCO_RESPONSE';
      match: TrucoMatchRow;
      hand: TrucoHandRow;
      offeredToPhone: string;
      level: TrucoLevel;
    }
  | {
      kind: 'WAITING_ENVIDO_RESPONSE';
      match: TrucoMatchRow;
      hand: TrucoHandRow;
      offeredToPhone: string;
      envidoLevel: EnvidoLevel;
    }
  | {
      kind: 'HAND_RESOLVED';
      match: TrucoMatchRow;
      hand: TrucoHandRow;
      handWinnerPhone: string;
      pointsAwarded: number;
      pointsEnvido: number;
      scoreA: number;
      scoreB: number;
    }
  | {
      kind: 'GAME_OVER';
      match: TrucoMatchRow;
      winnerPhone: string;
      hand?: TrucoHandRow;
    }
) & { announcement?: Announcement };

export class TrucoCommandError extends Error {
  constructor(message: string, public readonly code: string = 'INVALID_COMMAND') {
    super(message);
  }
}

/**
 * Orquesta el ciclo de vida del juego: reparto, jugadas, cantos, resoluciones.
 * Cada operación es atómica bajo lock pesimista del match y deja registro
 * append-only en truco_actions con idempotency_key.
 */
export class TrucoGameOrchestrator {
  // ─────────────────────────────────────────────────────────────────────
  // DEAL — repartir una nueva mano

  static async dealNewHand(matchId: string): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(matchId, async (match, client) => {
      const allowed = [
        TrucoMatchStatus.BET_LOCKED,
        TrucoMatchStatus.HAND_RESOLVED,
      ];
      if (!allowed.includes(match.status)) {
        throw new TrucoCommandError(
          `dealNewHand requiere BET_LOCKED o HAND_RESOLVED, no ${match.status}`
        );
      }

      // Determinar número de mano y quién es mano
      const prevHandsRes = await client.query<{ hand_number: number }>(
        'SELECT COALESCE(MAX(hand_number), 0) AS hand_number FROM truco_hands WHERE match_id = $1',
        [matchId]
      );
      const handNumber = prevHandsRes.rows[0].hand_number + 1;

      // Mano rota cada mano. La primera mano la repartió A (semilla en createMatch).
      const manoPhone =
        handNumber === 1
          ? match.player_a_phone
          : (await this.lastManoPhone(client, matchId, match)) === match.player_a_phone
          ? match.player_b_phone
          : match.player_a_phone;

      // Reparto determinista con seed derivado: deck_seed + handNumber
      const seedForHand = `${match.deck_seed}:${handNumber}`;
      const manoSeat: PlayerSeat = manoPhone === match.player_a_phone ? 'A' : 'B';
      const { handA, handB } = TrucoEngine.deal(seedForHand, manoSeat);

      // Transición BET_LOCKED → DEAL → HAND_PLAY (en cascada en una misma tx)
      let m = match;
      if (m.status === TrucoMatchStatus.BET_LOCKED) {
        m = await TrucoMatchService.updateMatch(client, m, {
          status: TrucoMatchStatus.DEAL,
        });
      } else if (m.status === TrucoMatchStatus.HAND_RESOLVED) {
        m = await TrucoMatchService.updateMatch(client, m, {
          status: TrucoMatchStatus.DEAL,
        });
      }

      const hand = await TrucoMatchService.createHand(client, {
        matchId,
        handNumber,
        manoPhone,
        cardsA: handA,
        cardsB: handB,
      });

      m = await TrucoMatchService.updateMatch(client, m, {
        status: TrucoMatchStatus.HAND_PLAY,
        current_hand_id: hand.id,
        mano_phone: manoPhone,
        current_turn_phone: manoPhone,
      });

      await TrucoActionService.append(client, {
        matchId,
        handId: hand.id,
        userPhone: 'system',
        actionType: 'PLAY_CARD',
        payload: { event: 'DEAL', handNumber, manoPhone },
        idempotencyKey: `${matchId}:deal:${handNumber}`,
      });

      return this.describeWaitingForCard(m, hand);
    });
  }

  private static async lastManoPhone(
    client: PoolClient,
    matchId: string,
    match: TrucoMatchRow
  ): Promise<string> {
    const res = await client.query<{ mano_phone: string }>(
      'SELECT mano_phone FROM truco_hands WHERE match_id = $1 ORDER BY hand_number DESC LIMIT 1',
      [matchId]
    );
    if (res.rowCount === 0) return match.player_a_phone;
    return res.rows[0].mano_phone;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PLAY_CARD

  static async playCard(opts: {
    matchId: string;
    userPhone: string;
    card: Card;
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      if (match.status !== TrucoMatchStatus.HAND_PLAY) {
        throw new TrucoCommandError(`Match no está en HAND_PLAY (${match.status})`);
      }
      const hand = await this.getCurrentHand(client, match);
      const seat = seatOf(match, opts.userPhone);

      // Validar turno
      if (match.current_turn_phone !== opts.userPhone) {
        throw new TrucoCommandError('No es tu turno', 'NOT_YOUR_TURN');
      }

      // Validar que hay un canto pendiente que bloquea (envido/truco offered)
      if (hand.truco_state && hand.truco_state.accepted === null && hand.truco_state.lastCaller !== null) {
        throw new TrucoCommandError('Hay un canto de truco pendiente de respuesta', 'TRUCO_PENDING');
      }
      if (hand.envido_state && hand.envido_state.accepted === null) {
        throw new TrucoCommandError('Hay un canto de envido pendiente de respuesta', 'ENVIDO_PENDING');
      }

      // Validar carta en mano
      const myHand = seat === 'A' ? hand.cards_a : hand.cards_b;
      if (!TrucoEngine.handContains(myHand, opts.card)) {
        throw new TrucoCommandError('Esa carta no está en tu mano', 'CARD_NOT_OWNED');
      }

      // Aplicar jugada
      const newMyHand = TrucoEngine.removeCard(myHand, opts.card);
      const bazaWinners = [...hand.baza_winners];
      const bazaIdx = bazaWinners.length === 0 || bazaWinners[bazaWinners.length - 1].winner ? bazaWinners.length : bazaWinners.length - 1;

      // Caso A: la baza actual aún no se inició (no hay registro o el último ya resolvió) → empezamos nueva baza
      if (bazaIdx === bazaWinners.length) {
        // Es la primera carta de esta baza
        const entry: BazaPlayed = { baza: (bazaIdx + 1) as 1 | 2 | 3 };
        if (seat === 'A') entry.cardA = opts.card;
        else entry.cardB = opts.card;
        bazaWinners.push(entry);
      } else {
        // Es la segunda carta de la baza pendiente
        const entry = bazaWinners[bazaIdx];
        if (seat === 'A') entry.cardA = opts.card;
        else entry.cardB = opts.card;
        if (entry.cardA && entry.cardB) {
          entry.winner = resolveBaza(entry.cardA, entry.cardB);
        }
      }

      const handPatch: Partial<TrucoHandRow> = {
        baza_winners: bazaWinners,
      };
      if (seat === 'A') handPatch.cards_a = newMyHand;
      else handPatch.cards_b = newMyHand;

      // Determinar próximo turno o resolución
      const currentEntry = bazaWinners[bazaIdx];
      const bazaCompleted = !!currentEntry.cardA && !!currentEntry.cardB;

      let nextTurnPhone: string | null = null;
      let handResolved = false;

      if (bazaCompleted) {
        // Resolvió la baza. Ver si la mano terminó.
        const winners: BazaWinner[] = bazaWinners
          .filter((b) => !!b.winner)
          .map((b) => b.winner!) as BazaWinner[];
        const manoSeat: PlayerSeat = hand.mano_phone === match.player_a_phone ? 'A' : 'B';
        const handWinner = resolveHand(winners, manoSeat);
        if (handWinner) {
          handResolved = true;
          // Persistir ganador de mano + puntos según nivel de truco aceptado
          const trucoLevel = (hand.truco_state?.level ?? 1) as TrucoLevel;
          const trucoAccepted = hand.truco_state?.accepted !== false;
          const points = trucoPoints(trucoLevel, trucoAccepted);
          handPatch.hand_winner_phone = phoneOfSeat(match, handWinner);
          handPatch.points_truco = points;
          handPatch.finished_at = new Date();
        } else {
          // Siguiente baza: empieza el ganador de la baza anterior; si fue parda, empieza el mano
          const lastBaza = currentEntry.winner!;
          if (lastBaza === 'PARDA') {
            nextTurnPhone = hand.mano_phone;
          } else {
            nextTurnPhone = phoneOfSeat(match, lastBaza);
          }
        }
      } else {
        // Falta la otra mitad de la baza: turno al otro jugador
        nextTurnPhone = opponentPhone(match, opts.userPhone);
      }

      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, handPatch);
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: 'PLAY_CARD',
        payload: { card: opts.card, baza: currentEntry.baza },
        idempotencyKey: opts.idempotencyKey,
      });

      if (handResolved) {
        return this.finalizeHand(client, match, updatedHand);
      }
      const updatedMatch = await TrucoMatchService.updateMatch(client, match, {
        current_turn_phone: nextTurnPhone,
      });
      // Si esta jugada cerró una baza (y la mano sigue), señalizamos el cierre
      // para que el notifier mande el resumen de bazas ganadas a ambos.
      const bazaResolved =
        bazaCompleted && currentEntry.winner
          ? { baza: currentEntry.baza, winner: currentEntry.winner }
          : undefined;
      return this.describeWaitingForCard(updatedMatch, updatedHand, bazaResolved);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // TRUCO chain

  static async callTruco(opts: {
    matchId: string;
    userPhone: string;
    level: 2 | 3 | 4;
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      if (match.status !== TrucoMatchStatus.HAND_PLAY) {
        throw new TrucoCommandError(`No se puede cantar ahora (${match.status})`);
      }
      const hand = await this.getCurrentHand(client, match);
      const seat = seatOf(match, opts.userPhone);

      // No se puede cantar truco con un envido pendiente
      if (hand.envido_state && hand.envido_state.accepted === null) {
        throw new TrucoCommandError('Resolvé el envido primero', 'ENVIDO_PENDING');
      }

      const current: TrucoState = hand.truco_state ?? {
        level: 1,
        lastCaller: null,
        accepted: null,
      };

      // VALIDACIÓN DE FASE: un canto NUEVO (no una respuesta/escalación a una
      // oferta pendiente) sólo lo puede iniciar quien tiene la prioridad/turno.
      // Si ya jugaste tu carta, la prioridad pasó al rival → NO podés cantar.
      // Esto cierra la ventana de canto al bajar carta (bug de "truco tardío").
      const pendingOffer = current.lastCaller !== null && current.accepted === null;
      if (!pendingOffer && match.current_turn_phone !== opts.userPhone) {
        throw new TrucoCommandError(
          'Ya no podés cantar: tu acción de este turno terminó',
          'OUT_OF_PHASE'
        );
      }

      // El último cantor no puede re-cantar (sólo el otro puede responder o subir)
      if (current.lastCaller === seat) {
        throw new TrucoCommandError(
          'No podés re-cantar, le toca al rival decidir',
          'CANNOT_RE_CALL'
        );
      }

      // El nivel a cantar debe ser exactamente el siguiente al actual.
      // Si hay un canto pendiente (accepted=null && lastCaller≠null), el rival
      // puede subir: eso equivale a "quiero + subo" en la misma jugada.
      const expected = (current.level + 1) as TrucoLevel;
      if (opts.level !== expected) {
        throw new TrucoCommandError(
          `Sólo podés cantar nivel ${expected} (actual=${current.level})`
        );
      }

      const newTruco: TrucoState = {
        level: opts.level as TrucoLevel,
        lastCaller: seat,
        accepted: null,
      };
      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
        truco_state: newTruco,
      });
      const actionTypeByLevel: Record<2 | 3 | 4, TrucoActionType> = {
        2: 'CALL_TRUCO',
        3: 'CALL_RETRUCO',
        4: 'CALL_VALE4',
      };
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: actionTypeByLevel[opts.level],
        payload: { level: opts.level },
        idempotencyKey: opts.idempotencyKey,
      });

      // El turno pasa al rival para responder (sin tocar current_turn_phone:
      // mantenemos el turno de carta pero la respuesta se pide al rival)
      return {
        kind: 'WAITING_TRUCO_RESPONSE',
        match,
        hand: updatedHand,
        offeredToPhone: opponentPhone(match, opts.userPhone),
        level: opts.level as TrucoLevel,
      };
    });
  }

  static async respondTruco(opts: {
    matchId: string;
    userPhone: string;
    accept: boolean;
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      const hand = await this.getCurrentHand(client, match);
      const seat = seatOf(match, opts.userPhone);
      const truco = hand.truco_state;
      if (!truco || truco.accepted !== null || truco.lastCaller === null) {
        throw new TrucoCommandError('No hay canto de truco pendiente');
      }
      if (truco.lastCaller === seat) {
        throw new TrucoCommandError('No podés responder tu propio canto');
      }

      if (opts.accept) {
        const newTruco: TrucoState = { ...truco, accepted: true };
        const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
          truco_state: newTruco,
          truco_level: truco.level,
        });
        await TrucoActionService.append(client, {
          matchId: match.id,
          handId: hand.id,
          userPhone: opts.userPhone,
          actionType: 'ACCEPT_TRUCO',
          payload: { level: truco.level },
          idempotencyKey: opts.idempotencyKey,
        });
        const desc = this.describeWaitingForCard(match, updatedHand);
        desc.announcement = {
          type: 'TRUCO_ACCEPTED',
          callerPhone: phoneOfSeat(match, truco.lastCaller),
          responderPhone: opts.userPhone,
          level: truco.level,
        };
        return desc;
      }

      // No quiero → el cantor gana puntos del nivel inmediato inferior
      const points = trucoPoints(truco.level, false);
      const winnerPhone = phoneOfSeat(match, truco.lastCaller);
      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
        truco_state: { ...truco, accepted: false },
        hand_winner_phone: winnerPhone,
        points_truco: points,
        finished_at: new Date(),
      });
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: 'DECLINE_TRUCO',
        payload: { level: truco.level, pointsAwarded: points },
        idempotencyKey: opts.idempotencyKey,
      });
      const finalDesc = await this.finalizeHand(client, match, updatedHand);
      finalDesc.announcement = {
        type: 'TRUCO_DECLINED',
        callerPhone: winnerPhone,
        responderPhone: opts.userPhone,
        level: truco.level,
        pointsAwarded: points,
      };
      return finalDesc;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // ENVIDO chain (MVP simplificado: sólo primera mano antes de truco)

  static async callEnvido(opts: {
    matchId: string;
    userPhone: string;
    level: 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO';
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      if (match.status !== TrucoMatchStatus.HAND_PLAY) {
        throw new TrucoCommandError(`No se puede cantar envido ahora (${match.status})`);
      }
      const hand = await this.getCurrentHand(client, match);
      const seat = seatOf(match, opts.userPhone);
      const env = hand.envido_state;
      // ¿Escalación sobre un envido pendiente o canto inicial?
      const isEscalation = !!env && env.accepted === null;

      if (isEscalation) {
        // Sólo el rival del último cantor puede subir; el que cantó espera.
        if (env!.offeredBy === seat) {
          throw new TrucoCommandError('Estás esperando la respuesta del rival', 'ENVIDO_PENDING');
        }
        this.assertEnvidoRaiseAllowed(env!, opts.level);
      } else {
        if (env && env.accepted !== null) {
          throw new TrucoCommandError('El envido ya fue resuelto', 'ENVIDO_DONE');
        }
        // Canto inicial: sólo en la primera baza y antes de que ESTE jugador
        // haya tirado su carta. Así el pie puede cantar incluso después de que
        // el mano tiró la primera carta (mientras el pie todavía no jugó).
        const firstBaza = hand.baza_winners[0];
        const alreadyPlayed =
          !!firstBaza && (seat === 'A' ? !!firstBaza.cardA : !!firstBaza.cardB);
        const pastFirstBaza = hand.baza_winners.length > 1;
        if (pastFirstBaza || alreadyPlayed) {
          throw new TrucoCommandError(
            'El envido se canta antes de jugar tu primera carta',
            'ENVIDO_TOO_LATE'
          );
        }
      }

      // Puntos de la cadena (acumulan con cada escalación).
      const targetScore = match.target_score;
      const leaderScore = Math.max(match.score_a, match.score_b);
      const prevAccept = env?.acceptValue ?? 0;
      const prevCount = env?.envidoCount ?? 0;
      let acceptValue: number;
      let envidoCount = prevCount;
      switch (opts.level) {
        case 'ENVIDO':
          acceptValue = prevAccept + 2;
          envidoCount = prevCount + 1;
          break;
        case 'REAL_ENVIDO':
          acceptValue = prevAccept + 3;
          break;
        case 'FALTA_ENVIDO':
          acceptValue = Math.max(targetScore - leaderScore, 1);
          break;
      }
      // "No quiero" entrega lo que valía la apuesta ANTES de este canto
      // (1 si es el primer canto de la cadena).
      const declineValue = isEscalation ? Math.max(prevAccept, 1) : 1;

      const newEnv: EnvidoState = {
        level: opts.level,
        offeredBy: seat,
        accepted: null,
        points: 0,
        acceptValue,
        declineValue,
        envidoCount,
      };
      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
        envido_state: newEnv,
      });
      const actionTypeByLevel: Record<typeof opts.level, TrucoActionType> = {
        ENVIDO: 'CALL_ENVIDO',
        REAL_ENVIDO: 'CALL_REAL_ENVIDO',
        FALTA_ENVIDO: 'CALL_FALTA_ENVIDO',
      };
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: actionTypeByLevel[opts.level],
        payload: { level: opts.level, acceptValue, declineValue },
        idempotencyKey: opts.idempotencyKey,
      });
      return {
        kind: 'WAITING_ENVIDO_RESPONSE',
        match,
        hand: updatedHand,
        offeredToPhone: opponentPhone(match, opts.userPhone),
        envidoLevel: opts.level,
      };
    });
  }

  /**
   * Valida que un canto de envido sea una escalación legal sobre el canto
   * pendiente. Lanza TrucoCommandError si no se permite.
   *
   * Cadena permitida:
   *  - ENVIDO → ENVIDO (envido envido, sólo una vez), REAL_ENVIDO o FALTA_ENVIDO
   *  - REAL_ENVIDO → FALTA_ENVIDO
   *  - FALTA_ENVIDO → (tope, no se sube)
   */
  private static assertEnvidoRaiseAllowed(
    env: EnvidoState,
    next: 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO'
  ): void {
    const current = env.level;
    const count = env.envidoCount ?? 0;
    if (current === 'FALTA_ENVIDO') {
      throw new TrucoCommandError('La falta envido no se puede subir', 'ENVIDO_MAX');
    }
    if (next === 'FALTA_ENVIDO') return; // siempre se puede ir a la falta
    if (next === 'REAL_ENVIDO') {
      if (current === 'REAL_ENVIDO') {
        throw new TrucoCommandError('Ya se cantó real envido', 'ENVIDO_INVALID_RAISE');
      }
      return; // ENVIDO / ENVIDO ENVIDO → REAL_ENVIDO
    }
    // next === 'ENVIDO' → sólo "envido envido" (segundo envido) sobre un ENVIDO
    if (current !== 'ENVIDO' || count >= 2) {
      throw new TrucoCommandError('No podés cantar otro envido', 'ENVIDO_INVALID_RAISE');
    }
  }

  static async respondEnvido(opts: {
    matchId: string;
    userPhone: string;
    accept: boolean;
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      const hand = await this.getCurrentHand(client, match);
      const env = hand.envido_state;
      if (!env || env.accepted !== null) {
        throw new TrucoCommandError('No hay envido pendiente');
      }
      const seat = seatOf(match, opts.userPhone);
      if (env.offeredBy === seat) {
        throw new TrucoCommandError('No podés responder tu propio envido');
      }

      const targetScore = match.target_score;
      const leaderScore = Math.max(match.score_a, match.score_b);

      let points = 0;
      let winnerSeat: PlayerSeat;
      let scoreA = 0;
      let scoreB = 0;
      if (opts.accept) {
        // El envido se mide sobre las 3 cartas REPARTIDAS, no sobre las que
        // quedan en mano: si el rival ya tiró una carta antes de que se cante
        // (caso típico cuando el pie canta), cards_a/cards_b tendrían 2 cartas
        // y envidoScore lanzaría. Reconstruimos la mano original.
        scoreA = envidoScore(this.dealtHand(hand, 'A'));
        scoreB = envidoScore(this.dealtHand(hand, 'B'));
        const manoSeat: PlayerSeat = hand.mano_phone === match.player_a_phone ? 'A' : 'B';
        winnerSeat = resolveEnvido(scoreA, scoreB, manoSeat);
        // Puntos acumulados de la cadena; fallback al cálculo atómico legacy.
        points =
          env.acceptValue ??
          envidoPoints({
            level: env.level as 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO',
            accepted: true,
            leaderScore,
            targetScore,
          });
      } else {
        // "No quiero": gana el último cantor y se lleva el valor previo de la cadena.
        winnerSeat = env.offeredBy;
        points = env.declineValue ?? 1;
      }
      const newEnv: EnvidoState = {
        ...env,
        accepted: opts.accept,
        scoreA: opts.accept ? scoreA : undefined,
        scoreB: opts.accept ? scoreB : undefined,
        winner: winnerSeat,
        points,
      };
      // Sumar puntos al ganador
      const patch: Partial<TrucoMatchRow> = {};
      if (winnerSeat === 'A') patch.score_a = match.score_a + points;
      else patch.score_b = match.score_b + points;

      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
        envido_state: newEnv,
        points_envido: points,
      });
      let updatedMatch = match;
      if (Object.keys(patch).length > 0) {
        updatedMatch = await TrucoMatchService.updateMatch(client, match, patch);
      }
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: opts.accept ? 'ACCEPT_ENVIDO' : 'DECLINE_ENVIDO',
        payload: { points, winnerSeat, scoreA, scoreB },
        idempotencyKey: opts.idempotencyKey,
      });

      const winnerPhone = phoneOfSeat(updatedMatch, winnerSeat);
      const loserPhone = phoneOfSeat(updatedMatch, winnerSeat === 'A' ? 'B' : 'A');
      const announcement: Announcement = {
        type: 'ENVIDO_RESOLVED',
        accepted: opts.accept,
        winnerPhone,
        loserPhone,
        points,
        scoreWinner: opts.accept ? (winnerSeat === 'A' ? scoreA : scoreB) : undefined,
        scoreLoser: opts.accept ? (winnerSeat === 'A' ? scoreB : scoreA) : undefined,
        level: env.level,
      };

      // Ver si el envido cerró la partida (target alcanzado)
      const overSeat = gameOver(
        updatedMatch.score_a,
        updatedMatch.score_b,
        updatedMatch.target_score
      );
      if (overSeat) {
        const overDesc = await this.transitionGameOver(
          client,
          updatedMatch,
          overSeat,
          updatedHand
        );
        overDesc.announcement = announcement;
        return overDesc;
      }

      const desc = this.describeWaitingForCard(updatedMatch, updatedHand);
      desc.announcement = announcement;
      return desc;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // GO TO MAZO

  static async goToMazo(opts: {
    matchId: string;
    userPhone: string;
    idempotencyKey: string;
  }): Promise<TurnDescriptor> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      if (match.status !== TrucoMatchStatus.HAND_PLAY) {
        throw new TrucoCommandError(`No se puede ir al mazo ahora (${match.status})`);
      }
      const hand = await this.getCurrentHand(client, match);
      const seat = seatOf(match, opts.userPhone);

      // VALIDACIÓN DE FASE: sólo se puede ir al mazo si tenés la prioridad
      // (tu turno de carta, o respondiendo un canto pendiente). Si ya jugaste y
      // la prioridad pasó al rival, no es una acción válida tuya.
      if (!this.playerHasPriority(match, hand, opts.userPhone)) {
        throw new TrucoCommandError(
          'No es tu momento de jugar: esperá tu turno',
          'OUT_OF_PHASE'
        );
      }

      const winnerSeat = opponentSeat(seat);
      const winnerPhone = phoneOfSeat(match, winnerSeat);

      // Puntos: nivel actual de truco aceptado (1 si no había canto, 2/3/4 según truco_level)
      // Si había un canto pendiente, irse al mazo equivale a "no quiero" → puntos del nivel previo.
      const truco = hand.truco_state;
      let pointsTruco = 1;
      if (truco?.accepted === true) {
        pointsTruco = trucoPoints(truco.level, true);
      } else if (truco && truco.accepted === null && truco.lastCaller !== null) {
        pointsTruco = trucoPoints(truco.level, false);
      }

      const updatedHand = await TrucoMatchService.updateHand(client, hand.id, {
        hand_winner_phone: winnerPhone,
        points_truco: pointsTruco,
        finished_at: new Date(),
      });
      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: hand.id,
        userPhone: opts.userPhone,
        actionType: 'GO_TO_MAZO',
        payload: { pointsAwarded: pointsTruco },
        idempotencyKey: opts.idempotencyKey,
      });

      const finalDesc = await this.finalizeHand(client, match, updatedHand);
      finalDesc.announcement = {
        type: 'GO_TO_MAZO',
        losingPhone: opts.userPhone,
        winnerPhone,
        pointsAwarded: pointsTruco,
      };
      return finalDesc;
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIMEOUT / ABANDON

  /**
   * Chequea si el turno esperado sigue pendiente (aviso de descalificación
   * previo al timeout final). Devuelve el teléfono del jugador a avisar, o
   * null si el turno ya se jugó o el match no está esperando una acción.
   */
  static async timeoutWarningTarget(opts: {
    matchId: string;
    expectedSeq: number;
  }): Promise<string | null> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      const seqRes = await client.query<{ max_seq: number }>(
        'SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM truco_actions WHERE match_id = $1',
        [match.id]
      );
      const currentSeq = parseInt(String(seqRes.rows[0].max_seq), 10);
      if (currentSeq >= opts.expectedSeq) return null;
      if (match.status !== TrucoMatchStatus.HAND_PLAY) return null;
      // Si hay un canto pendiente, el reloj corre contra quien debe responder.
      return this.pendingActor(client, match);
    });
  }

  /**
   * Devuelve el teléfono del jugador del que se espera una acción ahora mismo:
   *  - si hay un envido/truco pendiente de respuesta → el rival del que cantó
   *  - si no → el jugador con el turno de carta (current_turn_phone)
   * Esto evita que el reloj de turno penalice al que acaba de cantar.
   */
  private static async pendingActor(
    client: PoolClient,
    match: TrucoMatchRow
  ): Promise<string> {
    const fallback = match.current_turn_phone ?? match.player_a_phone;
    if (!match.current_hand_id) return fallback;
    const hand = await TrucoMatchService.getHand(client, match.current_hand_id);
    if (!hand) return fallback;
    if (hand.envido_state && hand.envido_state.accepted === null) {
      return phoneOfSeat(match, opponentSeat(hand.envido_state.offeredBy));
    }
    if (
      hand.truco_state &&
      hand.truco_state.accepted === null &&
      hand.truco_state.lastCaller !== null
    ) {
      return phoneOfSeat(match, opponentSeat(hand.truco_state.lastCaller));
    }
    return fallback;
  }

  /**
   * Versión síncrona de la prioridad: ¿este teléfono es de quien se espera una
   * acción AHORA? (responder un canto pendiente, o jugar carta si no hay canto).
   * Determinística sobre el estado ya cargado del hand: rechaza acciones fuera
   * de fase sin depender de timing.
   */
  private static playerHasPriority(
    match: TrucoMatchRow,
    hand: TrucoHandRow,
    phone: string
  ): boolean {
    if (hand.envido_state && hand.envido_state.accepted === null) {
      return phone === phoneOfSeat(match, opponentSeat(hand.envido_state.offeredBy));
    }
    if (
      hand.truco_state &&
      hand.truco_state.accepted === null &&
      hand.truco_state.lastCaller !== null
    ) {
      return phone === phoneOfSeat(match, opponentSeat(hand.truco_state.lastCaller));
    }
    return phone === (match.current_turn_phone ?? match.player_a_phone);
  }

  static async handleTimeout(opts: {
    matchId: string;
    expectedSeq: number;
  }): Promise<TurnDescriptor | null> {
    return TrucoMatchService.withMatchLock(opts.matchId, async (match, client) => {
      // Si la sequence avanzó, el turno se completó: no aplicar timeout
      const seqRes = await client.query<{ max_seq: number }>(
        'SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM truco_actions WHERE match_id = $1',
        [match.id]
      );
      const currentSeq = seqRes.rows[0].max_seq;
      if (currentSeq >= opts.expectedSeq) {
        logger.info(
          { matchId: match.id, currentSeq, expectedSeq: opts.expectedSeq },
          '[Orchestrator] timeout obsoleto (turno ya jugado)'
        );
        return null;
      }
      // Sólo aplicamos timeout cuando el match está esperando acción del
      // jugador (HAND_PLAY). DEAL/HAND_RESOLVED son transitorios y los
      // estados terminales no admiten abandonment.
      if (match.status !== TrucoMatchStatus.HAND_PLAY) {
        return null;
      }

      // El que pierde por timeout es quien debía actuar: el que tiene el turno
      // de carta, o el que debía responder un canto pendiente.
      const losingPhone = await this.pendingActor(client, match);
      const winnerPhone =
        losingPhone === match.player_a_phone
          ? match.player_b_phone
          : match.player_a_phone;

      await TrucoActionService.append(client, {
        matchId: match.id,
        handId: match.current_hand_id ?? null,
        userPhone: losingPhone,
        actionType: 'TIMEOUT',
        payload: { expectedSeq: opts.expectedSeq },
        idempotencyKey: `${match.id}:timeout:${opts.expectedSeq}`,
      });
      const updated = await TrucoMatchService.updateMatch(client, match, {
        status: TrucoMatchStatus.ABANDONED,
        abandoned_by_phone: losingPhone,
        winner_phone: winnerPhone,
        finished_at: new Date(),
      });

      return {
        kind: 'GAME_OVER',
        match: updated,
        winnerPhone,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers internos

  private static async getCurrentHand(
    client: PoolClient,
    match: TrucoMatchRow
  ): Promise<TrucoHandRow> {
    if (!match.current_hand_id) {
      throw new TrucoCommandError(`Match ${match.id} no tiene mano activa`);
    }
    const hand = await TrucoMatchService.getHand(client, match.current_hand_id);
    if (!hand) {
      throw new TrucoCommandError(`Mano ${match.current_hand_id} no encontrada`);
    }
    return hand;
  }

  /**
   * Reconstruye las 3 cartas REPARTIDAS a un asiento, sumando las cartas que
   * ya jugó (registradas en baza_winners) a las que le quedan en mano. El
   * envido se calcula siempre sobre la mano original de 3 cartas.
   */
  private static dealtHand(hand: TrucoHandRow, seat: PlayerSeat): Card[] {
    const remaining = (seat === 'A' ? hand.cards_a : hand.cards_b) as Card[];
    const played = hand.baza_winners
      .map((b) => (seat === 'A' ? b.cardA : b.cardB))
      .filter((c): c is Card => !!c);
    return [...remaining, ...played];
  }

  private static describeWaitingForCard(
    match: TrucoMatchRow,
    hand: TrucoHandRow,
    bazaResolved?: { baza: number; winner: BazaWinner }
  ): TurnDescriptor {
    const bazaIdx = Math.min(hand.baza_winners.length, 2) as 0 | 1 | 2;
    return {
      kind: 'WAITING_FOR_CARD',
      match,
      hand,
      currentTurnPhone: match.current_turn_phone ?? match.player_a_phone,
      bazaIndex: bazaIdx,
      ...(bazaResolved ? { bazaResolved } : {}),
    };
  }

  /**
   * Cierra la mano (aplica puntos al match) y decide si la partida termina.
   */
  private static async finalizeHand(
    client: PoolClient,
    match: TrucoMatchRow,
    hand: TrucoHandRow
  ): Promise<TurnDescriptor> {
    const winnerPhone = hand.hand_winner_phone;
    if (!winnerPhone) throw new Error('finalizeHand sin hand_winner_phone');
    const points = hand.points_truco ?? 1;

    const winnerSeat: PlayerSeat = winnerPhone === match.player_a_phone ? 'A' : 'B';
    const patch: Partial<TrucoMatchRow> = {
      status: TrucoMatchStatus.HAND_RESOLVED,
      current_hand_id: null,
      current_turn_phone: null,
    };
    if (winnerSeat === 'A') patch.score_a = match.score_a + points;
    else patch.score_b = match.score_b + points;

    const updatedMatch = await TrucoMatchService.updateMatch(client, match, patch);

    const overSeat = gameOver(
      updatedMatch.score_a,
      updatedMatch.score_b,
      updatedMatch.target_score
    );
    if (overSeat) {
      return this.transitionGameOver(client, updatedMatch, overSeat, hand);
    }
    return {
      kind: 'HAND_RESOLVED',
      match: updatedMatch,
      hand,
      handWinnerPhone: winnerPhone,
      pointsAwarded: points,
      pointsEnvido: hand.points_envido ?? 0,
      scoreA: updatedMatch.score_a,
      scoreB: updatedMatch.score_b,
    };
  }

  private static async transitionGameOver(
    client: PoolClient,
    match: TrucoMatchRow,
    winnerSeat: PlayerSeat,
    hand: TrucoHandRow
  ): Promise<TurnDescriptor> {
    const winnerPhone = phoneOfSeat(match, winnerSeat);
    const updated = await TrucoMatchService.updateMatch(client, match, {
      status: TrucoMatchStatus.GAME_OVER,
      winner_phone: winnerPhone,
      finished_at: new Date(),
    });
    return {
      kind: 'GAME_OVER',
      match: updated,
      winnerPhone,
      hand,
    };
  }
}
