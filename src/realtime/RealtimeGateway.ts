import { eventBus } from '../utils/EventBus';
import { SocketServer } from './SocketServer';
import { logger } from '../utils/logger';

export class RealtimeGateway {
  /**
   * Subscribes to the internal EventBus and forwards to WebSockets
   */
  public static initialize() {
    logger.info('[RealtimeGateway] Binding internal events to WebSockets...');

    eventBus.subscribe('ball.drawn', (payload) => {
      SocketServer.emitToRoom(`game:${payload.gameId}`, 'ball_drawn', payload);
    });

    eventBus.subscribe('winner.detected', (payload) => {
      SocketServer.emitToRoom(`game:${payload.gameId}`, 'winner_detected', payload);
      SocketServer.emitGlobal('global_winner', payload);
    });

    eventBus.subscribe('game.started', (payload) => {
      SocketServer.emitToRoom(`game:${payload.gameId}`, 'game_started', payload);
      SocketServer.emitGlobal('room_status_change', { gameId: payload.gameId, status: 'IN_PROGRESS' });
    });

    eventBus.subscribe('player.near_win', (payload) => {
      // Only emit to the specific game room, but it's a "public" near win alert for spectators
      SocketServer.emitToRoom(`game:${payload.gameId}`, 'near_win_alert', {
        userIdHash: payload.userId.substring(0, 4) + '***', // Obfuscated
        remaining: payload.remaining
      });
    });

    eventBus.subscribe('payment.confirmed', (payload) => {
      // Notify the specific user via their private socket (if connected)
      // This is optional since we already notify via WhatsApp
      SocketServer.emitGlobal('payment_activity', { amount: payload.amount });
    });
  }
}
