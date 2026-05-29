import { INotificationProvider } from './INotificationProvider';
import type { BingoButton, BingoListSection } from '../types/InteractiveMessage';

export interface WhatsAppProvider extends INotificationProvider {
  /**
   * Send a standard plain text message
   */
  sendMessage(to: string, text: string): Promise<boolean>;

  /**
   * Send an audio as Voice Note (PTT)
   */
  sendAudio(to: string, buffer: Buffer): Promise<boolean>;

  /**
   * Register a callback listener for incoming chat messages
   */
  onMessage(callback: (from: string, body: string) => Promise<void>): void;

  /**
   * Send an interactive button message (up to 3 buttons).
   * Falls back to numbered text list if unavailable.
   */
  sendButtons(to: string, text: string, buttons: BingoButton[], footer?: string): Promise<boolean>;

  /**
   * Send an interactive list message (up to 10 rows per section).
   * Falls back to numbered text list if unavailable.
   */
  sendList(
    to: string,
    text: string,
    buttonLabel: string,
    sections: BingoListSection[],
    title?: string,
    footer?: string,
  ): Promise<boolean>;
}
