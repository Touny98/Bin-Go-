import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';

export interface HandlerResponse {
  nextState?: string;
  nextContext?: any;
  message?: string;
}

export abstract class BaseHandler {
  /**
   * Main entry point for any state handler
   */
  public abstract handle(
    session: UserSession, 
    intent: IntentType, 
    rawInput: string
  ): Promise<HandlerResponse>;
}
