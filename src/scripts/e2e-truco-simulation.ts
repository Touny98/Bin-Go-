/* eslint-disable no-console */
/**
 * E2E del Truco — simula dos jugadores jugando una partida completa.
 *
 * Requiere PostgreSQL + Redis activos.
 * Ejecutar:  npm run e2e:truco
 *
 * Cubre:
 *  - Matchmaking de dos jugadores por monto
 *  - Hold de saldo
 *  - Reparto y ciclo de manos hasta GAME_OVER
 *  - Settlement final (payout con fee)
 *  - Validación del ledger (suma DEBITS = CREDITS por jugador + fee plataforma)
 */
import { strict as assert } from 'assert';

import { initDb, query } from '../db';
import { TrucoMatchmakingService } from '../domain/truco/TrucoMatchmakingService';
import { TrucoMatchService } from '../domain/truco/TrucoMatchService';
import {
  TrucoGameOrchestrator,
  TurnDescriptor,
} from '../domain/truco/TrucoGameOrchestrator';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';
import { LedgerService } from '../finance/LedgerService';
import { TrucoMatchStatus } from '../engine/truco/TrucoStateMachine';
import { Card } from '../engine/truco/types';

const PHONE_A = 'e2e_truco_alice';
const PHONE_B = 'e2e_truco_bob';
const INITIAL_BALANCE = 5000;
const BET = 1000;
const FEE_PCT = 0.10;

async function seedWallet(phone: string, amount: number): Promise<void> {
  await query(
    `INSERT INTO users (phone_number, name) VALUES ($1, $2)
     ON CONFLICT (phone_number) DO NOTHING`,
    [phone, `E2E ${phone}`]
  );
  await query(
    `INSERT INTO wallets (user_id, real_balance) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET real_balance = $2`,
    [phone, amount]
  );
  // Limpiar entradas ledger previas para tests reproducibles
  await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [phone]);
  // Seedear como un único DEPOSIT para que el ledger refleje el saldo inicial
  await LedgerService.recordEntry(phone, 'CREDIT', 'DEPOSIT', amount, `e2e-seed-${phone}`);
}

async function cleanup(): Promise<void> {
  await query(`DELETE FROM truco_queue WHERE user_phone IN ($1, $2)`, [PHONE_A, PHONE_B]);
  await query(
    `DELETE FROM truco_matches WHERE player_a_phone IN ($1, $2) OR player_b_phone IN ($1, $2)`,
    [PHONE_A, PHONE_B]
  );
  await query(`DELETE FROM ledger_entries WHERE wallet_id IN ($1, $2, $3)`, [
    PHONE_A,
    PHONE_B,
    process.env.TRUCO_PLATFORM_WALLET || 'platform_truco',
  ]);
  await query(`DELETE FROM wallets WHERE user_id IN ($1, $2)`, [PHONE_A, PHONE_B]);
  await query(`DELETE FROM users WHERE phone_number IN ($1, $2)`, [PHONE_A, PHONE_B]);
}

async function playRound(desc: TurnDescriptor, matchId: string): Promise<TurnDescriptor> {
  if (desc.kind !== 'WAITING_FOR_CARD') {
    throw new Error(`playRound esperaba WAITING_FOR_CARD, recibió ${desc.kind}`);
  }
  const phone = desc.currentTurnPhone;
  const seat = phone === desc.match.player_a_phone ? 'A' : 'B';
  const cards = (seat === 'A' ? desc.hand.cards_a : desc.hand.cards_b) as Card[];
  const card = cards[0]; // estrategia naive: jugar la primera carta
  const idem = `${matchId}:${phone}:seq${Date.now()}`;
  return TrucoGameOrchestrator.playCard({
    matchId,
    userPhone: phone,
    card,
    idempotencyKey: idem,
  });
}

async function main(): Promise<void> {
  console.log('🃏 E2E Truco — inicio');
  await initDb();
  await cleanup();
  await seedWallet(PHONE_A, INITIAL_BALANCE);
  await seedWallet(PHONE_B, INITIAL_BALANCE);
  console.log(`✓ Wallets seedeadas con ${INITIAL_BALANCE} c/u`);

  // 1. Matchmaking
  await TrucoMatchmakingService.enqueue(PHONE_A, BET);
  await TrucoMatchmakingService.enqueue(PHONE_B, BET);
  const created = await TrucoMatchmakingService.tickMatch(FEE_PCT);
  assert.equal(created, 1, 'tickMatch debió crear 1 match');
  console.log('✓ Match emparejado');

  const match = await TrucoMatchService.getActiveMatchForPlayer(PHONE_A);
  assert.ok(match, 'Debe existir match activo para PHONE_A');
  console.log(`✓ Match ${match.id} (apuesta ${match.bet_amount}, pot ${match.pot_amount})`);

  // 2. Hold bets
  await TrucoSettlementService.holdBets(match.id);
  const afterHold = await TrucoMatchService.getMatch(match.id);
  assert.equal(afterHold?.status, TrucoMatchStatus.BET_LOCKED);
  console.log('✓ Saldo bloqueado a ambos jugadores');

  // 3. Loop hasta GAME_OVER
  let desc: TurnDescriptor = await TrucoGameOrchestrator.dealNewHand(match.id);
  console.log(`✓ Primera mano repartida`);

  let safety = 500;
  while (desc.kind !== 'GAME_OVER' && safety-- > 0) {
    if (desc.kind === 'WAITING_FOR_CARD') {
      desc = await playRound(desc, match.id);
    } else if (desc.kind === 'HAND_RESOLVED') {
      desc = await TrucoGameOrchestrator.dealNewHand(match.id);
    } else if (desc.kind === 'WAITING_TRUCO_RESPONSE' || desc.kind === 'WAITING_ENVIDO_RESPONSE') {
      // En estrategia naive nunca cantamos truco/envido, así que no llega aquí
      throw new Error(`Estrategia naive no debería disparar ${desc.kind}`);
    } else {
      throw new Error(`Descriptor inesperado: ${(desc as any).kind}`);
    }
  }
  assert.equal(desc.kind, 'GAME_OVER', 'Debió terminar en GAME_OVER');
  console.log(`✓ Partida terminada. Score final ${desc.match.score_a}-${desc.match.score_b}`);
  console.log(`  Ganador: ${desc.match.winner_phone}`);

  // 4. Payout
  await TrucoSettlementService.payout(match.id);
  const finalMatch = await TrucoMatchService.getMatch(match.id);
  assert.equal(finalMatch?.status, TrucoMatchStatus.PAYOUT_DONE);
  console.log(`✓ Payout completado (fee ${finalMatch?.fee_amount})`);

  // 5. Verificar ledger
  const balanceA = await LedgerService.calculateBalance(PHONE_A);
  const balanceB = await LedgerService.calculateBalance(PHONE_B);
  const platform = process.env.TRUCO_PLATFORM_WALLET || 'platform_truco';
  const balancePlatform = await LedgerService.calculateBalance(platform);

  const winner = finalMatch!.winner_phone!;
  const loser = winner === PHONE_A ? PHONE_B : PHONE_A;
  const expectedWinnerBalance = INITIAL_BALANCE - BET + (BET * 2 - BET * 2 * FEE_PCT);
  const expectedLoserBalance = INITIAL_BALANCE - BET;
  const expectedPlatform = BET * 2 * FEE_PCT;

  const balanceWinner = winner === PHONE_A ? balanceA : balanceB;
  const balanceLoser = winner === PHONE_A ? balanceB : balanceA;

  console.log(`📊 Ledger:`);
  console.log(`  Ganador (${winner}): ${balanceWinner} (esperado ${expectedWinnerBalance})`);
  console.log(`  Perdedor (${loser}): ${balanceLoser} (esperado ${expectedLoserBalance})`);
  console.log(`  Plataforma: ${balancePlatform} (esperado ${expectedPlatform})`);

  assert.equal(balanceWinner, expectedWinnerBalance, 'balance ganador');
  assert.equal(balanceLoser, expectedLoserBalance, 'balance perdedor');
  assert.equal(balancePlatform, expectedPlatform, 'balance plataforma');

  // 6. Verificar invariante: suma total = invariante inicial
  // (los dos jugadores aportaron INITIAL_BALANCE; al final la suma de
  // balanceA + balanceB + balancePlatform debe ser 2 * INITIAL_BALANCE)
  const total = balanceA + balanceB + balancePlatform;
  assert.equal(total, 2 * INITIAL_BALANCE, 'invariante de conservación de fondos');
  console.log(`✓ Invariante de conservación: ${total} = ${2 * INITIAL_BALANCE}`);

  await cleanup();
  console.log('\n🃏 E2E Truco — OK ✅');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ E2E Truco FAILED');
  console.error(err);
  cleanup()
    .catch(() => {})
    .finally(() => process.exit(1));
});
