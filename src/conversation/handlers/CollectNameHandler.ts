import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';
import { query } from '../../db';

export class CollectNameHandler extends BaseHandler {
  public async handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string
  ): Promise<HandlerResponse> {

    if (intent === 'CANCEL' || intent === 'GOTO_MENU') {
      return { nextState: 'MAIN_MENU', message: Templates.MAIN_MENU() };
    }

    const name = rawInput.trim();
    if (name.length < 2 || name.length > 100) {
      return {
        message: `Por favor, ingresá tu nombre completo (entre 2 y 100 caracteres).\n\nO escribí *MENU* para saltar este paso.`
      };
    }

    const phone = this.getPhone(session);
    await query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phone]);

    return {
      nextState: 'MAIN_MENU',
      message: Templates.WELCOME_WITH_NAME(name)
    };
  }
}
