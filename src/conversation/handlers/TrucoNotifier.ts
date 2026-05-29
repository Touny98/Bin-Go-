import { notifyHighQueue, connection } from '../../queue';
import { ButtonsPayload, ListPayload } from '../../notifications/types/InteractiveMessage';
import { TrucoTrace } from '../../domain/truco/TrucoTrace';
import { TrucoMsg } from '../templates/TrucoMessages';
import {
  Announcement,
  TurnDescriptor,
} from '../../domain/truco/TrucoGameOrchestrator';
import {
  opponentPhone,
  phoneOfSeat,
  seatOf,
  TrucoHandRow,
  TrucoMatchRow,
} from '../../domain/truco/types';
import { SessionStore } from '../SessionStore';
import { query } from '../../db';
import { logger } from '../../utils/logger';
import { TrucoMatchService } from '../../domain/truco/TrucoMatchService';
import { TrucoMatchStatus } from '../../engine/truco/TrucoStateMachine';
import {
  formatARS,
} from '../templates/TrucoMessages';
import {
  BazaWinner,
  Card,
  cardTag,
  EnvidoLevel,
  PlayerSeat,
  TrucoLevel,
} from '../../engine/truco/types';
import {
  armTurnTimeout,
  disarmTurnTimeout,
  nextExpectedSeq,
} from '../../domain/truco/TrucoTurnGuard';

/**
 * TTL (ms) de los contadores de orden de salida por destinatario. Holgado para
 * cubrir una partida entera; se refresca en cada asignación. Si expira entre
 * partidas, el siguiente mensaje arranca una secuencia nueva y la compuerta del
 * NotificationWorker se auto-inicializa.
 */
const OUTSEQ_TTL_MS = parseInt(
  process.env.TRUCO_OUTSEQ_TTL_MS || String(6 * 60 * 60 * 1000),
  10
);

/**
 * Helper para enviar mensajes "push" a los jugadores fuera del ciclo
 * request-response del orchestrator conversacional.
 *
 * Se usa cuando una acción de un jugador genera output que debe llegar al
 * rival (o a ambos): jugada de carta, canto, resolución de mano, payout.
 *
 * ORDEN DE ENTREGA: cada mensaje recibe una secuencia FIFO por destinatario
 * (`outSeq`, en Redis). El NotificationWorker entrega en orden estricto de esa
 * secuencia (compuerta por teléfono), así que el orden NO depende de delays en
 * memoria ni de la concurrencia del worker. El "pacing" es natural: cada
 * mensaje se envía recién cuando el anterior al mismo teléfono fue aceptado por
 * Meta.
 */
export class TrucoNotifier {
  /**
   * Asigna la siguiente secuencia FIFO de salida para un destinatario (JID).
   * Vive en Redis → correcto aunque haya varios procesos emisores
   * (matchmaking, timeout, conversación).
   */
  private static async nextOutSeq(to: string): Promise<number> {
    const seq = await connection.incr(`outseq:${to}`);
    if (seq === 1) {
      // Primer mensaje del stream de este destinatario: fijamos la cabeza de la
      // compuerta FIFO en 1. Sin esto, si el NotificationWorker (concurrency>1)
      // procesa un seq mayor ANTES que el 1, su "auto-sane" inicializaría la
      // compuerta en ese seq mayor y descartaría los anteriores como stale →
      // se perderían mensajes (p.ej. "Encontramos rival" antes de las cartas).
      await connection.set(`outnext:${to}`, '1', 'PX', OUTSEQ_TTL_MS);
    }
    await connection.pexpire(`outseq:${to}`, OUTSEQ_TTL_MS);
    return seq;
  }
  /**
   * Resuelve el JID de WhatsApp para un teléfono dado.
   * Si tenemos `whatsapp_jid` en users lo usamos; si no, asumimos `${phone}@c.us`.
   */
  static async resolveJid(phone: string): Promise<string> {
    const res = await query(
      'SELECT whatsapp_jid FROM users WHERE phone_number = $1 LIMIT 1',
      [phone]
    );
    const jid = res.rows[0]?.whatsapp_jid as string | undefined;
    return jid ?? `${phone}@c.us`;
  }

  static async sendText(phone: string, text: string): Promise<void> {
    const to = await this.resolveJid(phone);
    const outSeq = await this.nextOutSeq(to);
    await notifyHighQueue.add('send_notification', { to, text, outSeq });
    TrucoTrace.event('outbound_enqueued', { phone, outSeq, jobName: 'send_notification' });
  }

  static async sendButtons(phone: string, payload: ButtonsPayload): Promise<void> {
    const to = await this.resolveJid(phone);
    const outSeq = await this.nextOutSeq(to);
    await notifyHighQueue.add('send_buttons', {
      to,
      text: payload.text,
      buttons: payload.buttons,
      footer: payload.footer,
      fallbackText: payload.text,
      outSeq,
    });
    TrucoTrace.event('outbound_enqueued', { phone, outSeq, jobName: 'send_buttons' });
  }

  static async sendList(phone: string, payload: ListPayload): Promise<void> {
    const to = await this.resolveJid(phone);
    const outSeq = await this.nextOutSeq(to);
    await notifyHighQueue.add('send_list', {
      to,
      text: payload.text,
      buttonLabel: payload.buttonLabel,
      sections: payload.sections,
      title: payload.title,
      footer: payload.footer,
      fallbackText: payload.text,
      outSeq,
    });
    TrucoTrace.event('outbound_enqueued', { phone, outSeq, jobName: 'send_list' });
  }

  /**
   * Sincroniza la sesión conversacional de un jugador para que apunte al
   * match activo y entre en TRUCO_PLAYING.
   */
  static async syncSession(phone: string, matchId: string): Promise<void> {
    const jidRes = await query(
      'SELECT whatsapp_jid FROM users WHERE phone_number = $1 LIMIT 1',
      [phone]
    );
    const userId = (jidRes.rows[0]?.whatsapp_jid as string | undefined) ?? `${phone}@c.us`;
    await SessionStore.update(userId, {
      state: 'TRUCO_PLAYING',
      context: { matchId, resolvedPhone: phone },
    });
    logger.info({ phone, matchId, userId }, '[TrucoNotifier] session synced to TRUCO_PLAYING');
  }

  /**
   * Envía a cada jugador el descriptor de turno actual, con las cartas
   * privadas del que corresponda.
   *
   * Reglas:
   * - El que tiene el turno recibe sus cartas + botones de acción.
   * - El otro recibe "esperando rival" + score.
   */
  static async pushTurnDescriptor(desc: TurnDescriptor): Promise<void> {
    // Anuncio narrativo previo (envido resuelto, truco aceptado/rechazado, mazo).
    if (desc.announcement) {
      await this.pushAnnouncement(desc.announcement, desc.match);
    }
    if (desc.kind === 'GAME_OVER') {
      await this.pushGameOver(desc);
      return;
    }
    if (desc.kind === 'HAND_RESOLVED') {
      await this.pushHandResolved(desc);
      return;
    }
    if (desc.kind === 'WAITING_TRUCO_RESPONSE') {
      await this.pushTrucoResponse(desc);
      await this.armNextTurnTimeout(desc.match.id);
      return;
    }
    if (desc.kind === 'WAITING_ENVIDO_RESPONSE') {
      await this.pushEnvidoResponse(desc);
      await this.armNextTurnTimeout(desc.match.id);
      return;
    }
    // WAITING_FOR_CARD: cartas al que juega, "esperando" al rival
    await this.pushWaitingForCard(desc as Extract<TurnDescriptor, { kind: 'WAITING_FOR_CARD' }>);
    await this.armNextTurnTimeout(desc.match.id);
  }

  /**
   * Emite a ambos jugadores el resultado de una resolución intermedia
   * (envido, truco aceptado/rechazado, mazo) antes de avanzar al siguiente
   * estado del juego.
   */
  private static async pushAnnouncement(
    a: Announcement,
    match: { player_a_phone: string; player_b_phone: string }
  ): Promise<void> {
    if (a.type === 'ENVIDO_RESOLVED') {
      if (a.accepted) {
        const sw = a.scoreWinner ?? 0;
        const sl = a.scoreLoser ?? 0;
        await this.sendText(
          a.winnerPhone,
          TrucoMsg.ENVIDO_ACCEPTED_RESULT(sw, sl, true, a.points)
        );
        await this.sendText(
          a.loserPhone,
          TrucoMsg.ENVIDO_ACCEPTED_RESULT(sl, sw, false, a.points)
        );
      } else {
        await this.sendText(
          a.winnerPhone,
          TrucoMsg.ENVIDO_DECLINED_WIN(a.points)
        );
        await this.sendText(a.loserPhone, TrucoMsg.YOU_DECLINED_ENVIDO());
      }
      return;
    }
    if (a.type === 'TRUCO_ACCEPTED') {
      await this.sendText(a.responderPhone, TrucoMsg.TRUCO_ACCEPTED(a.level));
      await this.sendText(a.callerPhone, TrucoMsg.TRUCO_ACCEPTED(a.level));
      return;
    }
    if (a.type === 'TRUCO_DECLINED') {
      const responderName = await this.lookupName(a.responderPhone);
      await this.sendText(
        a.callerPhone,
        TrucoMsg.TRUCO_DECLINED(responderName, a.pointsAwarded)
      );
      await this.sendText(
        a.responderPhone,
        TrucoMsg.YOU_DECLINED_TRUCO(a.pointsAwarded)
      );
      return;
    }
    if (a.type === 'GO_TO_MAZO') {
      const loserName = await this.lookupName(a.losingPhone);
      await this.sendText(a.losingPhone, TrucoMsg.YOU_GO_MAZO(a.pointsAwarded));
      await this.sendText(
        a.winnerPhone,
        TrucoMsg.RIVAL_GO_MAZO(loserName, a.pointsAwarded)
      );
      return;
    }
  }

  /**
   * Encola el timeout para la próxima acción esperada. El worker se encarga
   * de detectar si la acción ya se cumplió (no-op por seq desactualizado).
   */
  private static async armNextTurnTimeout(matchId: string): Promise<void> {
    try {
      const seq = await nextExpectedSeq(matchId);
      await armTurnTimeout(matchId, seq);
    } catch (e: any) {
      logger.warn({ matchId, err: e.message }, '[TrucoNotifier] arm timeout failed');
    }
  }

  // ───── Implementaciones ──────────────────────────────────────────────

  private static async pushWaitingForCard(
    desc: Extract<TurnDescriptor, { kind: 'WAITING_FOR_CARD' }>
  ): Promise<void> {
    const { match, hand, currentTurnPhone } = desc;
    const rival = opponentPhone(match, currentTurnPhone);

    const activeSeat = seatOf(match, currentTurnPhone);
    const rivalSeat = seatOf(match, rival);
    const rivalCards = (rivalSeat === 'A' ? hand.cards_a : hand.cards_b) as Card[];

    // ── Resumen de baza ───────────────────────────────────────────────
    // Al cerrarse cada baza enviamos a AMBOS un resumen del estado de la mano
    // (bazas ganadas) antes de continuar con el próximo turno.
    if (desc.bazaResolved) {
      await this.pushBazaTally(match, hand, desc.bazaResolved, currentTurnPhone, rival);
    }

    // Al inicio de la mano (todavía nadie jugó carta) enviamos primero, en un
    // mensaje aparte, el score + número de mano a ambos jugadores.
    const isStartOfHand = hand.baza_winners.length === 0;
    if (isStartOfHand) {
      await this.sendText(
        currentTurnPhone,
        TrucoMsg.ROUND_HEADER(
          hand.hand_number,
          activeSeat === 'A' ? match.score_a : match.score_b,
          activeSeat === 'A' ? match.score_b : match.score_a
        )
      );
      await this.sendText(
        rival,
        TrucoMsg.ROUND_HEADER(
          hand.hand_number,
          rivalSeat === 'A' ? match.score_a : match.score_b,
          rivalSeat === 'A' ? match.score_b : match.score_a
        )
      );
    }

    // ── Jugador en turno ──────────────────────────────────────────────
    // "Tus cartas" (botones) + lista de cantos disponibles.
    await this.sendCardPrompt(match, hand, currentTurnPhone);

    // ── Rival (esperando) ─────────────────────────────────────────────
    // Tras aceptar un truco, el rival ya recibió el anuncio: no repetimos.
    const trucoJustAccepted = desc.announcement?.type === 'TRUCO_ACCEPTED';
    if (trucoJustAccepted) return;

    if (isStartOfHand) {
      // Reparto inicial: el pie ve sus cartas (sin CTA ni lista de cantos);
      // podrá cantar cuando le toque el turno.
      await this.sendText(
        rival,
        `${TrucoMsg.YOUR_CARDS_WAITING(rivalCards)}\n\n${TrucoMsg.WAITING_RIVAL()}`
      );
    } else {
      // Mitad de mano: al que acaba de jugar NO le reenviamos cartas ni cantos.
      // Sólo avisamos que el turno pasó al rival (ritmo de mesa real).
      const activeName = await this.lookupName(currentTurnPhone);
      await this.sendText(rival, TrucoMsg.RIVAL_TURN_WAIT(activeName));
    }
  }

  /**
   * Envía al jugador en turno sus cartas (como botones) + la lista de cantos
   * disponibles. Reutilizable tanto en el flujo normal como al re-prompt por
   * timeout (si el mensaje original se perdió).
   */
  private static async sendCardPrompt(
    match: TrucoMatchRow,
    hand: TrucoHandRow,
    phone: string
  ): Promise<void> {
    const seat = seatOf(match, phone);
    const myCards = (seat === 'A' ? hand.cards_a : hand.cards_b) as Card[];
    await this.sendButtons(phone, {
      text: TrucoMsg.YOUR_CARDS(myCards),
      buttons: myCards.map((card, i) => ({ id: `play_${i + 1}`, label: cardTag(card) })),
    });
    const cantoRows = this.buildCantoRows(hand, seat);
    if (cantoRows.length > 0) {
      await this.sendList(phone, {
        text: TrucoMsg.CANTOS_PROMPT(),
        buttonLabel: 'Cantar',
        title: 'Cantos',
        sections: [{ title: 'Cantos disponibles', rows: cantoRows }],
      });
    }
  }

  /**
   * Construye y envía al `offeredToPhone` los botones de respuesta a un truco
   * (Quiero / subir / No quiero). No mensajea al cantor.
   */
  private static async sendTrucoResponsePrompt(
    match: TrucoMatchRow,
    offeredToPhone: string,
    level: TrucoLevel
  ): Promise<void> {
    const caller = opponentPhone(match, offeredToPhone);
    const buttons: { id: string; label: string }[] = [];
    buttons.push({ id: 'truco_accept', label: 'Quiero ✓' });
    if (level < 4) {
      const nextLabel = level === 2 ? 'Retruco 🔥' : 'Vale 4 🚨';
      buttons.push({ id: `truco_escalate_${level + 1}`, label: nextLabel });
    }
    buttons.push({ id: 'truco_decline', label: 'No quiero 🏳️' });

    const callerName = await this.lookupName(caller);
    await this.sendButtons(offeredToPhone, {
      text: TrucoMsg.RIVAL_CALLED_TRUCO(callerName, level as 2 | 3 | 4),
      buttons,
    });
  }

  /**
   * Construye y envía al `offeredToPhone` la respuesta a un envido. Si todavía
   * se puede subir, va como lista; si es el canto final (falta envido), como
   * dos botones (Quiero / No quiero). No mensajea al cantor.
   */
  private static async sendEnvidoResponsePrompt(
    match: TrucoMatchRow,
    hand: TrucoHandRow,
    offeredToPhone: string,
    envidoLevel: EnvidoLevel
  ): Promise<void> {
    const caller = opponentPhone(match, offeredToPhone);
    const callerName = await this.lookupName(caller);
    const levelLabel = envidoLabel(envidoLevel);

    const raiseRows: Array<{ id: string; title: string; description?: string }> = [];
    const envidoCount = hand?.envido_state?.envidoCount ?? 0;
    if (envidoLevel === 'ENVIDO') {
      if (envidoCount < 2) {
        raiseRows.push({ id: 'call_envido', title: 'Envido', description: 'Subís: envido envido' });
      }
      raiseRows.push({ id: 'call_real_envido', title: 'Real Envido', description: 'Subís a real envido' });
      raiseRows.push({ id: 'call_falta_envido', title: 'Falta Envido', description: 'Subís a falta envido' });
    } else if (envidoLevel === 'REAL_ENVIDO') {
      raiseRows.push({ id: 'call_falta_envido', title: 'Falta Envido', description: 'Subís a falta envido' });
    }

    if (raiseRows.length === 0) {
      // Mensaje final de la escalada (falta envido): sólo Quiero / No quiero.
      await this.sendButtons(offeredToPhone, {
        text: TrucoMsg.RIVAL_CALLED_ENVIDO(callerName, levelLabel),
        buttons: [
          { id: 'envido_accept', label: 'Quiero ✓' },
          { id: 'envido_decline', label: 'No quiero 🏳️' },
        ],
      });
    } else {
      const rows: Array<{ id: string; title: string; description?: string }> = [
        { id: 'envido_accept', title: 'Quiero ✓', description: 'Aceptás y se miden los puntos' },
        { id: 'envido_decline', title: 'No quiero 🏳️', description: 'Le das los puntos al rival' },
        ...raiseRows,
      ];
      await this.sendList(offeredToPhone, {
        text: TrucoMsg.RIVAL_CALLED_ENVIDO(callerName, levelLabel),
        buttonLabel: 'Responder',
        title: 'Te cantaron envido',
        sections: [{ title: '¿Qué hacés?', rows }],
      });
    }
  }

  /**
   * Re-envía al `phone` el prompt de la acción que tiene pendiente AHORA mismo
   * (responder envido, responder truco o jugar carta). Se usa cuando salta el
   * aviso de timeout: si el mensaje original se perdió (ej.: error transitorio
   * de Meta), el jugador igual recibe los botones para actuar y no pierde por
   * abandono sin haber sido avisado realmente.
   */
  static async repromptPendingActor(matchId: string, phone: string): Promise<void> {
    try {
      const match = await TrucoMatchService.getMatch(matchId);
      if (
        !match ||
        match.status !== TrucoMatchStatus.HAND_PLAY ||
        !match.current_hand_id
      ) {
        return;
      }
      const hand = await TrucoMatchService.withMatchLock(matchId, async (m, client) =>
        m.current_hand_id ? TrucoMatchService.getHand(client, m.current_hand_id) : null
      );
      if (!hand) return;
      const seat = seatOf(match, phone);

      // 1) Envido pendiente de respuesta → al rival del que cantó.
      const env = hand.envido_state;
      if (env && env.accepted === null && env.offeredBy !== seat) {
        await this.sendEnvidoResponsePrompt(match, hand, phone, env.level);
        return;
      }
      // 2) Truco pendiente de respuesta → al rival del que cantó.
      const tr = hand.truco_state;
      if (tr && tr.accepted === null && tr.lastCaller !== null && tr.lastCaller !== seat) {
        await this.sendTrucoResponsePrompt(match, phone, tr.level);
        return;
      }
      // 3) Sin cantos pendientes → le toca jugar carta.
      if (match.current_turn_phone === phone) {
        await this.sendCardPrompt(match, hand, phone);
      }
    } catch (e: any) {
      logger.warn({ matchId, phone, err: e.message }, '[TrucoNotifier] reprompt failed');
    }
  }

  /**
   * Envía a ambos jugadores el resumen del estado de la mano cuando se cierra
   * una baza: quién ganó la baza y cómo va el conteo de bazas ganadas. El texto
   * se arma desde el punto de vista de cada destinatario ("Vos" / "Rival").
   */
  private static async pushBazaTally(
    match: { player_a_phone: string; player_b_phone: string },
    hand: { baza_winners: Array<{ winner?: BazaWinner }> },
    bazaResolved: { baza: number; winner: BazaWinner },
    activePhone: string,
    rivalPhone: string
  ): Promise<void> {
    let winsA = 0;
    let winsB = 0;
    for (const b of hand.baza_winners) {
      if (b.winner === 'A') winsA++;
      else if (b.winner === 'B') winsB++;
    }

    const activeSeat: PlayerSeat = activePhone === match.player_a_phone ? 'A' : 'B';
    const rivalSeat: PlayerSeat = rivalPhone === match.player_a_phone ? 'A' : 'B';
    const winnerSeat = bazaResolved.winner; // 'A' | 'B' | 'PARDA'

    const [activeName, rivalName] = await Promise.all([
      this.lookupName(activePhone),
      this.lookupName(rivalPhone),
    ]);

    const outcomeFor = (seat: PlayerSeat): 'you' | 'rival' | 'parda' =>
      winnerSeat === 'PARDA' ? 'parda' : winnerSeat === seat ? 'you' : 'rival';

    // Para el jugador en turno: su rival es `rivalName`.
    await this.sendText(
      activePhone,
      TrucoMsg.BAZA_TALLY(
        bazaResolved.baza,
        outcomeFor(activeSeat),
        rivalName,
        activeSeat === 'A' ? winsA : winsB,
        activeSeat === 'A' ? winsB : winsA
      )
    );
    // Para el que espera: su rival es `activeName`.
    await this.sendText(
      rivalPhone,
      TrucoMsg.BAZA_TALLY(
        bazaResolved.baza,
        outcomeFor(rivalSeat),
        activeName,
        rivalSeat === 'A' ? winsA : winsB,
        rivalSeat === 'A' ? winsB : winsA
      )
    );
  }

  /**
   * Construye las filas de cantos disponibles para un jugador (envido/truco/mazo).
   * `seat` permite decidir el envido por jugador: el envido se puede cantar en
   * la primera baza mientras ESE jugador no haya tirado su carta.
   */
  private static buildCantoRows(
    hand: any,
    seat: PlayerSeat
  ): Array<{ id: string; title: string; description?: string }> {
    const rows: Array<{ id: string; title: string; description?: string }> = [];
    // Envido: primera baza, sin envido previo y antes de que ESTE jugador juegue.
    const firstBaza = hand.baza_winners[0];
    const playedFirst =
      !!firstBaza && (seat === 'A' ? !!firstBaza.cardA : !!firstBaza.cardB);
    const envidoAvailable =
      (hand.envido_state === null || hand.envido_state === undefined) &&
      hand.baza_winners.length <= 1 &&
      !playedFirst;
    if (envidoAvailable) {
      rows.push({ id: 'call_envido', title: 'Cantar Envido', description: 'Vale 2 si acepta' });
      rows.push({ id: 'call_real_envido', title: 'Real Envido', description: 'Vale 3' });
      rows.push({ id: 'call_falta_envido', title: 'Falta Envido', description: 'Vale lo que falte' });
    }
    // Truco escalable
    const trucoLevel = hand.truco_state?.level ?? 1;
    const trucoAccepted = hand.truco_state?.accepted === true;
    const trucoLastCaller = hand.truco_state?.lastCaller ?? null;
    const canCallTruco =
      trucoLastCaller === null || trucoAccepted; // sólo se canta tras aceptación o desde base
    if (canCallTruco && trucoLevel < 4) {
      const nextLevel = (trucoLevel + 1) as 2 | 3 | 4;
      const label =
        nextLevel === 2 ? 'Truco' : nextLevel === 3 ? 'Retruco' : 'Vale 4';
      rows.push({ id: `call_truco_${nextLevel}`, title: `Cantar ${label}`, description: `Vale ${nextLevel}` });
    }
    rows.push({ id: 'go_mazo', title: 'Irse al mazo', description: 'Perdés esta mano' });
    return rows;
  }

  private static async pushTrucoResponse(
    desc: Extract<TurnDescriptor, { kind: 'WAITING_TRUCO_RESPONSE' }>
  ): Promise<void> {
    const { match, offeredToPhone, level } = desc;
    const caller = opponentPhone(match, offeredToPhone);
    await this.sendTrucoResponsePrompt(match, offeredToPhone, level);
    await this.sendText(caller, TrucoMsg.YOU_CALLED_TRUCO(level as 2 | 3 | 4));
  }

  private static async pushEnvidoResponse(
    desc: Extract<TurnDescriptor, { kind: 'WAITING_ENVIDO_RESPONSE' }>
  ): Promise<void> {
    const { match, offeredToPhone, envidoLevel, hand } = desc;
    const caller = opponentPhone(match, offeredToPhone);
    await this.sendEnvidoResponsePrompt(match, hand, offeredToPhone, envidoLevel);
    await this.sendText(caller, TrucoMsg.YOU_CALLED_ENVIDO(envidoLabel(envidoLevel)));
  }

  private static async pushHandResolved(
    desc: Extract<TurnDescriptor, { kind: 'HAND_RESOLVED' }>
  ): Promise<void> {
    const { match, handWinnerPhone, pointsAwarded, scoreA, scoreB } = desc;
    const loserPhone =
      handWinnerPhone === match.player_a_phone ? match.player_b_phone : match.player_a_phone;
    const scoreWin = handWinnerPhone === match.player_a_phone ? scoreA : scoreB;
    const scoreLose = handWinnerPhone === match.player_a_phone ? scoreB : scoreA;

    await this.sendText(
      handWinnerPhone,
      TrucoMsg.HAND_RESOLVED_WIN(pointsAwarded, scoreWin, scoreLose)
    );
    await this.sendText(
      loserPhone,
      TrucoMsg.HAND_RESOLVED_LOSE(pointsAwarded, scoreLose, scoreWin)
    );
  }

  private static async pushGameOver(
    desc: Extract<TurnDescriptor, { kind: 'GAME_OVER' }>
  ): Promise<void> {
    const { match, winnerPhone } = desc;
    const loserPhone =
      winnerPhone === match.player_a_phone ? match.player_b_phone : match.player_a_phone;
    const prize = Math.round((match.pot_amount - match.pot_amount * match.fee_pct) * 100) / 100;

    if (match.abandoned_by_phone) {
      const loserName = await this.lookupName(loserPhone);
      await this.sendButtons(winnerPhone, {
        text: TrucoMsg.ABANDONED_OPPONENT_WIN(loserName, prize),
        buttons: [
          { id: 'truco_rematch', label: 'Revancha 🃏' },
          { id: 'truco_menu', label: 'Menú principal' },
        ],
      });
      await this.sendText(loserPhone, TrucoMsg.ABANDONED_YOU_LOSE());
      return;
    }
    const scoreWin = winnerPhone === match.player_a_phone ? match.score_a : match.score_b;
    const scoreLose = winnerPhone === match.player_a_phone ? match.score_b : match.score_a;

    await this.sendButtons(winnerPhone, {
      text: TrucoMsg.GAME_OVER_WIN(prize, scoreWin, scoreLose),
      buttons: [
        { id: 'truco_rematch', label: 'Revancha 🃏' },
        { id: 'truco_menu', label: 'Menú principal' },
      ],
      footer: `Comisión casa: ${formatARS(match.pot_amount * match.fee_pct)}`,
    });
    await this.sendButtons(loserPhone, {
      text: TrucoMsg.GAME_OVER_LOSE(scoreLose, scoreWin),
      buttons: [
        { id: 'truco_rematch', label: 'Revancha 🃏' },
        { id: 'truco_menu', label: 'Menú principal' },
      ],
    });
  }

  /**
   * Notifica el match found + bet locked a ambos jugadores.
   * Sincroniza sus sesiones a TRUCO_PLAYING.
   */
  static async pushMatchFound(matchId: string): Promise<void> {
    const match = await TrucoMatchService.getMatch(matchId);
    if (!match) return;
    const prize =
      Math.round((match.pot_amount - match.pot_amount * match.fee_pct) * 100) / 100;
    const [nameA, nameB] = await Promise.all([
      this.lookupName(match.player_a_phone),
      this.lookupName(match.player_b_phone),
    ]);
    await this.syncSession(match.player_a_phone, matchId);
    await this.syncSession(match.player_b_phone, matchId);
    // Cada jugador ve el nombre del OTRO como rival.
    await this.sendText(match.player_a_phone, TrucoMsg.MATCH_FOUND(nameB, prize));
    await this.sendText(match.player_b_phone, TrucoMsg.MATCH_FOUND(nameA, prize));
  }

  /**
   * Devuelve el nombre registrado del usuario, o null si todavía no lo cargó.
   */
  private static async lookupName(phone: string): Promise<string | null> {
    const res = await query(
      'SELECT name FROM users WHERE phone_number = $1 LIMIT 1',
      [phone]
    );
    const name = res.rows[0]?.name as string | null | undefined;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    return trimmed !== '' ? trimmed : null;
  }
}

/** Etiqueta legible del nivel de envido para los mensajes. */
function envidoLabel(level: EnvidoLevel): string {
  return level === 'ENVIDO'
    ? 'ENVIDO'
    : level === 'REAL_ENVIDO'
    ? 'REAL ENVIDO'
    : 'FALTA ENVIDO';
}
