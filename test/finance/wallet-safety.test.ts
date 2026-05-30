import { describe, it, expect } from 'vitest';
import { WalletEngine } from '../../src/finance/WalletEngine';
import { LedgerService } from '../../src/finance/LedgerService';
import { query } from '../../src/db';

// WS1 · Tarea 1.4 (money-safety) — WalletEngine es el ÚNICO camino del dinero
// (compra de cartones, premios, jackpot, settlement de truco, retiros).
// Estos tests fijan que sea seguro ante concurrencia: sin doble-gasto, sin saldo negativo,
// y con el saldo denormalizado consistente con la verdad del ledger.

async function realBalance(userId: string): Promise<number> {
  const res = await query('SELECT real_balance FROM wallets WHERE user_id = $1', [userId]);
  return parseFloat(res.rows[0]?.real_balance ?? '0');
}

describe('WalletEngine · seguridad de fondos', () => {
  it('credit + debit secuencial: saldo correcto y consistente con el ledger', async () => {
    const u = 'u-seq';
    await WalletEngine.credit(u, 1000, 'DEPOSIT', 'dep');
    await WalletEngine.debit(u, 300, 'CARD_PURCHASE', 'buy');

    expect(await realBalance(u)).toBeCloseTo(700, 2);
    expect(await LedgerService.calculateBalance(u)).toBeCloseTo(700, 2);
  });

  it('rechaza débito por fondos insuficientes y no altera el saldo', async () => {
    const u = 'u-insuf';
    await WalletEngine.credit(u, 50, 'DEPOSIT', 'dep');

    await expect(
      WalletEngine.debit(u, 100, 'CARD_PURCHASE', 'buy')
    ).rejects.toThrow(/insufficient/i);

    expect(await realBalance(u)).toBeCloseTo(50, 2);
    expect(await LedgerService.calculateBalance(u)).toBeCloseTo(50, 2);
  });

  it('NO permite doble-gasto bajo débitos concurrentes', async () => {
    const u = 'u-race';
    await WalletEngine.credit(u, 100, 'DEPOSIT', 'dep');

    // 5 débitos concurrentes del saldo completo: sólo UNO puede ganar.
    const attempts = Array.from({ length: 5 }, (_, i) =>
      WalletEngine.debit(u, 100, 'CARD_PURCHASE', `buy-${i}`)
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === 'fulfilled').length;

    expect(ok).toBe(1);                                     // exactamente un débito exitoso
    expect(await realBalance(u)).toBeGreaterThanOrEqual(0); // nunca negativo
    expect(await realBalance(u)).toBeCloseTo(0, 2);
    expect(await LedgerService.calculateBalance(u)).toBeCloseTo(0, 2);
  });
});
