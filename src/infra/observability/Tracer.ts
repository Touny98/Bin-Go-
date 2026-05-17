import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<Map<string, string>>();

export class Tracer {
  /**
   * Starts a new trace context
   */
  public static runWithTraceId(callback: () => void, existingTraceId?: string) {
    const traceId = existingTraceId || uuidv4();
    const store = new Map();
    store.set('traceId', traceId);
    storage.run(store, callback);
  }

  /**
   * Gets the current trace ID from the context
   */
  public static getTraceId(): string | undefined {
    return storage.getStore()?.get('traceId');
  }

  /**
   * Injects trace ID into job data
   */
  public static inject(data: any): any {
    const traceId = this.getTraceId();
    if (traceId) {
      return { ...data, _traceId: traceId };
    }
    return data;
  }
}
