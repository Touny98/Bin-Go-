import { BaseHandler, HandlerResponse, HandlerMeta } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { TrucoMsg } from '../templates/TrucoMessages';
import { logger } from '../../utils/logger';
import { TrucoTrace } from '../../domain/truco/TrucoTrace';
import {
  TrucoCommandError,
  TrucoGameOrchestrator,
} from '../../domain/truco/TrucoGameOrchestrator';
import { TrucoMatchService } from '../../domain/truco/TrucoMatchService';
import { TrucoNotifier } from './TrucoNotifier';
import { buildMainMenu, buildRoomList, trucoNavFollowUp } from './TrucoLobbyHandler';
import { TrucoSettlementService } from '../../finance/TrucoSettlementService';
import { TrucoMatchStatus } from '../../engine/truco/TrucoStateMachine';
import { Card } from '../../engine/truco/types';
import { seatOf } from '../../domain/truco/types';

/**
 * Handler activo durante una partida de Truco.
 * Mapea inputs del usuario (IDs de botones o texto) a comandos del orquestador.
 */
export class TrucoGameHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string,
    meta?: HandlerMeta
  ): Promise<HandlerResponse> {
    const phone = this.getPhone(session);
    const recovery: { id?: string } = {};
    const result = await this.dispatch(session, intent, rawInput, recovery, meta);
    // Persistir matchId/resolvedPhone si recuperamos el match desde DB
    if (recovery.id && !result.nextState && !result.nextContext) {
      result.nextContext = {
        matchId: recovery.id,
        resolvedPhone: phone,
      };
    }
    return result;
  }

  private async dispatch(
    session: UserSession,
    intent: IntentType,
    rawInput: string,
    recovery: { id?: string },
    meta?: HandlerMeta
  ): Promise<HandlerResponse> {
    const phone = this.getPhone(session);
    const matchId = session.context?.matchId as string | undefined;

    if (!matchId) {
      // Recuperar match activo si lo hay
      const active = await TrucoMatchService.getActiveMatchForPlayer(phone);
      if (!active) {
        return {
          nextState: 'MAIN_MENU',
          nextContext: {},
          message: TrucoMsg.ERR_NO_ACTIVE_MATCH(),
        };
      }
      session.context = { ...session.context, matchId: active.id };
      recovery.id = active.id;
    }

    const id = (session.context?.matchId ?? '') as string;
    const match = await TrucoMatchService.getMatch(id);
    if (!match) {
      return {
        nextState: 'MAIN_MENU',
        nextContext: {},
        message: TrucoMsg.ERR_NO_ACTIVE_MATCH(),
      };
    }

    // Si el match ya terminó pero la sesión sigue acá, ofrecer revancha/menú
    if (
      match.status === TrucoMatchStatus.PAYOUT_DONE ||
      match.status === TrucoMatchStatus.CANCELLED ||
      match.status === TrucoMatchStatus.GAME_OVER ||
      match.status === TrucoMatchStatus.ABANDONED
    ) {
      return this.handlePostMatch(rawInput);
    }

    const input = rawInput.trim().toLowerCase();
    // Idempotencia determinística: la misma acción física (mismo message.id de
    // Meta) produce SIEMPRE la misma clave → un reproceso es no-op real en
    // truco_actions (append devuelve inserted:false). Fallback al esquema
    // por-tiempo sólo si no llegó messageId.
    const idem = (
      meta?.messageId
        ? `${id}:${meta.messageId}`
        : `${id}:${phone}:${Date.now()}:${input}`
    ).substring(0, 120);
    TrucoTrace.event('inbound_received', {
      matchId: id,
      phone,
      messageId: meta?.messageId,
      detail: input,
    });

    try {
      // ─── Cartas ────────────────────────────────────────────────
      const playMatch = input.match(/^play_([123])$/);
      if (playMatch) {
        const cardIdx = parseInt(playMatch[1], 10) - 1;
        return await this.playCardByIndex(id, phone, cardIdx, idem);
      }
      if (/^[123]$/.test(input)) {
        const cardIdx = parseInt(input, 10) - 1;
        return await this.playCardByIndex(id, phone, cardIdx, idem);
      }

      // ─── Truco ─────────────────────────────────────────────────
      const trucoCall = input.match(/^call_truco_([234])$/);
      if (trucoCall || ['truco', 'retruco', 'vale 4', 'vale4'].includes(input)) {
        let level: 2 | 3 | 4;
        if (trucoCall) level = parseInt(trucoCall[1], 10) as 2 | 3 | 4;
        else level = (input === 'truco' ? 2 : input === 'retruco' ? 3 : 4) as 2 | 3 | 4;
        return await this.handleAction(() =>
          TrucoGameOrchestrator.callTruco({ matchId: id, userPhone: phone, level, idempotencyKey: idem })
        );
      }
      if (['truco_accept', 'quiero', 'si', 'sí'].includes(input)) {
        return await this.handleAction(() =>
          TrucoGameOrchestrator.respondTruco({ matchId: id, userPhone: phone, accept: true, idempotencyKey: idem })
        );
      }
      if (['truco_decline', 'no', 'no quiero'].includes(input)) {
        // Detecta si la respuesta es a envido o a truco mirando el hand
        const hand = await this.getHand(id);
        if (hand?.envido_state && hand.envido_state.accepted === null) {
          return await this.handleAction(() =>
            TrucoGameOrchestrator.respondEnvido({ matchId: id, userPhone: phone, accept: false, idempotencyKey: idem })
          );
        }
        return await this.handleAction(() =>
          TrucoGameOrchestrator.respondTruco({ matchId: id, userPhone: phone, accept: false, idempotencyKey: idem })
        );
      }
      const trucoEsc = input.match(/^truco_escalate_([234])$/);
      if (trucoEsc) {
        const level = parseInt(trucoEsc[1], 10) as 2 | 3 | 4;
        return await this.handleAction(() =>
          TrucoGameOrchestrator.callTruco({ matchId: id, userPhone: phone, level, idempotencyKey: idem })
        );
      }

      // ─── Envido ────────────────────────────────────────────────
      const envidoCall: Record<string, 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO'> = {
        call_envido: 'ENVIDO',
        envido: 'ENVIDO',
        call_real_envido: 'REAL_ENVIDO',
        'real envido': 'REAL_ENVIDO',
        call_falta_envido: 'FALTA_ENVIDO',
        'falta envido': 'FALTA_ENVIDO',
      };
      if (envidoCall[input]) {
        const level = envidoCall[input];
        return await this.handleAction(() =>
          TrucoGameOrchestrator.callEnvido({ matchId: id, userPhone: phone, level, idempotencyKey: idem })
        );
      }
      if (input === 'envido_accept') {
        return await this.handleAction(() =>
          TrucoGameOrchestrator.respondEnvido({ matchId: id, userPhone: phone, accept: true, idempotencyKey: idem })
        );
      }
      if (input === 'envido_decline') {
        return await this.handleAction(() =>
          TrucoGameOrchestrator.respondEnvido({ matchId: id, userPhone: phone, accept: false, idempotencyKey: idem })
        );
      }

      // ─── Mazo ──────────────────────────────────────────────────
      if (input === 'go_mazo' || input === 'mazo') {
        return await this.handleAction(() =>
          TrucoGameOrchestrator.goToMazo({ matchId: id, userPhone: phone, idempotencyKey: idem })
        );
      }

      return {
        message: TrucoMsg.ERR_UNKNOWN(),
      };
    } catch (e: any) {
      if (e instanceof TrucoCommandError) {
        TrucoTrace.event('command_discarded', { matchId: id, phone, reason: e.code, detail: input });
        const map: Record<string, string> = {
          NOT_YOUR_TURN: TrucoMsg.ERR_NOT_YOUR_TURN(),
        };
        return { message: map[e.code] ?? TrucoMsg.ERR_INVALID_ACTION() };
      }
      logger.error({ err: e?.message }, '[TrucoGameHandler] unexpected');
      return { message: TrucoMsg.ERR_UNKNOWN() };
    }
  }

  private async playCardByIndex(
    matchId: string,
    phone: string,
    idx: number,
    idem: string
  ): Promise<HandlerResponse> {
    const match = await TrucoMatchService.getMatch(matchId);
    if (!match) return { message: TrucoMsg.ERR_NO_ACTIVE_MATCH() };
    if (!match.current_hand_id) return { message: TrucoMsg.ERR_INVALID_ACTION() };

    // Necesitamos las cartas del jugador para mapear índice→carta
    const hand = await this.getHand(matchId);
    if (!hand) return { message: TrucoMsg.ERR_INVALID_ACTION() };
    const seat = seatOf(match, phone);
    const cards = (seat === 'A' ? hand.cards_a : hand.cards_b) as Card[];
    if (idx < 0 || idx >= cards.length) {
      return { message: TrucoMsg.ERR_INVALID_ACTION() };
    }
    const card = cards[idx];
    return await this.handleAction(async () => {
      const desc = await TrucoGameOrchestrator.playCard({
        matchId,
        userPhone: phone,
        card,
        idempotencyKey: idem,
      });
      // Confirmar al jugador qué carta jugó (mensaje confidencial extra)
      await TrucoNotifier.sendText(phone, TrucoMsg.CARD_PLAYED_BY_YOU(card));
      // Notificar al rival qué carta jugó
      const rivalPhone =
        phone === match.player_a_phone ? match.player_b_phone : match.player_a_phone;
      await TrucoNotifier.sendText(rivalPhone, TrucoMsg.CARD_PLAYED_BY_RIVAL(card));
      return desc;
    });
  }

  private async handleAction(
    fn: () => Promise<any>
  ): Promise<HandlerResponse> {
    try {
      const desc = await fn();
      if (desc) {
        TrucoTrace.event('command_result', { matchId: desc.match?.id, kind: desc.kind });
        await TrucoNotifier.pushTurnDescriptor(desc);
        // Si terminó la partida, settle payout
        if (desc.kind === 'GAME_OVER') {
          await TrucoSettlementService.payout(desc.match.id);
        }
        // Si terminó la mano (pero no la partida), repartir la siguiente
        // automáticamente. Sin esto el flujo se traba después de la 1ª mano.
        if (desc.kind === 'HAND_RESOLVED') {
          try {
            const nextDesc = await TrucoGameOrchestrator.dealNewHand(desc.match.id);
            await TrucoNotifier.pushTurnDescriptor(nextDesc);
            if (nextDesc.kind === 'GAME_OVER') {
              await TrucoSettlementService.payout(nextDesc.match.id);
            }
          } catch (err: any) {
            logger.error(
              { matchId: desc.match.id, err: err?.message },
              '[TrucoGameHandler] dealNewHand after HAND_RESOLVED failed'
            );
          }
        }
      }
      // Los push messages ya cubren al usuario → no enviar reply inline.
      return { silent: true };
    } catch (e: any) {
      if (e instanceof TrucoCommandError) {
        TrucoTrace.event('command_discarded', { reason: e.code });
        if (e.code === 'NOT_YOUR_TURN') return { message: TrucoMsg.ERR_NOT_YOUR_TURN() };
        return { message: e.message };
      }
      throw e;
    }
  }

  private async getHand(matchId: string) {
    const m = await TrucoMatchService.getMatch(matchId);
    if (!m?.current_hand_id) return null;
    return TrucoMatchService.withMatchLock(matchId, async (mm, client) => {
      return await TrucoMatchService.getHand(client, mm.current_hand_id!);
    });
  }

  private handlePostMatch(input: string): HandlerResponse {
    const lower = input.trim().toLowerCase();
    // Limpiamos matchId para no arrastrar la partida terminada a la próxima.
    // (resolvedPhone se conserva: hace falta para resolver JIDs @lid.)
    const clearMatch = { matchId: undefined };

    // Revancha → directo a las mesas para volver a apostar.
    if (lower === 'truco_rematch' || lower === 'revancha') {
      return {
        nextState: 'TRUCO_LOBBY',
        nextContext: clearMatch,
        ...buildRoomList(),
        followUp: trucoNavFollowUp(),
      };
    }
    // Menú principal de Truco.
    if (lower === 'truco_menu' || lower === 'menú' || lower === 'menu') {
      return {
        nextState: 'TRUCO_LOBBY',
        nextContext: clearMatch,
        ...buildMainMenu(),
      };
    }
    // Cualquier otra cosa tras la partida → menú de Truco.
    return {
      nextState: 'TRUCO_LOBBY',
      nextContext: clearMatch,
      ...buildMainMenu(),
    };
  }
}
