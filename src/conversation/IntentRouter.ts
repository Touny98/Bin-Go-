export type IntentType = 
  | 'GOTO_MENU' 
  | 'VIEW_ROOMS' 
  | 'BUY_CARDS' 
  | 'VIEW_PROFILE' 
  | 'HELP' 
  | 'CONFIRM' 
  | 'CANCEL' 
  | 'UNKNOWN';

export class IntentRouter {
  /**
   * Simple Keyword-based Intent Routing
   */
  public static route(input: string): IntentType {
    const text = input.trim().toLowerCase();

    if (['menu', 'inicio', '0'].includes(text)) return 'GOTO_MENU';
    if (['1', 'salas', 'jugar'].includes(text)) return 'VIEW_ROOMS';
    if (['2', 'comprar', 'tickets'].includes(text)) return 'BUY_CARDS';
    if (['3', 'perfil', 'saldo', 'mi cuenta'].includes(text)) return 'VIEW_PROFILE';
    if (['4', 'ayuda', 'soporte', 'help'].includes(text)) return 'HELP';
    if (['si', 'confirmar', 'ok', 'yes'].includes(text)) return 'CONFIRM';
    if (['no', 'cancelar', 'abortar'].includes(text)) return 'CANCEL';

    return 'UNKNOWN';
  }
}
