/* eslint-disable no-console */
/**
 * Test runner del motor puro de Truco (Etapa 0).
 * Usa node:assert en lugar de un framework para no agregar dependencias.
 *
 * Ejecutar:  npx ts-node src/scripts/test-truco.ts
 */
import { strict as assert } from 'assert';

import { TrucoEngine } from '../engine/truco/TrucoEngine';
import {
  envidoCardValue,
  envidoPoints,
  envidoScore,
  resolveEnvido,
} from '../engine/truco/EnvidoCalculator';
import {
  gameOver,
  resolveBaza,
  resolveHand,
  trucoPoints,
} from '../engine/truco/HandResolver';
import {
  TrucoMatchStatus,
  TrucoStateMachine,
} from '../engine/truco/TrucoStateMachine';
import {
  ALL_RANKS,
  ALL_SUITS,
  BazaWinner,
  Card,
  PlayerSeat,
  Rank,
  Suit,
} from '../engine/truco/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}\n    ${err.message || err}`);
    console.log(`  ✗ ${name}`);
  }
}

function section(title: string) {
  console.log(`\n— ${title} —`);
}

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

// ─────────────────────────────────────────────────────────────────────
section('TrucoEngine — jerarquía de cartas');

test('mazo tiene exactamente 40 cartas únicas', () => {
  const deck = TrucoEngine.buildDeck();
  assert.equal(deck.length, 40);
  const keys = new Set(deck.map((d) => `${d.rank}-${d.suit}`));
  assert.equal(keys.size, 40);
});

test('1 de espada (brava) es la carta más alta', () => {
  const brava = c(1, 'espada');
  for (const s of ALL_SUITS) {
    for (const r of ALL_RANKS) {
      if (s === 'espada' && r === 1) continue;
      assert.ok(
        TrucoEngine.compareCards(brava, c(r, s)) > 0,
        `1 espada debe ganar a ${r}-${s}`
      );
    }
  }
});

test('1 de basto > 7 de espada > 7 de oro > 3', () => {
  assert.ok(TrucoEngine.compareCards(c(1, 'basto'), c(7, 'espada')) > 0);
  assert.ok(TrucoEngine.compareCards(c(7, 'espada'), c(7, 'oro')) > 0);
  assert.ok(TrucoEngine.compareCards(c(7, 'oro'), c(3, 'espada')) > 0);
});

test('7 de copa y 7 de basto son falsos (debajo de las figuras)', () => {
  assert.ok(TrucoEngine.compareCards(c(10, 'oro'), c(7, 'copa')) > 0);
  assert.ok(TrucoEngine.compareCards(c(7, 'copa'), c(6, 'oro')) > 0);
});

test('1 de copa y 1 de oro son falsos (debajo de los 2)', () => {
  assert.ok(TrucoEngine.compareCards(c(2, 'espada'), c(1, 'copa')) > 0);
  assert.ok(TrucoEngine.compareCards(c(2, 'espada'), c(1, 'oro')) > 0);
});

test('parda entre dos 3 distintos (misma fuerza)', () => {
  assert.equal(TrucoEngine.compareCards(c(3, 'oro'), c(3, 'copa')), 0);
});

test('parda entre dos 4 distintos', () => {
  assert.equal(TrucoEngine.compareCards(c(4, 'oro'), c(4, 'basto')), 0);
});

test('4 es la carta más baja', () => {
  const peor = c(4, 'oro');
  for (const s of ALL_SUITS) {
    for (const r of ALL_RANKS) {
      if (r === 4) continue;
      assert.ok(
        TrucoEngine.compareCards(c(r, s), peor) > 0,
        `${r}-${s} debe ganar a 4-oro`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
section('TrucoEngine — shuffle determinista y deal');

test('mismo seed → mismas manos', () => {
  const seed = 'abc-123';
  const d1 = TrucoEngine.deal(seed);
  const d2 = TrucoEngine.deal(seed);
  assert.deepEqual(d1.handA, d2.handA);
  assert.deepEqual(d1.handB, d2.handB);
});

test('seeds distintos → manos distintas (con muy alta probabilidad)', () => {
  const d1 = TrucoEngine.deal('seed-uno');
  const d2 = TrucoEngine.deal('seed-dos');
  assert.notDeepEqual(d1.handA, d2.handA);
});

test('cada jugador recibe 3 cartas y no se repiten entre manos ni con el mazo restante', () => {
  const { handA, handB, remaining } = TrucoEngine.deal('test-seed');
  assert.equal(handA.length, 3);
  assert.equal(handB.length, 3);
  assert.equal(remaining.length, 34);
  const all = [...handA, ...handB, ...remaining];
  const keys = new Set(all.map((cd) => `${cd.rank}-${cd.suit}`));
  assert.equal(keys.size, 40, 'no debe haber cartas duplicadas');
});

test('handContains identifica correctamente', () => {
  const hand = [c(1, 'espada'), c(7, 'oro'), c(4, 'copa')];
  assert.ok(TrucoEngine.handContains(hand, c(1, 'espada')));
  assert.ok(!TrucoEngine.handContains(hand, c(1, 'basto')));
});

test('removeCard quita correctamente y lanza si no existe', () => {
  const hand = [c(1, 'espada'), c(7, 'oro'), c(4, 'copa')];
  const after = TrucoEngine.removeCard(hand, c(7, 'oro'));
  assert.equal(after.length, 2);
  assert.ok(!TrucoEngine.handContains(after, c(7, 'oro')));
  assert.throws(() => TrucoEngine.removeCard(hand, c(5, 'basto')));
});

test('integrityHash es determinista y depende del seed', () => {
  const h1 = TrucoEngine.integrityHash('match-1', 'seed-a', ['p1', 'p2']);
  const h2 = TrucoEngine.integrityHash('match-1', 'seed-a', ['p1', 'p2']);
  const h3 = TrucoEngine.integrityHash('match-1', 'seed-b', ['p1', 'p2']);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

// ─────────────────────────────────────────────────────────────────────
section('EnvidoCalculator — cálculo del envido');

test('envidoCardValue: figuras valen 0; 1-7 valen su número', () => {
  assert.equal(envidoCardValue(c(1, 'oro')), 1);
  assert.equal(envidoCardValue(c(7, 'espada')), 7);
  assert.equal(envidoCardValue(c(10, 'copa')), 0);
  assert.equal(envidoCardValue(c(11, 'basto')), 0);
  assert.equal(envidoCardValue(c(12, 'oro')), 0);
});

test('2 cartas mismo palo (7 + 6 oro) + tercera distinta = 33', () => {
  // 20 + 7 + 6 = 33
  const score = envidoScore([c(7, 'oro'), c(6, 'oro'), c(3, 'basto')]);
  assert.equal(score, 33);
});

test('3 cartas mismo palo: toma las dos más altas', () => {
  // 7 + 6 = 13 → 33
  const score = envidoScore([c(7, 'oro'), c(6, 'oro'), c(5, 'oro')]);
  assert.equal(score, 33);
});

test('figura + 7 mismo palo: figura cuenta 0', () => {
  // 20 + 7 + 0 = 27
  const score = envidoScore([c(7, 'copa'), c(12, 'copa'), c(3, 'basto')]);
  assert.equal(score, 27);
});

test('tres palos distintos: mayor valor individual', () => {
  // mayor entre 7, 5, 3 = 7
  const score = envidoScore([c(7, 'oro'), c(5, 'copa'), c(3, 'basto')]);
  assert.equal(score, 7);
});

test('tres figuras distintas: envido = 0', () => {
  const score = envidoScore([c(10, 'oro'), c(11, 'copa'), c(12, 'basto')]);
  assert.equal(score, 0);
});

test('1 y 12 mismo palo: 20 + 1 + 0 = 21', () => {
  const score = envidoScore([c(1, 'oro'), c(12, 'oro'), c(3, 'basto')]);
  assert.equal(score, 21);
});

test('resolveEnvido: empate gana mano', () => {
  assert.equal(resolveEnvido(27, 27, 'A'), 'A');
  assert.equal(resolveEnvido(27, 27, 'B'), 'B');
  assert.equal(resolveEnvido(33, 27, 'B'), 'A');
  assert.equal(resolveEnvido(20, 30, 'A'), 'B');
});

test('envidoPoints: declinado=1, aceptado=2/3, falta envido = lo que falta', () => {
  assert.equal(
    envidoPoints({ level: 'ENVIDO', accepted: false, leaderScore: 5, targetScore: 15 }),
    1
  );
  assert.equal(
    envidoPoints({ level: 'ENVIDO', accepted: true, leaderScore: 0, targetScore: 15 }),
    2
  );
  assert.equal(
    envidoPoints({ level: 'REAL_ENVIDO', accepted: true, leaderScore: 0, targetScore: 15 }),
    3
  );
  assert.equal(
    envidoPoints({
      level: 'FALTA_ENVIDO',
      accepted: true,
      leaderScore: 10,
      targetScore: 15,
    }),
    5
  );
});

// ─────────────────────────────────────────────────────────────────────
section('HandResolver — resolución de bazas y manos');

test('resolveBaza: A gana, B gana, parda', () => {
  assert.equal(resolveBaza(c(1, 'espada'), c(7, 'copa')), 'A');
  assert.equal(resolveBaza(c(4, 'oro'), c(1, 'basto')), 'B');
  assert.equal(resolveBaza(c(3, 'oro'), c(3, 'copa')), 'PARDA');
});

// Tabla exhaustiva de combinaciones de bazas (PARDA = P)
type Tri = [BazaWinner, BazaWinner, BazaWinner];
const expectedHand: Array<{ b: Tri; mano: PlayerSeat; w: PlayerSeat }> = [
  // AA → A en 2da, 3ra no se juega — pero la API recibe 2 bazas si terminó en 2da
  // Validamos casos de 3 bazas explícitas:
  { b: ['A', 'B', 'A'], mano: 'A', w: 'A' },
  { b: ['A', 'B', 'B'], mano: 'A', w: 'B' },
  { b: ['A', 'B', 'PARDA'], mano: 'A', w: 'A' }, // 1-1 + parda 3 → ganó 1ª no parda
  { b: ['A', 'PARDA', 'B'], mano: 'A', w: 'A' }, // parda 2da → gana quien ganó 1ª
  { b: ['A', 'PARDA', 'PARDA'], mano: 'B', w: 'A' }, // ganó 1ª, resto pardas
  { b: ['B', 'A', 'PARDA'], mano: 'A', w: 'B' }, // 1-1 con parda 3 → primera no parda (B)
  { b: ['B', 'PARDA', 'A'], mano: 'A', w: 'B' },
  { b: ['PARDA', 'A', 'B'], mano: 'A', w: 'A' }, // parda 1, gana quien gane 2 (A)
  { b: ['PARDA', 'A', 'PARDA'], mano: 'B', w: 'A' },
  { b: ['PARDA', 'PARDA', 'A'], mano: 'B', w: 'A' },
  { b: ['PARDA', 'PARDA', 'PARDA'], mano: 'A', w: 'A' },
  { b: ['PARDA', 'PARDA', 'PARDA'], mano: 'B', w: 'B' },
];

for (const { b, mano, w } of expectedHand) {
  test(`resolveHand(${b.join(',')}, mano=${mano}) → ${w}`, () => {
    assert.equal(resolveHand(b as BazaWinner[], mano), w);
  });
}

test('resolveHand: 2 bazas seguidas para A → A (no espera 3ra)', () => {
  assert.equal(resolveHand(['A', 'A'], 'B'), 'A');
});

test('resolveHand: parcial (1 baza) → null', () => {
  assert.equal(resolveHand(['A'], 'A'), null);
});

test('resolveHand: parcial empate 1-1 → null hasta 3ra', () => {
  assert.equal(resolveHand(['A', 'B'], 'A'), null);
});

test('trucoPoints: tabla completa', () => {
  assert.equal(trucoPoints(1, true), 1);
  assert.equal(trucoPoints(2, true), 2);
  assert.equal(trucoPoints(3, true), 3);
  assert.equal(trucoPoints(4, true), 4);
  assert.equal(trucoPoints(2, false), 1);
  assert.equal(trucoPoints(3, false), 2);
  assert.equal(trucoPoints(4, false), 3);
});

test('gameOver: 15 puntos termina la partida', () => {
  assert.equal(gameOver(14, 12, 15), null);
  assert.equal(gameOver(15, 12, 15), 'A');
  assert.equal(gameOver(12, 15, 15), 'B');
  assert.equal(gameOver(20, 5, 15), 'A');
});

// ─────────────────────────────────────────────────────────────────────
section('TrucoStateMachine — transiciones legales');

test('flujo feliz completo', () => {
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.MATCH_QUEUED,
    TrucoMatchStatus.MATCH_FOUND
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.MATCH_FOUND,
    TrucoMatchStatus.BET_LOCKED
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.BET_LOCKED,
    TrucoMatchStatus.DEAL
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.DEAL,
    TrucoMatchStatus.HAND_PLAY
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.HAND_PLAY,
    TrucoMatchStatus.HAND_RESOLVED
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.HAND_RESOLVED,
    TrucoMatchStatus.GAME_OVER
  );
  TrucoStateMachine.validateTransition(
    TrucoMatchStatus.GAME_OVER,
    TrucoMatchStatus.PAYOUT_DONE
  );
});

test('HAND_RESOLVED puede volver a DEAL (siguiente mano)', () => {
  assert.ok(
    TrucoStateMachine.canTransition(
      TrucoMatchStatus.HAND_RESOLVED,
      TrucoMatchStatus.DEAL
    )
  );
});

test('transición ilegal lanza', () => {
  assert.throws(() =>
    TrucoStateMachine.validateTransition(
      TrucoMatchStatus.MATCH_QUEUED,
      TrucoMatchStatus.GAME_OVER
    )
  );
  assert.throws(() =>
    TrucoStateMachine.validateTransition(
      TrucoMatchStatus.PAYOUT_DONE,
      TrucoMatchStatus.DEAL
    )
  );
});

test('PAYOUT_DONE y CANCELLED son terminales', () => {
  assert.ok(TrucoStateMachine.isTerminal(TrucoMatchStatus.PAYOUT_DONE));
  assert.ok(TrucoStateMachine.isTerminal(TrucoMatchStatus.CANCELLED));
  assert.ok(!TrucoStateMachine.isTerminal(TrucoMatchStatus.HAND_PLAY));
});

// ─────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
