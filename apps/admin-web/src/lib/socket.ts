import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

class SocketClient {
  private static instance: Socket | null = null;

  public static getInstance(): Socket {
    if (!this.instance) {
      this.instance = io(SOCKET_URL, {
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5,
        timeout: 20000,
        autoConnect: true,
      });

      this.instance.on('connect', () => {
        console.log('[SocketClient] Connected to gateway:', this.instance?.id);
      });

      this.instance.on('disconnect', (reason) => {
        console.warn('[SocketClient] Disconnected:', reason);
      });

      this.instance.on('connect_error', (error) => {
        console.error('[SocketClient] Connection Error:', error.message);
      });
    }
    return this.instance;
  }
}

export const socket = SocketClient.getInstance();
