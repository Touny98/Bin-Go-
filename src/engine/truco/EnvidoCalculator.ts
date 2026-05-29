import { ALL_SUITS, Card, PlayerSeat, Suit } from './types';

/**
 * Valor de una carta para el cálculo de envido.
 * Figuras (10, 11, 12) valen 0; 1-7 valen su número.
 */
export function envidoCardValue(card: Card): number {
  if (card.rank >= 10) return 0;
  return card.rank;
}

/**
 * Calcula los puntos de envido de una mano de 3 cartas.
 *
 * Reglas:
 * - 2+ cartas del mismo palo: 20 + las dos cartas más altas de ese palo.
 *   Si hay 3 del mismo palo, tomamos las 2 más altas.
 * - 3 cartas de palos distintos: la mayor figura individual (figuras = 0).
 */
export function envidoScore(cards: Card[]): number {
  if (cards.length !== 3) {
    throw new Error(`envidoScore requiere 3 cartas, recibió ${cards.length}`);
  }
  const bySuit: Record<Suit, Card[]> = {
    espada: [],
    basto: [],
    oro: [],
    copa: [],
  };
  for (const c of cards) bySuit[c.suit].push(c);

  let bestPair = -1;
  for (const suit of ALL_SUITS) {
    const inSuit = bySuit[suit];
    if (inSuit.length >= 2) {
      const values = inSuit.map(envidoCardValue).sort((a, b) => b - a);
      const score = 20 + values[0] + values[1];
      if (score > bestPair) bestPair = score;
    }
  }
  if (bestPair >= 0) return bestPair;

  // Sin pares del mismo palo → mayor valor individual (puede ser 0 si todas figuras)
  return Math.max(...cards.map(envidoCardValue));
}

/**
 * Resuelve quién gana un envido entre dos jugadores.
 * En empate, gana **mano**.
 */
export function resolveEnvido(
  scoreA: number,
  scoreB: number,
  manoPlayer: PlayerSeat
): PlayerSeat {
  if (scoreA > scoreB) return 'A';
  if (scoreB > scoreA) return 'B';
  return manoPlayer;
}

/**
 * Puntos en juego según el canto de envido y la respuesta.
 *
 * - level: nivel cantado más alto aceptado en la cadena (o el nivel rechazado).
 * - accepted: si fue aceptado por el rival.
 * - leaderScore: puntos del líder de la partida (para FALTA_ENVIDO).
 * - targetScore: puntos para ganar la partida (15 en MVP).
 *
 * MVP simplifica: no encadena ENVIDO + ENVIDO + REAL_ENVIDO; cada nivel es atómico.
 * Si querés encadenar, se modela como múltiples cantos secuenciales.
 */
export function envidoPoints(opts: {
  level: 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO';
  accepted: boolean;
  leaderScore: number;
  targetScore: number;
}): number {
  const { level, accepted, leaderScore, targetScore } = opts;

  if (!accepted) {
    // "no quiero" → el que cantó se lleva 1 punto fijo
    return 1;
  }
  switch (level) {
    case 'ENVIDO':
      return 2;
    case 'REAL_ENVIDO':
      return 3;
    case 'FALTA_ENVIDO': {
      const faltan = Math.max(targetScore - leaderScore, 1);
      return faltan;
    }
  }
}
