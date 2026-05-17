import { INotificationProvider } from './INotificationProvider';

export interface WhatsAppProvider extends INotificationProvider {
  /**
   * Send a standard plain text message
   */
  sendMessage(to: string, text: string): Promise<boolean>;

  /**
   * Send a local image or graphic with an optional caption
   */
  sendImage(to: string, mediaPath: string, caption?: string): Promise<boolean>;

  /**
   * Register a callback listener for incoming chat messages
   */
  onMessage(callback: (from: string, body: string) => Promise<void>): void;
}
