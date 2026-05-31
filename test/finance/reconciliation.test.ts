import { describe, it, expect } from 'vitest';
import { query } from '../../src/db';
import { WalletEngine } from '../../src/finance/WalletEngine';
import { ReconciliationService } from '../../src/finance/ReconciliationService';

// WS1 · Tarea 1.7 — Reconciliación. El ledger es la verdad; el saldo denormalizado
// (real_balance + bonus_balance) debe coincidir. Este es el "sistema inmunológico".

describe('ReconciliationService.findDrift', () => {
  it('no reporta anomalías cuando el wallet es consistente con el ledger', async () => {
    const u = '5491180000001';
    await WalletEngine.credit(u, 1000, 'DEPOSIT', 'dep');
    await WalletEngine.debit(u, 300, 'CARD_PURCHASE', 'buy'); // real_balance 700, ledger 700

    const drift = await ReconciliationService.findDrift();
    expect(drift.find((d) => d.userId === u)).toBeUndefined();
  });

  it('NO genera falso positivo cuando hay saldo de BONUS (bug del worker original)', async () => {
    const u = '5491180000002';
    await WalletEngine.credit(u, 100, 'BONUS', 'bonus-1'); // bonus_balance 100, ledger 100, real 0

    const drift = await ReconciliationService.findDrift();
    // ledger(100) == real(0) + bonus(100) → sin drift
    expect(drift.find((d) => d.userId === u)).toBeUndefined();
  });

  it('detecta drift cuando real_balance se corrompe (p.ej. un refund que saltea el ledger)', async () => {
    const u = '5491180000003';
    await WalletEngine.credit(u, 1000, 'DEPOSIT', 'dep'); // ledger 1000, real 1000
    // Simula el viejo bug de refund directo a wallet sin asiento contable:
    await query('UPDATE wallets SET real_balance = 1300 WHERE user_id = $1', [u]);

    const drift = await ReconciliationService.findDrift();
    const anomaly = drift.find((d) => d.userId === u);

    expect(anomaly).toBeDefined();
    expect(anomaly!.ledgerBalance).toBeCloseTo(1000, 2);
    expect(anomaly!.expectedBalance).toBeCloseTo(1300, 2);
    expect(anomaly!.drift).toBeCloseTo(300, 2);
  });

  it('audit() devuelve el total de wallets y la lista de anomalías', async () => {
    const ok = '5491180000004';
    const bad = '5491180000005';
    await WalletEngine.credit(ok, 500, 'DEPOSIT', 'dep-ok');
    await WalletEngine.credit(bad, 500, 'DEPOSIT', 'dep-bad');
    await query('UPDATE wallets SET real_balance = 999 WHERE user_id = $1', [bad]);

    const result = await ReconciliationService.audit();

    expect(result.totalWallets).toBe(2);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].userId).toBe(bad);
  });
});
