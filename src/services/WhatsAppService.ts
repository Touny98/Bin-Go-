import { metaCloudProvider as whatsAppProvider } from '../notifications/providers/MetaCloudProvider';
import { analyticsQueue } from '../queue';
import { logger } from '../utils/logger';

export class WhatsAppService {
  /**
   * Decoupled initialization that hooks into the central WhatsApp provider
   */
  public static initialize() {
    logger.info('[WhatsAppService] Binding system-wide events to WhatsApp Provider...');
    
    // Hook inbound messages to analytics tracking
    whatsAppProvider.onMessage(async (from, input) => {
      logger.info({ from, input: input.toLowerCase() }, '[WhatsAppService] Logging interaction event');

      try {
        await analyticsQueue.add('analytics_event', {
          eventType: 'user.interaction',
          data: {
            userId: from,
            input: input.toLowerCase()
          }
        });
      } catch (error: any) {
        logger.error({ error: error.message }, '[WhatsAppService] Failed to queue analytics interaction');
      }
    });
  }

  public static async sendTextMessage(to: string, text: string): Promise<boolean> {
    return whatsAppProvider.sendMessage(to, text);
  }

  public static async sendMediaMessage(to: string, text: string, mediaPath: string): Promise<boolean> {
    return whatsAppProvider.sendImage(to, mediaPath, text);
  }
}
