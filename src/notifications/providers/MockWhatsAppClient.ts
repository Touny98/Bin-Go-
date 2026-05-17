import { logger } from '../../utils/logger';

export class MockWhatsAppClient {
  private qrCallback?: (qr: string) => void;
  private readyCallback?: () => void;
  private messageCallback?: (msg: any) => void;

  public on(event: string, callback: (...args: any[]) => void) {
    if (event === 'qr') this.qrCallback = callback;
    if (event === 'ready') this.readyCallback = callback;
    if (event === 'message') this.messageCallback = callback;
  }

  public async initialize(): Promise<void> {
    logger.info('[MockWhatsAppClient] Starting initialization in MOCK mode...');
    
    // Simulate QR code event
    setTimeout(() => {
      if (this.qrCallback) {
        logger.info('[MockWhatsAppClient] [MOCK_QR] Generated QR: MOCK_BINGO_QR_CODE');
        this.qrCallback('MOCK_BINGO_QR_CODE');
      }
    }, 100);

    // Simulate ready status
    setTimeout(() => {
      if (this.readyCallback) {
        logger.info('[MockWhatsAppClient] [MOCK_READY] Client connection established successfully');
        this.readyCallback();
      }
    }, 500);
  }

  public async sendMessage(chatId: string, content: any, options?: any): Promise<any> {
    const messageType = typeof content === 'string' ? 'TEXT' : 'MEDIA';
    logger.info(
      { chatId, type: messageType, payload: typeof content === 'string' ? content : '[MessageMedia]', options },
      `[MockWhatsAppClient] [OUTBOUND] Message sent successfully`
    );
    return { id: { id: `MOCK_MSG_${Date.now()}` } };
  }

  /**
   * Helper to programmatically simulate an inbound message from a user number
   */
  public triggerSimulatedMessage(from: string, body: string) {
    if (this.messageCallback) {
      logger.info({ from, body }, '[MockWhatsAppClient] [INBOUND] Simulating message received');
      this.messageCallback({
        from: from.includes('@c.us') ? from : `${from}@c.us`,
        body,
        isGroupMsg: false,
      });
    }
  }
}
