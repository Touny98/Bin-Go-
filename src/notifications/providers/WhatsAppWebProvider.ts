import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { WhatsAppProvider } from './WhatsAppProvider';
import { MockWhatsAppClient } from './MockWhatsAppClient';
import { logger } from '../../utils/logger';

export class WhatsAppWebProvider implements WhatsAppProvider {
  private client: any;
  private isReady: boolean = false;
  private messageCallbacks: ((from: string, body: string) => Promise<void>)[] = [];

  constructor() {
    const isMock = process.env.WHATSAPP_MOCK === 'true';
    
    if (isMock) {
      this.client = new MockWhatsAppClient();
    } else {
      this.client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      });
    }

    this.setupEvents();
  }

  private setupEvents() {
    this.client.on('qr', (qr: string) => {
      logger.info('[WhatsAppWebProvider] QR Code received. Please scan it!');
      if (process.env.WHATSAPP_MOCK !== 'true') {
        qrcode.generate(qr, { small: true });
      }
    });

    this.client.on('ready', () => {
      logger.info('[WhatsAppWebProvider] Client is ready and connected!');
      this.isReady = true;
    });

    this.client.on('message', async (message: any) => {
      if (message.from && message.from.endsWith('@g.us')) return;
      
      const from = message.from ? message.from.replace('@c.us', '') : 'unknown';
      const input = message.body || '';

      logger.info({ from, input }, '[WhatsAppWebProvider] Inbound message received, enqueuing...');

      // Trigger custom onMessage callback subscribers
      for (const cb of this.messageCallbacks) {
        try {
          await cb(from, input);
        } catch (e: any) {
          logger.error({ error: e.message }, '[WhatsAppWebProvider] Callback subscriber failed');
        }
      }

      const { whatsappInboundQueue } = await import('../../queue');
      await whatsappInboundQueue.add('inbound_message', { from, input });
    });
  }

  public async initialize(): Promise<void> {
    logger.info('[WhatsAppWebProvider] Initializing connection...');
    await this.client.initialize();
  }

  // --- INotificationProvider Contract ---

  public async sendText(to: string, text: string): Promise<boolean> {
    return this.sendMessage(to, text);
  }

  public async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<boolean> {
    return this.sendImage(to, mediaUrl, caption);
  }

  // --- WhatsAppProvider Contract ---

  public async sendMessage(to: string, text: string): Promise<boolean> {
    if (!this.isReady) {
      logger.warn('[WhatsAppWebProvider] Attempting to send message before ready state, waiting...');
    }
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    await this.client.sendMessage(chatId, text);
    return true;
  }

  public async sendImage(to: string, mediaPath: string, caption?: string): Promise<boolean> {
    if (!this.isReady) {
      logger.warn('[WhatsAppWebProvider] Attempting to send image before ready state, waiting...');
    }
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    
    // In mock mode, we bypass MessageMedia.fromFilePath to avoid local file IO crashes
    if (process.env.WHATSAPP_MOCK === 'true') {
      await this.client.sendMessage(chatId, `[Simulated Image: ${mediaPath}] ${caption || ''}`);
      return true;
    }

    try {
      const absolutePath = path.resolve(mediaPath);
      const media = MessageMedia.fromFilePath(absolutePath);
      await this.client.sendMessage(chatId, media, { caption });
      return true;
    } catch (e: any) {
      logger.error({ to, mediaPath, error: e.message }, '[WhatsAppWebProvider] Failed to send image media');
      throw e;
    }
  }

  public onMessage(callback: (from: string, body: string) => Promise<void>): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Helper to manually trigger an inbound message (exclusively used for testing & flow simulation)
   */
  public triggerMockMessage(from: string, body: string) {
    if (this.client && typeof this.client.triggerSimulatedMessage === 'function') {
      this.client.triggerSimulatedMessage(from, body);
    } else {
      logger.warn('[WhatsAppWebProvider] triggerMockMessage called but client is not in Mock mode.');
    }
  }
}

export const whatsAppProvider = new WhatsAppWebProvider();
