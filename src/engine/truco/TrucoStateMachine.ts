export enum TrucoMatchStatus {
  MATCH_QUEUED = 'MATCH_QUEUED',
  MATCH_FOUND = 'MATCH_FOUND',
  BET_LOCKED = 'BET_LOCKED',
  DEAL = 'DEAL',
  HAND_PLAY = 'HAND_PLAY',
  HAND_RESOLVED = 'HAND_RESOLVED',
  GAME_OVER = 'GAME_OVER',
  PAYOUT_DONE = 'PAYOUT_DONE',
  ABANDONED = 'ABANDONED',
  CANCELLED = 'CANCELLED',
}

/**
 * State machine del match de Truco. Patrón equivalente a `GameStateMachine`
 * (src/domain/GameState.ts) — valida transiciones legales server-side.
 */
export class TrucoStateMachine {
  private static readonly validTransitions: Record<TrucoMatchStatus, TrucoMatchStatus[]> = {
    [TrucoMatchStatus.MATCH_QUEUED]: [
      TrucoMatchStatus.MATCH_FOUND,
      TrucoMatchStatus.CANCELLED,
    ],
    [TrucoMatchStatus.MATCH_FOUND]: [
      TrucoMatchStatus.BET_LOCKED,
      TrucoMatchStatus.CANCELLED,
    ],
    [TrucoMatchStatus.BET_LOCKED]: [
      TrucoMatchStatus.DEAL,
      TrucoMatchStatus.CANCELLED,
    ],
    [TrucoMatchStatus.DEAL]: [TrucoMatchStatus.HAND_PLAY],
    [TrucoMatchStatus.HAND_PLAY]: [
      TrucoMatchStatus.HAND_RESOLVED,
      // Un envido (típicamente falta envido) puede cerrar la partida en plena
      // mano, antes de que se resuelva el truco: HAND_PLAY → GAME_OVER directo.
      TrucoMatchStatus.GAME_OVER,
      TrucoMatchStatus.ABANDONED,
    ],
    [TrucoMatchStatus.HAND_RESOLVED]: [
      TrucoMatchStatus.DEAL,
      TrucoMatchStatus.GAME_OVER,
      TrucoMatchStatus.ABANDONED,
    ],
    [TrucoMatchStatus.GAME_OVER]: [TrucoMatchStatus.PAYOUT_DONE],
    [TrucoMatchStatus.ABANDONED]: [TrucoMatchStatus.PAYOUT_DONE],
    [TrucoMatchStatus.PAYOUT_DONE]: [],
    [TrucoMatchStatus.CANCELLED]: [],
  };

  static canTransition(current: TrucoMatchStatus, next: TrucoMatchStatus): boolean {
    return this.validTransitions[current].includes(next);
  }

  static validateTransition(current: TrucoMatchStatus, next: TrucoMatchStatus): void {
    if (!this.canTransition(current, next)) {
      throw new Error(`Transición inválida: ${current} → ${next}`);
    }
  }

  static isTerminal(status: TrucoMatchStatus): boolean {
    return (
      status === TrucoMatchStatus.PAYOUT_DONE ||
      status === TrucoMatchStatus.CANCELLED
    );
  }
}
