import { describe, it, expect } from 'vitest';
import { query } from '../../src/db';
import { WalletEngine } from '../../src/finance/WalletEngine';
import { LedgerService } from '../../src/finance/LedgerService';
import { TrucoSettlementService } from '../../src/finance/TrucoSettlementService';
import { TrucoMatchStatus } from '../../src/engine/truco/TrucoStateMachine';

// WS1 · Tarea 1.5 — Settlement financiero del Truco (apuestas 1v1 reales).
// DoD: ganador cobra pot−fee, plataforma cobra fee, abandono → refund,
// payout idempotente (incluido el caso concurrente handler-vs-worker).

const PLATFORM = process.env.TRUCO_PLATFORM_WALLET || 'platform_truco';

async function realBalance(userId: string): Promise<number> {
  const res = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [userId]);
  return parseFloat(res.rows[0]?.real_balance ?? '0');
}

async function seedWallet(phone: string, balance: number) {
  await WalletEngine.credit(phone, balance, 'DEPOSIT', `seed-${phone}-${Date.now()}`);
}

async function seedMatch(opts: {
  a: string;
  b: string;
  status: TrucoMatchStatus;
  winner?: string | null;
  betAmount?: number;
  feePct?: number;
}): Promise<string> {
  const bet = opts.betAmount ?? 1000;
  const pot = bet * 2;
  const res = await query(
    `INSERT INTO truco_matches
       (player_a_phone, player_b_phone, bet_amount, pot_amount, fee_pct,
        status, target_score, deck_seed, integrity_hash, winner_phone)
     VALUES ($1,$2,$3,$4,$5,$6,15,'seed-deck','seed-hash',$7)
     RETURNING id`,
    [opts.a, opts.b, bet, pot, opts.feePct ?? 0.05, opts.status, opts.winner ?? null]
  );
  return res.rows[0].id;
}

describe('TrucoSettlementService.payout', () => {
  it('acredita pot−fee al ganador y fee a la plataforma', async () => {
    const a = '5491100000001';
    const b = '5491100000002';
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.GAME_OVER, winner: a, betAmount: 1000, feePct: 0.05 });
    // pot=2000, fee=100, prize=1900

    await TrucoSettlementService.payout(id);

    expect(await realBalance(a)).toBeCloseTo(1900, 2); // ganador
    expect(await realBalance(b)).toBeCloseTo(0, 2);     // perdedor sin crédito
    expect(await LedgerService.calculateBalance(PLATFORM)).toBeCloseTo(100, 2); // fee plataforma

    const m = await query('SELECT status, fee_amount FROM truco_matches WHERE id=$1', [id]);
    expect(m.rows[0].status).toBe('PAYOUT_DONE');
    expect(parseFloat(m.rows[0].fee_amount)).toBeCloseTo(100, 2);
  });

  it('es idempotente ante llamada secuencial repetida', async () => {
    const a = '5491100000011';
    const b = '5491100000012';
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.GAME_OVER, winner: a, betAmount: 1000, feePct: 0.05 });

    await TrucoSettlementService.payout(id);
    await TrucoSettlementService.payout(id); // retry / segundo disparo

    expect(await realBalance(a)).toBeCloseTo(1900, 2); // una sola vez
  });

  it('NO paga dos veces ante payout concurrente (handler vs worker)', async () => {
    const a = '5491100000021';
    const b = '5491100000022';
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.GAME_OVER, winner: a, betAmount: 1000, feePct: 0.05 });

    await Promise.allSettled([
      TrucoSettlementService.payout(id),
      TrucoSettlementService.payout(id),
    ]);

    expect(await realBalance(a)).toBeCloseTo(1900, 2);                       // exactamente un premio
    expect(await LedgerService.calculateBalance(PLATFORM)).toBeCloseTo(100, 2); // un solo fee
  });
});

describe('TrucoSettlementService.refundAll', () => {
  it('reembolsa la apuesta a ambos jugadores y cancela el match', async () => {
    const a = '5491100000031';
    const b = '5491100000032';
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.BET_LOCKED, betAmount: 500 });

    await TrucoSettlementService.refundAll(id);

    expect(await realBalance(a)).toBeCloseTo(500, 2);
    expect(await realBalance(b)).toBeCloseTo(500, 2);
    const m = await query('SELECT status FROM truco_matches WHERE id=$1', [id]);
    expect(m.rows[0].status).toBe('CANCELLED');
  });

  it('NO reembolsa dos veces ante llamada repetida', async () => {
    const a = '5491100000041';
    const b = '5491100000042';
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.BET_LOCKED, betAmount: 500 });

    await TrucoSettlementService.refundAll(id);
    await TrucoSettlementService.refundAll(id); // segundo disparo

    expect(await realBalance(a)).toBeCloseTo(500, 2); // una sola vez
    expect(await realBalance(b)).toBeCloseTo(500, 2);
  });
});

describe('TrucoSettlementService.holdBets', () => {
  it('debita la apuesta a ambos jugadores y pasa a BET_LOCKED', async () => {
    const a = '5491100000051';
    const b = '5491100000052';
    await seedWallet(a, 500);
    await seedWallet(b, 500);
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.MATCH_FOUND, betAmount: 500 });

    await TrucoSettlementService.holdBets(id);

    expect(await realBalance(a)).toBeCloseTo(0, 2);
    expect(await realBalance(b)).toBeCloseTo(0, 2);
    const m = await query('SELECT status FROM truco_matches WHERE id=$1', [id]);
    expect(m.rows[0].status).toBe('BET_LOCKED');
  });

  it('si un jugador no tiene saldo: reembolsa al otro y cancela', async () => {
    const a = '5491100000061';
    const b = '5491100000062';
    await seedWallet(a, 500);
    await seedWallet(b, 100); // insuficiente
    const id = await seedMatch({ a, b, status: TrucoMatchStatus.MATCH_FOUND, betAmount: 500 });

    await expect(TrucoSettlementService.holdBets(id)).rejects.toThrow();

    expect(await realBalance(a)).toBeCloseTo(500, 2); // debitado y reembolsado → entero
    expect(await realBalance(b)).toBeCloseTo(100, 2); // intacto
    const m = await query('SELECT status FROM truco_matches WHERE id=$1', [id]);
    expect(m.rows[0].status).toBe('CANCELLED');
  });
});
