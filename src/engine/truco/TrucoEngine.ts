import crypto from 'crypto';
import {
  ALL_RANKS,
  ALL_SUITS,
  Card,
  cardKey,
  Rank,
  Suit,
} from './types';

/**
 * Jerarquía oficial del Truco Argentino.
 * Mayor número = carta más fuerte.
 * 0 = más baja (4); 14 = la brava (1 de espada).
 */
const POWER_TABLE: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  const set = (rank: Rank, suit: Suit, power: number) => {
    t[`${rank}-${suit}`] = power;
  };
  // 4s (más bajas)
  for (const s of ALL_SUITS) set(4, s, 1);
  // 5s
  for (const s of ALL_SUITS) set(5, s, 2);
  // 6s
  for (const s of ALL_SUITS) set(6, s, 3);
  // 7s falsos (copa, basto)
  set(7, 'copa', 4);
  set(7, 'basto', 4);
  // 10s (sotas)
  for (const s of ALL_SUITS) set(10, s, 5);
  // 11s (caballos)
  for (const s of ALL_SUITS) set(11, s, 6);
  // 12s (reyes)
  for (const s of ALL_SUITS) set(12, s, 7);
  // 1s falsos (copa, oro)
  set(1, 'copa', 8);
  set(1, 'oro', 8);
  // 2s
  for (const s of ALL_SUITS) set(2, s, 9);
  // 3s
  for (const s of ALL_SUITS) set(3, s, 10);
  // 7 oro
  set(7, 'oro', 11);
  // 7 espada
  set(7, 'espada', 12);
  // 1 basto
  set(1, 'basto', 13);
  // 1 espada (la brava)
  set(1, 'espada', 14);
  return t;
})();

export class TrucoEngine {
  /**
   * Devuelve el poder relativo de una carta en el Truco.
   * Mayor número = más fuerte.
   */
  static cardPower(card: Card): number {
    const p = POWER_TABLE[cardKey(card)];
    if (p === undefined) {
      throw new Error(`Carta inválida: ${cardKey(card)}`);
    }
    return p;
  }

  /**
   * Compara dos cartas.
   *  > 0  → a más fuerte
   *  < 0  → b más fuerte
   *  = 0  → parda (igual fuerza)
   */
  static compareCards(a: Card, b: Card): number {
    return this.cardPower(a) - this.cardPower(b);
  }

  /**
   * Genera el mazo completo de 40 cartas (baraja española sin 8/9).
   */
  static buildDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of ALL_SUITS) {
      for (const rank of ALL_RANKS) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  /**
   * PRNG determinista (Mulberry32) sembrado por string.
   * Patrón equivalente al usado en BingoEngine para garantizar replay.
   */
  private static buildRng(seed: string): () => number {
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
      s = (s + seed.charCodeAt(i) * (i + 1)) >>> 0;
    }
    return () => {
      let t = (s = (s + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Reparte el mazo determinísticamente a partir de un seed.
   * Resultado: { handA, handB, remaining } — 3 cartas cada jugador, 34 restantes.
   * El primer parámetro `mano` indica quién recibe primero (irrelevante para la
   * lógica, sólo afecta orden histórico).
   */
  static deal(seed: string, mano: 'A' | 'B' = 'A'): {
    handA: Card[];
    handB: Card[];
    remaining: Card[];
  } {
    const deck = this.buildDeck();
    const rng = this.buildRng(seed);
    // Fisher-Yates determinista
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const first = mano === 'A' ? 'A' : 'B';
    const handA: Card[] = [];
    const handB: Card[] = [];
    // Repartir 1 a 1 (3 vueltas)
    let idx = 0;
    for (let round = 0; round < 3; round++) {
      if (first === 'A') {
        handA.push(deck[idx++]);
        handB.push(deck[idx++]);
      } else {
        handB.push(deck[idx++]);
        handA.push(deck[idx++]);
      }
    }
    return { handA, handB, remaining: deck.slice(idx) };
  }

  /**
   * Hash de integridad de la mano repartida. Permite a un auditor verificar
   * post-mortem que las cartas se generaron a partir del seed declarado.
   */
  static integrityHash(matchId: string, seed: string, players: [string, string]): string {
    const salt = process.env.TRUCO_SALT || 'truco_secret_salt_123';
    const payload = `${matchId}|${seed}|${players[0]}|${players[1]}|${salt}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Genera un seed criptográficamente seguro de 32 bytes hex.
   */
  static generateSeed(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Valida que una carta exista en una mano dada (anti-cheat).
   */
  static handContains(hand: Card[], card: Card): boolean {
    return hand.some((c) => c.suit === card.suit && c.rank === card.rank);
  }

  /**
   * Remueve una carta de una mano (devuelve nueva mano).
   * Lanza si la carta no está.
   */
  static removeCard(hand: Card[], card: Card): Card[] {
    const idx = hand.findIndex((c) => c.suit === card.suit && c.rank === card.rank);
    if (idx === -1) {
      throw new Error(`Carta ${card.rank}-${card.suit} no está en la mano`);
    }
    return hand.slice(0, idx).concat(hand.slice(idx + 1));
  }
}
