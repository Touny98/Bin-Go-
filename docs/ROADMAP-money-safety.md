# Roadmap — Money-Safety Sprint (1 semana)

> Estado vivo. Marcá `[x]` a medida que avanza. Última actualización: 2026-05-29.

## Decisiones tomadas
- **Runner de tests:** Vitest (elegido).
- **Esquema RNG (WS2):** **B — provably-fair completo** (recomendado, porque el camino es licenciamiento y el RNG certificable es requisito regulatorio). Se confirma al ejecutar WS2.
- **Frente legal:** ver [`MEMO-legal-salta.md`](./MEMO-legal-salta.md). Camino primario: **B2B / proveedor de tecnología a operador licenciado** (en Salta no hay cupo de licencias nuevas; operar sin licencia es delito penal).

## Lógica de secuenciamiento
El cambio de RNG (WS2) afecta cómo se determina el ganador → afecta payouts. **No se toca el RNG hasta tener la red de tests de dinero (WS1).** El frente legal (WS3) corre en paralelo (calendario externo) y alimenta el backlog técnico (KYC, límites, autoexclusión).

```
WS3 Legal  ─────────────────────────────────►  (paralelo)
WS1 Tests  ──████████──┐
                       └──► WS2 RNG  ──████──
```

---

## WS1 · Suite de tests money-safety

Harness: **Vitest** + Postgres descartable (`bingo_test`, base separada de dev) + TRUNCATE por test + guard que **aborta si la base conectada no es `bingo_test`** (protección anti-borrado de datos reales).

| # | Tarea | Esfuerzo | Estado | Done cuando… |
|---|---|---|---|---|
| 1.1 | Harness Vitest + DB efímera + guard de seguridad | 0.5–1 d | ✅ | `npm test` corre verde, aislado por test, sobre `bingo_test` |
| 1.2 | Invariantes de ledger | 0.5 d | ✅ | `calculateBalance == Σ(CREDIT−DEBIT)`; aislamiento por wallet; decimales |
| 1.3 | Webhook MP → cartón pago → reserva | 1 d | ✅ | Webhook duplicado no acredita dos veces; estados consistentes |
| 1.4 | Winner lock + dispersión Bingo (concurrencia) | 1 d | 🟡 | Parte hecha: WalletEngine endurecido + tests anti doble-gasto. Falta: lock de ganador en `BingoGame`/`GameSessionService` |
| 1.5 | Settlement Truco | 1 d | ✅ | Ganador cobra `pot−fee`; abandono → refund; payout idempotente (incl. concurrente) |
| 1.6 | Flujo payout_requests | 0.5 d | ⬜ | `idempotency_key` único; sin doble pago; risk_score aplicado |
| 1.7 | Aserción de reconciliación | 0.5 d | ⬜ | Detecta drift entre `wallets.real_balance` y verdad del ledger |

### Hallazgo aplicado (1.4) — Hardening de `WalletEngine`
`WalletEngine` ejecutaba `BEGIN/COMMIT` sobre el **pool** (`query()`), no sobre un cliente dedicado. Hacer `query('BEGIN')` devuelve el cliente al pool **dentro de una transacción abierta** → riesgo documentado en `node-postgres` de fuga de transacción entre requests y de que el `FOR UPDATE` no serialice bajo carga / con pgBouncer. La correctitud era **incidental** (dependía del reuso LIFO del pool).
- **Fix:** transacción sobre cliente dedicado (`getClient()`), con el asiento de ledger participando de la misma transacción atómica (`LedgerService.recordEntry(..., exec)`).
- **Tests de regresión:** `test/finance/wallet-safety.test.ts` (anti doble-gasto, fondos insuficientes, consistencia ledger↔saldo).
- Pasan **antes y después** del fix → es endurecimiento, no corrección de un fallo observado.

### Hallazgo aplicado (1.3) — Doble-crédito en depósitos (BUG REAL)
`WalletDepositService.confirmDeposit()` llamaba a `WalletEngine.credit()` **sin ningún control de idempotencia**. Como los webhooks de MercadoPago son *at-least-once*, un depósito que llegaba dos veces **acreditaba el saldo dos veces** (demostrado en test: $5.000 → $10.000). A diferencia del de WalletEngine, este sí era un fallo observable.
- **Fix:** chequeo de idempotencia por `reference_id` (el `externalRef`) en `ledger_entries` antes de acreditar; devuelve `applied: false` si es duplicado. El worker no re-notifica en duplicados.
- **Nota:** `confirmPayment()` (cartones) ya era idempotente (`alreadyPaid`).

### Hallazgos pendientes detectados (→ WS1.7 / backlog)
1. **Race concurrente en depósitos:** el chequeo de idempotencia es a nivel app (cubre el reintento secuencial de MP, el caso real). Para blindar el caso concurrente (BullMQ `concurrency:5`) falta un **índice único parcial** `ledger_entries(reference_id) WHERE category='DEPOSIT'` — requiere de-dup previo de datos, por eso no se aplicó a ciegas en prod.
2. **Reconocimiento de ingresos en RESERVA, no en pago:** `reserveCards()` registra el FEE de plataforma y la contribución al jackpot al **reservar** (antes de pagar). Al expirar una reserva impaga (`expireReservation`), **NO se revierten** → el jackpot y el revenue quedan inflados por reservas nunca pagadas. Bug de contabilidad para WS1.7.
3. **Pago tardío sobre reserva expirada:** `confirmPayment()` no valida estado EXPIRED → un webhook tardío puede reactivar (EXPIRED→PAID) una reserva ya vencida. Edge menor.

### Hallazgo aplicado (1.5) — Doble-pago concurrente en Truco (BUG REAL)
El truco tiene **dos caminos de payout** (el handler conversacional llama `payout()` directo al GAME_OVER **y** `TrucoPayoutWorker` lo encola como recovery). El `jobId` dedupea jobs del worker, pero **no** la carrera handler-vs-worker. En `payout()` el `credit` ocurría **fuera de lock, antes** del flip a `PAYOUT_DONE` → dos llamadas concurrentes pagaban dos veces (test: ganador recibió $3.800 en vez de $1.900). Análogo en `refundAll()`: sólo se protegía contra `PAYOUT_DONE`, no contra `CANCELLED` → doble reembolso secuencial ($1.000 vs $500).
- **Fix payout:** *claim atómico* — `UPDATE ... WHERE status IN ('GAME_OVER','ABANDONED')` flipa a `PAYOUT_DONE`; sólo un caller obtiene `rowCount=1` y acredita. El perdedor de la carrera no-op.
- **Fix refundAll:** guard `isTerminal(status)` (no reembolsa si ya está `PAYOUT_DONE`/`CANCELLED`), preservando la validación de transición del state machine.
- **Idempotencia secuencial** de payout (el caso del retry de BullMQ) ya funcionaba y quedó cubierta con tests.

**Residuales 1.5 (→ WS1.7 / backlog):** (a) crash entre claim y credit deja el match `PAYOUT_DONE` con el ganador sin cobrar — *recuperable* y detectable por reconciliación (mejor que el doble-pago anterior); (b) `refundAll` concurrente (no secuencial) sigue siendo posible, pero es un path de error de bajo riesgo (no tiene doble disparador como payout).

**DoD del workstream:** los 6 flujos de dinero cubiertos; CI corre los tests en cada push; cualquier regresión rompe el build.

---

## WS2 · Commit-reveal RNG (Bingo *provably-fair*)
Problema: `engine/BingoGame.ts` usa `Math.random()` (no CSPRNG, no verificable). Truco ya usa `crypto.randomBytes` + hash → referencia.

| # | Tarea | Esfuerzo | Estado |
|---|---|---|---|
| 2.1 | Diseño del esquema (server-seed + entropía pública) | 0.25 d | ⬜ |
| 2.2 | Reemplazar `Math.random` por CSPRNG sembrado (HMAC-SHA256 → Fisher-Yates) | 0.5–1 d | ⬜ |
| 2.3 | Migración aditiva: `seed_hash` al crear, `revealed_seed` al finalizar | 0.25 d | ⬜ |
| 2.4 | Exponer commit antes / reveal después + verificador reproducible | 0.5 d | ⬜ |
| 2.5 | Tests de fairness (determinismo, hash, distribución) | 0.5 d | ⬜ |
| 2.6 | Compatibilidad de sesiones en vuelo | 0.25 d | ⬜ |

**Depende de 1.1 + 1.4.** **DoD:** hash publicado antes de la primera bola, seed revelado al cierre, verificador reproducible, tests de 1.4 siguen verdes.

---

## WS3 · Frente legal
Ver [`MEMO-legal-salta.md`](./MEMO-legal-salta.md). Entregable redactado ✅. Pendiente: contratar abogado de gaming + crear backlog técnico de KYC/juego responsable.

---

## Cómo correr los tests
```bash
# Requiere Postgres local arriba:
docker compose -f docker-compose.local.yml up -d postgres

npm test            # toda la suite (vitest run)
npm run test:money  # solo tests de finanzas
npm run test:watch  # modo watch
```
La base `bingo_test` se crea sola en el primer run. Nunca toca `bingo_db` (dev).
