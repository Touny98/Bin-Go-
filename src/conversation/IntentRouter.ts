export type IntentType =
  | 'GOTO_MENU'
  | 'VIEW_ROOMS'
  | 'BUY_CARDS'
  | 'VIEW_PROFILE'
  | 'PLAY_TRUCO'
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

    if (['menu', 'inicio', '0', 'atrás', 'atras', 'volver'].includes(text)) return 'GOTO_MENU';
    if (['1', 'salas', 'jugar', 'bingo', 'jugar bingo', 'ver bingo'].includes(text)) return 'VIEW_ROOMS';
    if (['comprar', 'tickets'].includes(text)) return 'BUY_CARDS';
    if (['3', 'perfil', 'mi cuenta'].includes(text)) return 'VIEW_PROFILE';
    if (['2', '4', 'truco', 'play_truco', 'jugar truco'].includes(text)) return 'PLAY_TRUCO';
    if (['5', 'ayuda', 'soporte', 'help'].includes(text)) return 'HELP';
    if (['si', 'confirmar', 'ok', 'yes'].includes(text)) return 'CONFIRM';
    if (['no', 'cancelar', 'abortar'].includes(text)) return 'CANCEL';

    return 'UNKNOWN';
  }
}
