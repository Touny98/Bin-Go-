'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Swords,
  TrendingUp,
  Users,
  Trophy,
  Clock,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface TrucoStats {
  partidas_activas: number;
  partidas_hoy: number;
  comisiones_hoy: number;
  comisiones_total: number;
  jugadores_registrados: number;
}

interface LeaderboardRow {
  user_phone: string;
  nombre: string;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  total_earned: number;
  win_pct: number;
}

interface MatchRow {
  id: string;
  nombre_a: string;
  nombre_b: string;
  bet_amount: number;
  fee_amount: number | null;
  status: string;
  score_a: number;
  score_b: number;
  nombre_ganador: string | null;
  created_at: string;
  finished_at: string | null;
  duracion_seg: number | null;
}

interface MatchesResponse {
  data: MatchRow[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ars(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function duracion(seg: number | null) {
  if (!seg) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}m ${s}s`;
}

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  MATCH_FOUND: 'Emparejados',
  BET_LOCKED: 'Apuesta bloqueada',
  DEAL: 'Repartiendo',
  HAND_PLAY: 'En juego',
  HAND_RESOLVED: 'Mano resuelta',
  GAME_OVER: 'Terminada',
  PAYOUT_DONE: 'Pagado',
  ABANDONED: 'Abandonada',
};

const STATUS_COLOR: Record<string, string> = {
  MATCH_FOUND: 'bg-blue-100 text-blue-700',
  BET_LOCKED: 'bg-yellow-100 text-yellow-700',
  DEAL: 'bg-purple-100 text-purple-700',
  HAND_PLAY: 'bg-green-100 text-green-700',
  HAND_RESOLVED: 'bg-teal-100 text-teal-700',
  GAME_OVER: 'bg-gray-100 text-gray-600',
  PAYOUT_DONE: 'bg-emerald-100 text-emerald-700',
  ABANDONED: 'bg-red-100 text-red-700',
};

// ─── Componentes ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  title,
  value,
  sub,
  color = 'indigo',
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center text-${color}-600 dark:text-${color}-400`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</span>
      </div>
      <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const MATCHES_PER_PAGE = 15;

export default function TrucoPage() {
  const [stats, setStats] = useState<TrucoStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [matches, setMatches] = useState<MatchesResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, lbRes, matchRes] = await Promise.all([
        api.get<TrucoStats>('/api/admin/truco/stats'),
        api.get<LeaderboardRow[]>('/api/admin/truco/leaderboard?limit=20'),
        api.get<MatchesResponse>(`/api/admin/truco/matches?limit=${MATCHES_PER_PAGE}&page=${currentPage}`),
      ]);
      setStats(statsRes.data);
      setLeaderboard(lbRes.data);
      setMatches(matchRes.data);
    } catch {
      setError('No se pudo conectar al servidor. Verificá que el backend esté activo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  // ── Estados de carga/error ──

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Cargando métricas de Truco...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Error de conexión</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => load(page)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const totalPages = matches ? Math.ceil(matches.total / MATCHES_PER_PAGE) : 1;

  return (
    <main className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">

      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Swords className="w-7 h-7 text-indigo-500" />
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              Truco
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400">Partidas, ranking e ingresos del juego de Truco</p>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          icon={<Swords className="w-5 h-5" />}
          title="Partidas activas"
          value={stats?.partidas_activas ?? '—'}
          sub="En este momento"
          color="indigo"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          title="Partidas hoy"
          value={stats?.partidas_hoy ?? '—'}
          sub="Finalizadas hoy"
          color="blue"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          title="Comisiones hoy"
          value={stats ? ars(stats.comisiones_hoy) : '—'}
          sub="Ingresos del día"
          color="emerald"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          title="Comisiones totales"
          value={stats ? ars(stats.comisiones_total) : '—'}
          sub="Acumulado histórico"
          color="green"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          title="Jugadores"
          value={stats?.jugadores_registrados ?? '—'}
          sub="Con partidas jugadas"
          color="purple"
        />
      </div>

      {/* Ranking + Historial */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Ranking */}
        <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Ranking de Jugadores</h2>
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              Todavía no hay partidas finalizadas.
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700/50">
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Jugador</th>
                    <th className="px-4 py-2 text-right">Ganadas</th>
                    <th className="px-4 py-2 text-right">% Win</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {leaderboard.map((row, i) => (
                    <tr key={row.user_phone} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[120px]">
                          {row.nombre}
                        </p>
                        <p className="text-xs text-gray-400">{row.matches_played} jugadas</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">
                        {row.matches_won}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={clsx(
                          'text-xs font-bold px-2 py-0.5 rounded-full',
                          row.win_pct >= 60 ? 'bg-emerald-100 text-emerald-700' :
                          row.win_pct >= 40 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        )}>
                          {row.win_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Historial de partidas */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Historial de Partidas</h2>
            <span className="text-xs text-gray-400">{matches?.total ?? 0} en total</span>
          </div>

          {!matches?.data.length ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              No hay partidas registradas todavía.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-2">Jugadores</th>
                      <th className="px-4 py-2">Apuesta</th>
                      <th className="px-4 py-2">Score</th>
                      <th className="px-4 py-2">Ganador</th>
                      <th className="px-4 py-2">Comisión</th>
                      <th className="px-4 py-2">Duración</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {matches.data.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {m.nombre_a}
                          </p>
                          <p className="text-xs text-gray-400">vs {m.nombre_b}</p>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                          {ars(m.bet_amount)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm">
                          <span className="text-gray-900 dark:text-gray-100">{m.score_a}</span>
                          <span className="text-gray-400 mx-1">-</span>
                          <span className="text-gray-900 dark:text-gray-100">{m.score_b}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {m.nombre_ganador ? (
                            <span className="text-emerald-600 font-medium">{m.nombre_ganador}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {m.fee_amount != null ? ars(m.fee_amount) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {duracion(m.duracion_seg)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={clsx(
                            'text-xs font-semibold px-2 py-0.5 rounded-full',
                            STATUS_COLOR[m.status] ?? 'bg-gray-100 text-gray-600'
                          )}>
                            {STATUS_LABEL[m.status] ?? m.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                          {fechaCorta(m.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-xs text-gray-400">
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
