import { IStorageProvider } from './IStorageProvider';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger';

export class LocalStorageProvider implements IStorageProvider {
  private readonly storageDir: string;

  constructor() {
    this.storageDir = path.resolve('assets/renders');
  }

  public async save(filename: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.storageDir, filename);
    await fs.writeFile(fullPath, buffer);
    logger.debug({ filename }, '[LocalStorageProvider] File saved');
    return fullPath;
  }

  public get(filename: string): string {
    return path.join(this.storageDir, filename);
  }

  public async delete(filename: string): Promise<void> {
    const fullPath = path.join(this.storageDir, filename);
    try {
      await fs.unlink(fullPath);
      logger.debug({ filename }, '[LocalStorageProvider] File deleted');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error({ filename, error: error.message }, '[LocalStorageProvider] Failed to delete file');
      }
    }
  }
}

export const storageProvider = new LocalStorageProvider();
