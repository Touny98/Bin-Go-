import { describe, it, expect } from 'vitest';
import { query } from '../../src/db';
import { WalletEngine } from '../../src/finance/WalletEngine';
import { RiskEngine } from '../../src/finance/RiskEngine';

// WS1 · Tarea 1.6 — Payouts / retiros (salida de dinero).
// DoD: risk_score aplicado; sin doble-débito (retry); sin doble-reembolso / dinero gratis.

async function realBalance(userId: string): Promise<number> {
  const res = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [userId]);
  return parseFloat(res.rows[0]?.real_balance ?? '0');
}

describe('RiskEngine.analyzePayout', () => {
  it('retiro chico de usuario con historial: no requiere revisión (score 0)', async () => {
    const u = '5491170000001';
    await query(`INSERT INTO player_stats (user_id) VALUES ($1)`, [u]); // tiene historial

    const r = await RiskEngine.analyzePayout(u, 2000);

    expect(r.score).toBe(0);
    expect(r.requiresManualReview).toBe(false);
  });

  it('monto alto (>= umbral) requiere revisión manual', async () => {
    const u = '5491170000002';
    await query(`INSERT INTO player_stats (user_id) VALUES ($1)`, [u]);

    const r = await RiskEngine.analyzePayout(u, 50000);

    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.requiresManualReview).toBe(true);
    expect(r.notes.join(' ')).toMatch(/high amount/i);
  });

  it('usuario nuevo + alta frecuencia de retiros requiere revisión', async () => {
    const u = '5491170000003'; // sin player_stats → +20
    // 4 retiros en las últimas 24h → +30 (velocidad)
    for (let i = 0; i < 4; i++) {
      await query(`INSERT INTO payout_requests (user_id, amount, status) VALUES ($1, $2, 'REQUESTED')`, [u, 1000]);
    }

    const r = await RiskEngine.analyzePayout(u, 1000);

    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.requiresManualReview).toBe(true);
  });
});

describe('WalletEngine.lockForWithdrawal · idempotencia (anti doble-débito)', () => {
  it('un retiro debita una vez; un retry con el mismo payoutId NO vuelve a debitar', async () => {
    const u = '5491170000011';
    await WalletEngine.credit(u, 1000, 'DEPOSIT', 'seed');

    await WalletEngine.lockForWithdrawal(u, 300, 'payout-A');
    expect(await realBalance(u)).toBeCloseTo(700, 2);

    await WalletEngine.lockForWithdrawal(u, 300, 'payout-A'); // retry (crash entre débito y PROCESSING)
    expect(await realBalance(u)).toBeCloseTo(700, 2); // sigue 700, no 400
  });
});

describe('WalletEngine.refundWithdrawal · reembolso seguro', () => {
  it('reembolsa un retiro debitado y es idempotente ante doble-rechazo', async () => {
    const u = '5491170000021';
    await WalletEngine.credit(u, 1000, 'DEPOSIT', 'seed');
    await WalletEngine.lockForWithdrawal(u, 300, 'payout-B'); // balance 700

    const r1 = await WalletEngine.refundWithdrawal(u, 300, 'payout-B');
    expect(r1.refunded).toBe(true);
    expect(await realBalance(u)).toBeCloseTo(1000, 2);

    const r2 = await WalletEngine.refundWithdrawal(u, 300, 'payout-B'); // doble clic en "Rechazar"
    expect(r2.refunded).toBe(false);
    expect(await realBalance(u)).toBeCloseTo(1000, 2); // no 1300
  });

  it('NO reembolsa si nunca hubo débito (no crea dinero)', async () => {
    const u = '5491170000031';
    await WalletEngine.credit(u, 500, 'DEPOSIT', 'seed');

    const r = await WalletEngine.refundWithdrawal(u, 999, 'payout-C'); // retiro nunca debitado (p.ej. PENDING_REVIEW)

    expect(r.refunded).toBe(false);
    expect(await realBalance(u)).toBeCloseTo(500, 2); // intacto
  });
});
