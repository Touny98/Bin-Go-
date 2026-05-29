import { Router } from 'express';
import { query } from '../db';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/admin/truco/stats
 * Estadísticas generales del Truco.
 */
router.get('/stats', async (_req, res) => {
  try {
    const [activeRes, todayRes, feesRes, leaderboardRes] = await Promise.all([
      // Partidas activas ahora
      query(`
        SELECT COUNT(*) AS count
        FROM truco_matches
        WHERE status IN ('MATCH_FOUND', 'BET_LOCKED', 'DEAL', 'HAND_PLAY', 'HAND_RESOLVED')
      `),
      // Partidas finalizadas hoy
      query(`
        SELECT COUNT(*) AS count
        FROM truco_matches
        WHERE status IN ('PAYOUT_DONE', 'GAME_OVER')
          AND finished_at >= CURRENT_DATE
      `),
      // Comisiones cobradas hoy y total
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0) AS fees_today,
          COALESCE(SUM(amount), 0) AS fees_total
        FROM ledger_entries
        WHERE category = 'TRUCO_FEE'
      `),
      // Jugadores únicos registrados en leaderboard
      query(`
        SELECT COUNT(*) AS count FROM truco_leaderboards
      `),
    ]);

    res.json({
      partidas_activas: parseInt(activeRes.rows[0].count),
      partidas_hoy: parseInt(todayRes.rows[0].count),
      comisiones_hoy: parseFloat(feesRes.rows[0].fees_today),
      comisiones_total: parseFloat(feesRes.rows[0].fees_total),
      jugadores_registrados: parseInt(leaderboardRes.rows[0].count),
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[adminTruco] stats failed');
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * GET /api/admin/truco/leaderboard?limit=20
 * Ranking de jugadores por partidas ganadas y ganancias.
 */
router.get('/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 100);
  try {
    const result = await query(`
      SELECT
        l.user_phone,
        COALESCE(u.name, l.user_phone) AS nombre,
        l.matches_played,
        l.matches_won,
        (l.matches_played - l.matches_won) AS matches_lost,
        l.total_won AS total_earned,
        CASE WHEN l.matches_played > 0
          THEN ROUND(l.matches_won::numeric / l.matches_played * 100, 1)
          ELSE 0
        END AS win_pct
      FROM truco_leaderboards l
      LEFT JOIN users u ON u.phone_number = l.user_phone
      ORDER BY l.matches_won DESC, l.total_won DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error: any) {
    logger.error({ error: error.message }, '[adminTruco] leaderboard failed');
    res.status(500).json({ error: 'Error al obtener el ranking' });
  }
});

/**
 * GET /api/admin/truco/matches?page=1&limit=20&status=PAYOUT_DONE
 * Historial de partidas recientes.
 */
router.get('/matches', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 100);
  const page  = Math.max(parseInt(String(req.query.page  ?? '1')), 1);
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  try {
    const params: any[] = [limit, offset];
    const statusClause = status ? `AND m.status = $3` : '';
    if (status) params.push(status);

    const result = await query(`
      SELECT
        m.id,
        m.player_a_phone,
        COALESCE(ua.name, m.player_a_phone) AS nombre_a,
        m.player_b_phone,
        COALESCE(ub.name, m.player_b_phone) AS nombre_b,
        m.bet_amount,
        m.pot_amount,
        m.fee_amount,
        m.status,
        m.score_a,
        m.score_b,
        m.winner_phone,
        COALESCE(uw.name, m.winner_phone) AS nombre_ganador,
        m.created_at,
        m.finished_at,
        EXTRACT(EPOCH FROM (m.finished_at - m.created_at))::int AS duracion_seg
      FROM truco_matches m
      LEFT JOIN users ua ON ua.phone_number = m.player_a_phone
      LEFT JOIN users ub ON ub.phone_number = m.player_b_phone
      LEFT JOIN users uw ON uw.phone_number = m.winner_phone
      WHERE 1=1 ${statusClause}
      ORDER BY m.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) AS total FROM truco_matches
      WHERE 1=1 ${status ? `AND status = '${status.replace(/'/g, '')}'` : ''}
    `);

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, '[adminTruco] matches failed');
    res.status(500).json({ error: 'Error al obtener partidas' });
  }
});

export default router;
