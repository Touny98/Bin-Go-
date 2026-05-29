import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { connection } from '../queue';
import { logger } from '../utils/logger';
import { PresenceService } from './PresenceService';
import { Server as HttpServer } from 'http';

export class SocketServer {
  private static io: Server;

  public static initialize(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Redis Adapter for Horizontal Scaling
    const pubClient = connection.duplicate();
    const subClient = connection.duplicate();
    this.io.adapter(createAdapter(pubClient, subClient));

    this.setupEvents();
    logger.info('[SocketServer] WebSocket server initialized with Redis adapter');
  }

  private static setupEvents() {
    this.io.on('connection', (socket) => {
      const userId = socket.handshake.query.userId as string || 'anonymous';
      logger.debug({ socketId: socket.id, userId }, '[SocketServer] Client connected');

      // Join global room
      socket.join('global');
      PresenceService.trackConnection(userId);

      // Admin dashboard room
      socket.on('join_room', (roomName: string) => {
        socket.join(roomName);
        logger.debug({ userId, roomName }, '[SocketServer] Socket joined room');
      });

      socket.on('join_game', async (gameId: string) => {
        socket.join(`game:${gameId}`);
        await PresenceService.trackConnection(userId, gameId);
        logger.info({ userId, gameId }, '[SocketServer] User joined game room');
      });

      socket.on('leave_game', async (gameId: string) => {
        socket.leave(`game:${gameId}`);
        await PresenceService.trackDisconnect(userId, gameId);
      });

      socket.on('disconnect', () => {
        PresenceService.trackDisconnect(userId);
        logger.debug({ socketId: socket.id }, '[SocketServer] Client disconnected');
      });
    });
  }

  public static getInstance(): Server {
    if (!this.io) throw new Error('SocketServer not initialized');
    return this.io;
  }

  /**
   * Safe broadcast to specific room
   */
  public static emitToRoom(room: string, event: string, payload: any) {
    if (this.io) {
      this.io.to(room).emit(event, payload);
    }
  }

  /**
   * Safe broadcast to global
   */
  public static emitGlobal(event: string, payload: any) {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}
