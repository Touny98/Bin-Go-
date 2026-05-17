import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { whatsappInboundQueue, analyticsQueue } from '../queue';
import { logger } from '../utils/logger';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export class WhatsAppService {
  private static client: Client;

  public static initialize() {
    logger.info('[WhatsAppService] Initializing QR Client...');

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.client.on('qr', (qr) => {
      logger.info('[WhatsAppService] QR Code received. Please scan it!');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      logger.info('[WhatsAppService] Client is ready and connected via QR!');
    });

    this.client.on('message', async (message) => {
      // Ignore group messages or statuses
      if (message.isGroupMsg) return;

      const from = message.from; // Contains @c.us
      const input = message.body.toLowerCase();

      logger.info({ from, input }, '[WhatsAppService] Received message');

      // 1. Emit to inbound queue for conversational processing
      await whatsappInboundQueue.add('process_message', {
        from: from.replace('@c.us', ''),
        input
      });

      // 2. Emit to analytics
      await analyticsQueue.add('analytics_event', {
        eventType: 'user.interaction',
        data: {
          userId: from.replace('@c.us', ''),
          input
        }
      });
    });

    this.client.initialize();
  }

  public static async sendTextMessage(to: string, text: string) {
    if (!this.client) {
      logger.error('[WhatsAppService] Client not initialized');
      return;
    }
    
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    await this.client.sendMessage(chatId, text);
    logger.info({ to: chatId }, '[WhatsAppService] Message sent');
  }

  public static async sendMediaMessage(to: string, text: string, mediaPath: string) {
    if (!this.client) {
      logger.error('[WhatsAppService] Client not initialized');
      return;
    }

    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    const absolutePath = path.resolve(mediaPath);
    
    try {
      const media = MessageMedia.fromFilePath(absolutePath);
      await this.client.sendMessage(chatId, media, { caption: text });
      logger.info({ to: chatId, mediaPath }, '[WhatsAppService] Media message sent');
    } catch (error: any) {
      logger.error({ error: error.message, mediaPath }, '[WhatsAppService] Failed to load or send media');
      // Fallback to text
      await this.sendTextMessage(to, text);
    }
  }
}
