import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { INotificationProvider } from './INotificationProvider';
import { logger } from '../../utils/logger';

export class WhatsAppWebProvider implements INotificationProvider {
  private client: Client;
  private isReady: boolean = false;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.setupEvents();
  }

  private setupEvents() {
    this.client.on('qr', (qr) => {
      logger.info('[WhatsAppWebProvider] QR Code received. Please scan it!');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      logger.info('[WhatsAppWebProvider] Client is ready and connected via QR!');
      this.isReady = true;
    });

    this.client.on('message', async (message) => {
      if (message.isGroupMsg) return;
      
      const from = message.from.replace('@c.us', '');
      const input = message.body;

      logger.info({ from, input }, '[WhatsAppWebProvider] Inbound message received, enqueuing...');

      const { whatsappInboundQueue } = await import('../../queue');
      await whatsappInboundQueue.add('inbound_message', { from, input });
    });
  }

  public async initialize(): Promise<void> {
    logger.info('[WhatsAppWebProvider] Initializing...');
    await this.client.initialize();
  }

  public async sendText(to: string, text: string): Promise<void> {
    if (!this.isReady) throw new Error('WhatsAppWebProvider is not ready yet');
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    await this.client.sendMessage(chatId, text);
  }

  public async sendMedia(to: string, filePath: string, caption?: string): Promise<void> {
    if (!this.isReady) throw new Error('WhatsAppWebProvider is not ready yet');
    try {
      const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
      const absolutePath = path.resolve(filePath);
      const media = MessageMedia.fromFilePath(absolutePath);
      await this.client.sendMessage(chatId, media, { caption });
    } catch (e: any) {
      logger.error({ to, filePath, error: e.message }, '[WhatsAppWebProvider] Failed to send media');
      throw e;
    }
  }
}

export const whatsAppProvider = new WhatsAppWebProvider();
