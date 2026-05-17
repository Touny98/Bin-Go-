export enum GameStatus {
  CREATED = 'CREATED',
  WAITING_PLAYERS = 'WAITING_PLAYERS',
  READY = 'READY',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  FINAL_ROUND = 'FINAL_ROUND',
  WINNER_PENDING_VALIDATION = 'WINNER_PENDING_VALIDATION',
  FINISHED = 'FINISHED',
  ARCHIVED = 'ARCHIVED'
}

export class GameStateMachine {
  private static validTransitions: Record<GameStatus, GameStatus[]> = {
    [GameStatus.CREATED]: [GameStatus.WAITING_PLAYERS],
    [GameStatus.WAITING_PLAYERS]: [GameStatus.READY],
    [GameStatus.READY]: [GameStatus.STARTING],
    [GameStatus.STARTING]: [GameStatus.RUNNING],
    [GameStatus.RUNNING]: [GameStatus.FINAL_ROUND, GameStatus.WINNER_PENDING_VALIDATION],
    [GameStatus.FINAL_ROUND]: [GameStatus.WINNER_PENDING_VALIDATION],
    [GameStatus.WINNER_PENDING_VALIDATION]: [GameStatus.FINISHED, GameStatus.RUNNING], // Can go back to running if validation fails
    [GameStatus.FINISHED]: [GameStatus.ARCHIVED],
    [GameStatus.ARCHIVED]: []
  };

  public static canTransition(current: GameStatus, next: GameStatus): boolean {
    return this.validTransitions[current].includes(next);
  }

  public static validateTransition(current: GameStatus, next: GameStatus): void {
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid state transition from ${current} to ${next}`);
    }
  }
}
