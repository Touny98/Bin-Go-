import { logger } from '../../utils/logger';

/**
 * Trazabilidad estructurada del flujo en tiempo real del Truco.
 *
 * `truco_actions` (ordenado por sequence_number) ya es el log append-only de
 * eventos de juego para replay/auditoría. Lo que esa tabla NO captura es la
 * dimensión de transporte: qué mensaje entró, en qué orden se enviaron las
 * salidas, qué se descartó y por qué. Este helper llena ese hueco con logs
 * estructurados correlacionables por `matchId` (o por `phone` cuando todavía
 * no hay match).
 *
 * Todos los eventos llevan la marca `trc: 'truco'` para poder filtrarlos:
 *   pino → `... | grep '"trc":"truco"'`  o  por matchId.
 */

export type TrucoTraceEvent =
  // entrada
  | 'inbound_received'
  | 'inbound_deduped' // re-entrega de Meta ignorada
  | 'inbound_busy_requeue' // usuario ocupado → re-encolado sin pérdida
  | 'inbound_busy_dropped' // se agotaron los reintentos de re-encolado
  // procesamiento
  | 'command_result'
  | 'command_discarded' // acción inválida (no es tu turno, canto pendiente, etc.)
  | 'idempotent_replay' // misma acción física reprocesada → no-op
  // salida
  | 'outbound_enqueued'
  | 'outbound_delivered'
  | 'outbound_gate_requeue' // todavía no es la cabeza FIFO de ese teléfono
  | 'outbound_retry'
  | 'critical_delivery_failed' // se agotaron los reintentos: la red de seguridad (reprompt) cubre
  // acuses de Meta (observabilidad)
  | 'meta_status';

export interface TrucoTraceFields {
  matchId?: string;
  /** sequence_number de truco_actions, cuando aplica. */
  seq?: number;
  phone?: string;
  /** message.id de Meta — correlaciona entrada/acuse. */
  messageId?: string;
  /** secuencia FIFO de salida por destinatario. */
  outSeq?: number;
  fromState?: string;
  toState?: string;
  /** tipo de descriptor de turno (WAITING_FOR_CARD, GAME_OVER, …) o de comando. */
  kind?: string;
  /** motivo de descarte / código de error. */
  reason?: string;
  latencyMs?: number;
  jobName?: string;
  attempt?: number;
  /** texto libre extra. */
  detail?: string;
}

export class TrucoTrace {
  /**
   * Emite un evento de traza. Usa warn para descartes/fallos y debug para el
   * ruido de la compuerta FIFO; el resto va a info.
   */
  static event(event: TrucoTraceEvent, fields: TrucoTraceFields = {}): void {
    const payload = { trc: 'truco', event, ...fields };
    switch (event) {
      case 'inbound_busy_dropped':
      case 'critical_delivery_failed':
        logger.warn(payload, `[TrucoTrace] ${event}`);
        break;
      case 'command_discarded':
      case 'outbound_retry':
        logger.warn(payload, `[TrucoTrace] ${event}`);
        break;
      case 'outbound_gate_requeue':
      case 'inbound_busy_requeue':
        logger.debug(payload, `[TrucoTrace] ${event}`);
        break;
      default:
        logger.info(payload, `[TrucoTrace] ${event}`);
    }
  }
}
