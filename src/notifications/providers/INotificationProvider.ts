import type { BingoButton, BingoListSection } from '../types/InteractiveMessage';

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
   * Send an interactive button message (up to 3 buttons).
   * Falls back to numbered text list if not supported.
   */
  sendButtons?(to: string, text: string, buttons: BingoButton[], footer?: string): Promise<boolean>;

  /**
   * Send an interactive list message (up to 10 rows per section).
   * Falls back to numbered text list if not supported.
   */
  sendList?(
    to: string,
    text: string,
    buttonLabel: string,
    sections: BingoListSection[],
    title?: string,
    footer?: string,
  ): Promise<boolean>;
}
