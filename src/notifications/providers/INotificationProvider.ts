export interface INotificationProvider {
  /**
   * Initialize the provider connection (e.g., scan QR, authenticate)
   */
  initialize(): Promise<void>;

  /**
   * Send a plain text message
   */
  sendText(to: string, text: string): Promise<boolean>;

  /**
   * Send a media message with optional caption
   */
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<boolean>;
}
