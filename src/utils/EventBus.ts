import { EventEmitter } from 'events';
import { logger } from './logger';

export interface AppEvents {
  'game.created': { gameId: number; roomId: number; scheduledAt: Date };
  'game.started': { gameId: number; startTime: Date };
  'ball.drawn': { gameId: number; number: number; drawOrder: number };
  'winner.detected': { gameId: number; cardId: number; userId: string; type: 'line' | 'bingo' };
  'payment.confirmed': { paymentId: string; userId: string; amount: number };
  'player.near_win': { gameId: number; userId: string; remaining: number; lastNumberNeeded: number | null };
  'game.finished': { gameId: number; endTime: Date };
}

class InternalEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners if needed
    this.setMaxListeners(20);
  }

  public publish<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    logger.debug({ event, payload }, `[EventBus] Publishing event: ${event}`);
    this.emit(event, payload);
  }

  public subscribe<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
    this.on(event, listener);
  }

  public unsubscribe<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
    this.off(event, listener);
  }
}

export const eventBus = new InternalEventBus();
