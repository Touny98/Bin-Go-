/* eslint-disable no-console */
/**
 * Test de validación de FASE/TURNO del Truco (bug: cantar tras bajar carta).
 * Ejercita el orquestador real contra Postgres + Redis.
 *
 * Ejecutar:  npx ts-node --transpile-only src/scripts/test-phase.ts
 *
 * Verifica que:
 *  - cantar truco / irse al mazo DESPUÉS de bajar carta → OUT_OF_PHASE (rechazo).
 *  - cantar truco en tu turno (antes de jugar) → OK.
 *  - cantar truco cuando pasa a ser TU turno → OK.
 */
import { strict as assert } from 'assert';
import { initDb, query } from '../db';
import { TrucoMatchmakingService } from '../domain/truco/TrucoMatchmakingService';
import { TrucoMatchService } from '../domain/truco/TrucoMatchService';
import {
  TrucoCommandError,
  TrucoGameOrchestrator,
  TurnDescriptor,
} from '../domain/truco/TrucoGameOrchestrator';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';
import { LedgerService } from '../finance/LedgerService';
import { Card } from '../engine/truco/types';
import { connection } from '../queue';

const BET = 1000;
const FEE_PCT = 0.1;

async function seedWallet(phone: string): Promise<void> {
  await query(
    `INSERT INTO users (phone_number, name) VALUES ($1, $2)
     ON CONFLICT (phone_number) DO NOTHING`,
    [phone, `Phase ${phone}`]
  );
  await query(
    `INSERT INTO wallets (user_id, real_balance) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET real_balance = $2`,
    [phone, 5000]
  );
  await query(`DELETE FROM ledger_entries WHERE wallet_id = $1`, [phone]);
  await LedgerService.recordEntry(phone, 'CREDIT', 'DEPOSIT', 5000, `phase-seed-${phone}`);
}

async function cleanup(): Promise<void> {
  await query(`DELETE FROM truco_queue WHERE user_phone LIKE 'phase_%'`);
  await query(
    `DELETE FROM truco_matches WHERE player_a_phone LIKE 'phase_%' OR player_b_phone LIKE 'phase_%'`
  );
  await query(`DELETE FROM ledger_entries WHERE wallet_id LIKE 'phase_%'`);
  await query(`DELETE FROM wallets WHERE user_id LIKE 'phase_%'`);
  await query(`DELETE FROM users WHERE phone_number LIKE 'phase_%'`);
}

/** Crea un match en HAND_PLAY con la primera mano repartida. */
async function setupMatch(suffix: string): Promise<{
  matchId: string;
  mano: string;
  pie: string;
  desc: Extract<TurnDescriptor, { kind: 'WAITING_FOR_CARD' }>;
}> {
  const a = `phase_a_${suffix}`;
  const b = `phase_b_${suffix}`;
  await seedWallet(a);
  await seedWallet(b);
  await TrucoMatchmakingService.enqueue(a, BET);
  await TrucoMatchmakingService.enqueue(b, BET);
  await TrucoMatchmakingService.tickMatch(FEE_PCT);
  const match = await TrucoMatchService.getActiveMatchForPlayer(a);
  assert.ok(match, 'debe existir match');
  await TrucoSettlementService.holdBets(match.id);
  const desc = await TrucoGameOrchestrator.dealNewHand(match.id);
  assert.equal(desc.kind, 'WAITING_FOR_CARD', 'tras repartir debe esperar carta');
  const d = desc as Extract<TurnDescriptor, { kind: 'WAITING_FOR_CARD' }>;
  const pie = d.currentTurnPhone === match.player_a_phone ? match.player_b_phone : match.player_a_phone;
  return { matchId: match.id, mano: d.currentTurnPhone, pie, desc: d };
}

function firstCardOf(desc: Extract<TurnDescriptor, { kind: 'WAITING_FOR_CARD' }>, phone: string): Card {
  const seat = phone === desc.match.player_a_phone ? 'A' : 'B';
  const cards = (seat === 'A' ? desc.hand.cards_a : desc.hand.cards_b) as Card[];
  return cards[0];
}

async function expectOutOfPhase(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error(`__NO_THROW__:${label}`);
  } catch (e: any) {
    if (typeof e?.message === 'string' && e.message.startsWith('__NO_THROW__')) {
      throw new Error(`❌ ${label}: se esperaba OUT_OF_PHASE y la acción fue ACEPTADA`);
    }
    if (e instanceof TrucoCommandError && e.code === 'OUT_OF_PHASE') {
      console.log(`   ✓ ${label} → rechazado (OUT_OF_PHASE)`);
      return;
    }
    throw new Error(`❌ ${label}: error inesperado (${e?.code ?? e?.message})`);
  }
}

async function expectOk(label: string, fn: () => Promise<unknown>): Promise<void> {
  await fn();
  console.log(`   ✓ ${label} → aceptado`);
}

async function main(): Promise<void> {
  console.log('🧪 Test de validación de fase (Truco)');
  await initDb();
  await cleanup();

  // ── Caso 1: cantar/mazo DESPUÉS de bajar carta → rechazado ──────────
  console.log('\n── Caso 1: acción tras bajar carta ──');
  {
    const { matchId, mano, pie, desc } = await setupMatch('c1');
    await TrucoGameOrchestrator.playCard({
      matchId, userPhone: mano, card: firstCardOf(desc, mano),
      idempotencyKey: `${matchId}:c1:play`,
    });
    // El mano YA jugó → el turno pasó al pie. El mano NO debe poder cantar/mazo.
    await expectOutOfPhase('mano canta truco tras jugar', () =>
      TrucoGameOrchestrator.callTruco({ matchId, userPhone: mano, level: 2, idempotencyKey: `${matchId}:c1:truco` })
    );
    await expectOutOfPhase('mano se va al mazo tras jugar', () =>
      TrucoGameOrchestrator.goToMazo({ matchId, userPhone: mano, idempotencyKey: `${matchId}:c1:mazo` })
    );
    // El pie (a quien le toca ahora) SÍ puede cantar truco.
    await expectOk('pie canta truco en su turno', () =>
      TrucoGameOrchestrator.callTruco({ matchId, userPhone: pie, level: 2, idempotencyKey: `${matchId}:c1:pietruco` })
    );
  }

  // ── Caso 2: cantar truco en tu turno (antes de jugar) → OK ──────────
  console.log('\n── Caso 2: canto en turno propio (antes de jugar) ──');
  {
    const { matchId, mano } = await setupMatch('c2');
    await expectOk('mano canta truco antes de jugar', () =>
      TrucoGameOrchestrator.callTruco({ matchId, userPhone: mano, level: 2, idempotencyKey: `${matchId}:c2:truco` })
    );
  }

  await cleanup();
  console.log('\n🧪 Validación de fase — OK ✅');
  await connection.quit().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Test de fase FAILED');
  console.error(err.message || err);
  cleanup().catch(() => {}).finally(() => {
    connection.quit().catch(() => {}).finally(() => process.exit(1));
  });
});
