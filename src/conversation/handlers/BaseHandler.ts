import { UserSession } from '../SessionStore';
import { IntentType } from '../IntentRouter';
import type { ButtonsPayload, ListPayload } from '../../notifications/types/InteractiveMessage';

export interface HandlerResponse {
  nextState?: string;
  nextContext?: any;
  /** Texto plano — siempre requerido como fallback */
  message?: string;
  /**
   * Si está presente, se envía un mensaje con botones interactivos
   * en lugar del texto plano. El campo `message` actúa como fallback.
   */
  buttons?: ButtonsPayload;
  /**
   * Si está presente, se envía un mensaje de lista interactiva
   * en lugar del texto plano. El campo `message` actúa como fallback.
   */
  list?: ListPayload;
  /**
   * Mensaje secundario con botones de navegación enviado justo después
   * del mensaje principal (volver atrás / cambiar de juego).
   */
  followUp?: ButtonsPayload;
  /**
   * Si es true, no se envía mensaje de respuesta inline al usuario.
   * Útil cuando el handler ya empujó notificaciones por canal lateral
   * (ej. push messages del Truco vía TrucoNotifier).
   */
  silent?: boolean;
}

/**
 * Metadatos del mensaje entrante que el Orchestrator propaga al handler.
 * `messageId` es el `message.id` de Meta (wamid…): permite derivar claves de
 * idempotencia deterministas por acción física (ver TrucoGameHandler).
 */
export interface HandlerMeta {
  messageId?: string;
}

export abstract class BaseHandler {
  /**
   * Main entry point for any state handler.
   *
   * `meta` es opcional para no romper los handlers existentes; los que
   * necesitan idempotencia por mensaje (Truco) leen `meta.messageId`.
   */
  public abstract handle(
    session: UserSession,
    intent: IntentType,
    rawInput: string,
    meta?: HandlerMeta
  ): Promise<HandlerResponse>;

  /**
   * Devuelve el número de teléfono real del usuario.
   *
   * Si la sesión ya tiene un teléfono resuelto (guardado por el Orchestrator
   * cuando mapeó un JID @lid al número real), lo usa directamente.
   * Caso contrario extrae el número del userId quitando el sufijo de JID.
   *
   * Esto es necesario porque WhatsApp multi-device envía JIDs en formato
   * @lid (ej. '173650393178254@lid'): el número en sí NO es el teléfono real.
   */
  protected getPhone(session: UserSession): string {
    if (session.context?.resolvedPhone) return session.context.resolvedPhone;
    return session.userId
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/@lid$/, '');
  }
}
