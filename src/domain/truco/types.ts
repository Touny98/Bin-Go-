import {
  BazaWinner,
  Card,
  EnvidoLevel,
  PlayerSeat,
  TrucoLevel,
} from '../../engine/truco/types';
import { TrucoMatchStatus } from '../../engine/truco/TrucoStateMachine';

export interface TrucoMatchRow {
  id: string;
  player_a_phone: string;
  player_b_phone: string;
  bet_amount: number;
  pot_amount: number;
  fee_pct: number;
  fee_amount: number | null;
  status: TrucoMatchStatus;
  score_a: number;
  score_b: number;
  target_score: number;
  current_hand_id: string | null;
  mano_phone: string | null;
  current_turn_phone: string | null;
  winner_phone: string | null;
  abandoned_by_phone: string | null;
  deck_seed: string;
  integrity_hash: string;
  version: number;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface TrucoHandRow {
  id: string;
  match_id: string;
  hand_number: number;
  mano_phone: string;
  cards_a: Card[];
  cards_b: Card[];
  baza_winners: BazaPlayed[];
  envido_state: EnvidoState | null;
  truco_level: TrucoLevel;
  truco_state: TrucoState | null;
  hand_winner_phone: string | null;
  points_truco: number | null;
  points_envido: number | null;
  started_at: Date;
  finished_at: Date | null;
}

export interface BazaPlayed {
  baza: 1 | 2 | 3;
  cardA?: Card;
  cardB?: Card;
  winner?: BazaWinner;
}

export interface EnvidoState {
  /** Nivel del último canto de la cadena (el pendiente de respuesta). */
  level: EnvidoLevel;
  /** Asiento que hizo el último canto (a quien se le responde es su rival). */
  offeredBy: PlayerSeat;
  accepted: boolean | null;
  scoreA?: number;
  scoreB?: number;
  winner?: PlayerSeat;
  points: number;
  /** Puntos en juego si el canto pendiente se acepta. */
  acceptValue?: number;
  /** Puntos que entrega quien rechaza el canto pendiente ("no quiero"). */
  declineValue?: number;
  /** Cantidad de "ENVIDO" cantados en la cadena (máx 2: envido envido). */
  envidoCount?: number;
}

export interface TrucoState {
  level: TrucoLevel;
  lastCaller: PlayerSeat | null;
  accepted: boolean | null;
}

export type TrucoActionType =
  | 'PLAY_CARD'
  | 'CALL_TRUCO'
  | 'CALL_RETRUCO'
  | 'CALL_VALE4'
  | 'ACCEPT_TRUCO'
  | 'DECLINE_TRUCO'
  | 'CALL_ENVIDO'
  | 'CALL_REAL_ENVIDO'
  | 'CALL_FALTA_ENVIDO'
  | 'ACCEPT_ENVIDO'
  | 'DECLINE_ENVIDO'
  | 'GO_TO_MAZO'
  | 'TIMEOUT'
  | 'ABANDON';

export interface TrucoActionRow {
  id: number;
  match_id: string;
  hand_id: string | null;
  user_phone: string;
  action_type: TrucoActionType;
  payload: Record<string, any>;
  sequence_number: number;
  idempotency_key: string | null;
  created_at: Date;
}

/**
 * Devuelve el "asiento" (A/B) dado un teléfono y un match.
 * Throws si el phone no pertenece al match.
 */
export function seatOf(match: TrucoMatchRow, phone: string): PlayerSeat {
  if (match.player_a_phone === phone) return 'A';
  if (match.player_b_phone === phone) return 'B';
  throw new Error(`Phone ${phone} no pertenece al match ${match.id}`);
}

export function phoneOfSeat(match: TrucoMatchRow, seat: PlayerSeat): string {
  return seat === 'A' ? match.player_a_phone : match.player_b_phone;
}

export function opponentSeat(seat: PlayerSeat): PlayerSeat {
  return seat === 'A' ? 'B' : 'A';
}

export function opponentPhone(match: TrucoMatchRow, phone: string): string {
  return phoneOfSeat(match, opponentSeat(seatOf(match, phone)));
}
