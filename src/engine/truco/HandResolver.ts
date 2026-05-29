import { BazaWinner, Card, PlayerSeat, TrucoLevel } from './types';
import { TrucoEngine } from './TrucoEngine';

/**
 * Resuelve una baza (carta vs carta).
 */
export function resolveBaza(cardA: Card, cardB: Card): BazaWinner {
  const cmp = TrucoEngine.compareCards(cardA, cardB);
  if (cmp > 0) return 'A';
  if (cmp < 0) return 'B';
  return 'PARDA';
}

/**
 * Resuelve la mano (mejor de 3 bazas) con reglas de parda.
 *
 *  bazas[]: array parcial o completo de hasta 3 resultados de baza.
 *  manoPlayer: quién es mano en esta mano (gana las pardas múltiples).
 *
 * Retorna 'A' | 'B' si la mano ya tiene ganador, o null si aún sigue.
 */
export function resolveHand(
  bazas: BazaWinner[],
  manoPlayer: PlayerSeat
): PlayerSeat | null {
  const winsA = bazas.filter((b) => b === 'A').length;
  const winsB = bazas.filter((b) => b === 'B').length;

  // Victoria por 2 bazas directas (no necesita 3ª)
  if (winsA >= 2) return 'A';
  if (winsB >= 2) return 'B';

  if (bazas.length < 3) return null;

  // 3 bazas jugadas
  if (winsA === 0 && winsB === 0) {
    // Todas pardas → gana mano
    return manoPlayer;
  }

  // Si solo uno ganó al menos una y el resto son pardas → ese jugador
  if (winsA >= 1 && winsB === 0) return 'A';
  if (winsB >= 1 && winsA === 0) return 'B';

  // 1-1 con parda en alguna baza → gana quien ganó la PRIMERA no-parda
  const firstNonParda = bazas.findIndex((b) => b !== 'PARDA');
  return bazas[firstNonParda] as PlayerSeat;
}

/**
 * Puntos otorgados al ganador de la mano según el nivel de truco vigente
 * y si hubo aceptación.
 *
 *  level: 1=base (sin cantar), 2=truco, 3=retruco, 4=vale4.
 *  accepted: si el último canto fue aceptado.
 *  declinedAtLevel: si fue "no quiero", el nivel ANTERIOR al rechazado
 *                   (porque "no quiero" otorga los puntos del último aceptado).
 *
 * MVP:
 * - Sin canto (level=1): 1 punto.
 * - TRUCO aceptado: 2.
 * - RETRUCO aceptado: 3.
 * - VALE 4 aceptado: 4.
 * - "No quiero" a un canto: puntos del nivel previo (TRUCO declinado=1, RETRUCO declinado=2, VALE4 declinado=3).
 */
export function trucoPoints(level: TrucoLevel, accepted: boolean): number {
  if (accepted) {
    if (level === 1) return 1;
    if (level === 2) return 2;
    if (level === 3) return 3;
    return 4;
  }
  // declinado → puntos del nivel inmediatamente inferior
  if (level === 2) return 1;
  if (level === 3) return 2;
  if (level === 4) return 3;
  // level === 1 con accepted=false no tiene sentido (es el base)
  return 1;
}

/**
 * Devuelve true si la partida ya tiene ganador.
 */
export function gameOver(
  scoreA: number,
  scoreB: number,
  targetScore: number
): PlayerSeat | null {
  if (scoreA >= targetScore && scoreA >= scoreB) return 'A';
  if (scoreB >= targetScore && scoreB >= scoreA) return 'B';
  return null;
}
