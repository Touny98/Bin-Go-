/* eslint-disable no-console */
/**
 * Limpia las partidas de Truco activas para poder probar desde cero.
 *
 *  - Reembolsa (refund) las apuestas ya bloqueadas y cancela el match, así los
 *    jugadores conservan su saldo para una partida nueva.
 *  - Cancela los matches en cola/encontrados (sin apuesta tomada → sin refund).
 *  - Vacía la cola de matchmaking (truco_queue).
 *
 * No borra filas: deja los matches en estado CANCELLED (preserva auditoría).
 *
 * Ejecutar dentro del contenedor app:
 *   docker compose -f docker-compose.local.yml exec app \
 *     npx ts-node --transpile-only src/scripts/clean-truco.ts
 */
import { query } from '../db';
import { TrucoSettlementService } from '../finance/TrucoSettlementService';
import { TrucoMatchStatus } from '../engine/truco/TrucoStateMachine';

// Estados donde la apuesta YA fue debitada (holdBets) → hay que reembolsar.
const HELD_STATES: TrucoMatchStatus[] = [
  TrucoMatchStatus.BET_LOCKED,
  TrucoMatchStatus.DEAL,
  TrucoMatchStatus.HAND_PLAY,
  TrucoMatchStatus.HAND_RESOLVED,
  TrucoMatchStatus.GAME_OVER,
  TrucoMatchStatus.ABANDONED,
];

async function main() {
  // 1) Vaciar la cola primero para que no se formen matches nuevos durante la limpieza.
  const q = await query('DELETE FROM truco_queue');
  console.log(`🧹 Cola de matchmaking (truco_queue) vaciada: ${q.rowCount} fila(s).`);

  // 2) Buscar todas las partidas NO terminales.
  const terminal = [TrucoMatchStatus.PAYOUT_DONE, TrucoMatchStatus.CANCELLED];
  const res = await query(
    `SELECT id, status, player_a_phone, player_b_phone, bet_amount
       FROM truco_matches
      WHERE status NOT IN ($1, $2)
      ORDER BY created_at ASC`,
    terminal
  );
  console.log(`🔎 Partidas activas encontradas: ${res.rowCount}`);

  let refunded = 0;
  let cancelled = 0;
  for (const m of res.rows) {
    const status = m.status as TrucoMatchStatus;
    try {
      if (HELD_STATES.includes(status)) {
        // Apuesta tomada → refund a ambos + CANCELLED (idempotente por match.id).
        await TrucoSettlementService.refundAll(m.id);
        refunded++;
        console.log(
          `  ↩️  refund+cancel ${m.id} (${status}) — ${m.player_a_phone} vs ${m.player_b_phone}`
        );
      } else {
        // MATCH_QUEUED / MATCH_FOUND: sin débito → solo cancelar.
        await query(
          `UPDATE truco_matches SET status = $1, finished_at = NOW()
            WHERE id = $2 AND status = $3`,
          [TrucoMatchStatus.CANCELLED, m.id, status]
        );
        cancelled++;
        console.log(`  🚫 cancel ${m.id} (${status})`);
      }
    } catch (e: any) {
      console.error(`  ⚠️  error en ${m.id} (${status}): ${e.message}`);
    }
  }

  console.log(
    `\n✅ Listo. ${refunded} reembolsada(s), ${cancelled} cancelada(s) de ${res.rowCount} activa(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Cleanup falló:', e);
    process.exit(1);
  });
