import { io, Socket } from 'socket.io-client';

// Conectar al mismo origen del panel admin (vacío = origen actual del browser).
// Next.js reescribe /socket.io/* → http://app:3010/socket.io/* en el servidor,
// por lo que funciona tanto en localhost como a través de cualquier túnel ngrok.
const SOCKET_URL = typeof window !== 'undefined' ? window.location.origin : '';

class SocketClient {
  private static instance: Socket | null = null;

  public static getInstance(): Socket {
    if (!this.instance) {
      this.instance = io(SOCKET_URL, {
        path: '/socket.io',
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
