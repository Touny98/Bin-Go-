import { BaseHandler, HandlerResponse } from './BaseHandler';
import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import { Templates } from '../templates/MessageTemplates';

export class MainMenuHandler extends BaseHandler {
  public async handle(
    session: UserSession, 
    intent: IntentType, 
    rawInput: string
  ): Promise<HandlerResponse> {
    
    switch (intent) {
      case 'VIEW_ROOMS':
      case 'BUY_CARDS':
        return {
          nextState: 'ROOM_BROWSER',
          message: Templates.ROOM_LIST([{ name: 'Sala Premium', card_price: 500 }])
        };

      case 'VIEW_PROFILE':
        return {
          message: `👤 *TU PERFIL*\n\nNúmero: ${session.userId}\nSaldo: $0.00\nCartones activos: 0`
        };

      case 'HELP':
        return {
          message: `🛠️ *SOPORTE*\n\nSi tienes problemas, contacta a nuestro equipo administrador.\nEscribe MENU para volver.`
        };

      default:
        return {
          message: Templates.MAIN_MENU()
        };
    }
  }
}
