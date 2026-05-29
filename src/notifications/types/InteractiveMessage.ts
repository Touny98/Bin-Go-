/**
 * InteractiveMessage.ts
 *
 * Tipos compartidos para mensajes interactivos de WhatsApp (botones y listas).
 * Usados por MetaCloudProvider, NotificationWorker y ConversationOrchestrator.
 */

export interface BingoButton {
  /** Valor que se recibe cuando el usuario toca el botón (debe ser único por mensaje) */
  id: string;
  /** Texto visible en el botón */
  label: string;
}

export interface BingoListRow {
  /** Valor que se recibe cuando el usuario selecciona la fila */
  id: string;
  /** Título principal de la fila */
  title: string;
  /** Descripción secundaria (opcional) */
  description?: string;
}

export interface BingoListSection {
  /** Título de la sección (opcional) */
  title?: string;
  rows: BingoListRow[];
}

/** Payload completo de un mensaje de botones para la cola */
export interface ButtonsPayload {
  text: string;
  buttons: BingoButton[];
  footer?: string;
}

/** Payload completo de un mensaje de lista para la cola */
export interface ListPayload {
  text: string;
  buttonLabel: string;
  sections: BingoListSection[];
  title?: string;
  footer?: string;
}
