import { INotificationProvider } from './INotificationProvider';

export class MetaCloudProvider implements INotificationProvider {
  public async initialize(): Promise<void> {
    // Placeholder for API key validation
    console.log('[MetaCloudProvider] Initialized (Placeholder)');
  }

  public async sendText(to: string, text: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
}
