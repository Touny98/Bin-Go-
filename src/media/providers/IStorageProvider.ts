export interface IStorageProvider {
  /**
   * Saves a buffer to the storage and returns a reference (path or URL)
   */
  save(filename: string, buffer: Buffer): Promise<string>;

  /**
   * Retrieves a full path or URL for the stored file
   */
  get(filename: string): string;

  /**
   * Deletes a file from storage
   */
  delete(filename: string): Promise<void>;
}
