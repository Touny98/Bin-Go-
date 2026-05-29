export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PlayerSeat = 'A' | 'B';
export type BazaWinner = PlayerSeat | 'PARDA';

export interface BazaResult {
  baza: 1 | 2 | 3;
  cardA: Card;
  cardB: Card;
  winner: BazaWinner;
}

export type TrucoLevel = 1 | 2 | 3 | 4;

export type EnvidoLevel = 'NONE' | 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO';

export const ALL_SUITS: ReadonlyArray<Suit> = ['espada', 'basto', 'oro', 'copa'];
export const ALL_RANKS: ReadonlyArray<Rank> = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const SUIT_LABEL: Record<Suit, string> = {
  espada: 'de espada',
  basto: 'de basto',
  oro: 'de oro',
  copa: 'de copa',
};

export const SUIT_EMOJI: Record<Suit, string> = {
  espada: '🗡️',
  basto: '🌵',
  oro: '🪙',
  copa: '🍷',
};

export function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function cardLabel(card: Card): string {
  return `${card.rank} ${SUIT_LABEL[card.suit]}`;
}

/**
 * Representación visual de una carta para los mensajes: el emoji del palo
 * SIEMPRE va primero, seguido del texto en mayúsculas. Ej.: "🗡️ 1 DE ESPADA".
 */
export function cardTag(card: Card): string {
  return `${SUIT_EMOJI[card.suit]} ${cardLabel(card).toUpperCase()}`;
}
