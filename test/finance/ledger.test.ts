import { describe, it, expect } from 'vitest';
import { LedgerService } from '../../src/finance/LedgerService';

// WS1 · Tarea 1.2 — Invariantes del libro contable (ledger).
// El ledger es la "fuente de verdad" del dinero. Estos tests fijan su comportamiento.
describe('LedgerService · invariantes de saldo', () => {
  it('el saldo de un wallet sin movimientos es 0', async () => {
    expect(await LedgerService.calculateBalance('wallet-inexistente')).toBe(0);
  });

  it('saldo = Σ(CREDIT) − Σ(DEBIT)', async () => {
    const w = 'wallet-A';
    await LedgerService.recordEntry(w, 'CREDIT', 'DEPOSIT', 1000, 'dep-1');
    await LedgerService.recordEntry(w, 'DEBIT', 'CARD_PURCHASE', 300, 'buy-1');
    await LedgerService.recordEntry(w, 'CREDIT', 'WINNING', 50, 'win-1');

    expect(await LedgerService.calculateBalance(w)).toBe(750);
  });

  it('aísla los saldos entre wallets distintos', async () => {
    await LedgerService.recordEntry('wallet-A', 'CREDIT', 'DEPOSIT', 500, 'dep-a');
    await LedgerService.recordEntry('wallet-B', 'CREDIT', 'DEPOSIT', 200, 'dep-b');

    expect(await LedgerService.calculateBalance('wallet-A')).toBe(500);
    expect(await LedgerService.calculateBalance('wallet-B')).toBe(200);
  });

  it('maneja montos decimales sin error de redondeo grosero', async () => {
    const w = 'wallet-dec';
    await LedgerService.recordEntry(w, 'CREDIT', 'DEPOSIT', 1500.5, 'dep-1');
    await LedgerService.recordEntry(w, 'DEBIT', 'CARD_PURCHASE', 400.25, 'buy-1');

    expect(await LedgerService.calculateBalance(w)).toBeCloseTo(1100.25, 2);
  });
});
