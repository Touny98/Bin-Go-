'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

interface Room {
  id: number;
  name: string;
  description: string;
  card_price: number;
  platform_fee: number;
  jackpot_fee: number;
  game_mode: string;
  max_balls: number;
  tie_rule: string;
  interval_minutes: number | null;
  daily_times: string[];
  weekly_day: number | null;
  weekly_time: string | null;
  is_featured: boolean;
  accumulated_jackpot: number;
  active_sessions: number;
  finished_sessions: number;
  record_jackpot: number;
}

interface JackpotStats {
  id: number;
  name: string;
  game_mode: string;
  accumulated_jackpot: number;
  current_session_jackpot: number;
  record_payout: number;
  total_rollovers: number;
}

const GAME_MODE_LABELS: Record<string, string> = {
  SALE_O_SALE: '⚡ Sale o Sale',
  ACCUMULATIVE: '🏆 Acumulativo',
};

const WEEKDAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [jackpotStats, setJackpotStats] = useState<JackpotStats[]>([]);
  const [editing, setEditing] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [rRes, jRes] = await Promise.all([
        api.get('/api/admin/rooms'),
        api.get('/api/admin/jackpot/stats'),
      ]);
      setRooms(rRes.data);
      setJackpotStats(jRes.data);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/api/admin/rooms/${editing.id}`, editing);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  const getStats = (roomId: number) =>
    jackpotStats.find(s => s.id === roomId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">🎰 Salas de Bingo</h1>
        <span className="text-xs text-gray-400">Actualización automática cada 15s</span>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 rounded p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {rooms.map(room => {
          const stats = getStats(room.id);
          const totalJackpot = (stats?.current_session_jackpot ?? 0) + (stats?.accumulated_jackpot ?? 0);

          return (
            <div
              key={room.id}
              className={`bg-gray-800 rounded-xl border ${
                room.is_featured ? 'border-yellow-500' : 'border-gray-700'
              } overflow-hidden`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-750">
                <div className="flex items-center gap-3">
                  {room.is_featured && (
                    <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded">
                      DESTACADA
                    </span>
                  )}
                  <h2 className="text-xl font-bold text-white">{room.name}</h2>
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                    {GAME_MODE_LABELS[room.game_mode] ?? room.game_mode}
                  </span>
                </div>
                <button
                  onClick={() => setEditing({ ...room })}
                  className="text-sm text-blue-400 hover:text-blue-300 border border-blue-700 hover:border-blue-500 px-3 py-1 rounded transition-colors"
                >
                  ✏️ Editar
                </button>
              </div>

              {/* Jackpot destacado */}
              <div className="px-6 py-4 bg-gradient-to-r from-gray-800 to-gray-750 border-b border-gray-700">
                <div className="flex items-end gap-6">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">💰 Jackpot actual</p>
                    <p className="text-3xl font-black text-yellow-400">{formatARS(totalJackpot)}</p>
                    {stats?.accumulated_jackpot > 0 && (
                      <p className="text-xs text-orange-400 mt-1">
                        ↑ incluye {formatARS(stats.accumulated_jackpot)} acumulado
                        ({stats.total_rollovers} semana{stats.total_rollovers !== 1 ? 's' : ''} sin ganador)
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    <span>Récord: </span>
                    <span className="text-white font-semibold">{formatARS(stats?.record_payout ?? 0)}</span>
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4">
                <InfoCell label="Precio cartón" value={formatARS(room.card_price)} />
                <InfoCell label="Fee plataforma" value={formatARS(room.platform_fee)} />
                <InfoCell label="Aporte jackpot" value={formatARS(room.jackpot_fee)} />
                <InfoCell label="Máx. bolillas" value={`${room.max_balls} bolas`} />
                <InfoCell
                  label="Horario"
                  value={
                    room.interval_minutes
                      ? `Cada ${room.interval_minutes} min`
                      : room.daily_times?.length
                      ? (Array.isArray(room.daily_times) ? room.daily_times : JSON.parse(room.daily_times as any)).join(' y ') + ' hs'
                      : room.weekly_day != null
                      ? `${WEEKDAY_NAMES[room.weekly_day]} ${room.weekly_time}`
                      : '—'
                  }
                />
                <InfoCell label="Sesiones activas" value={String(room.active_sessions ?? 0)} />
                <InfoCell label="Partidas jugadas" value={String(room.finished_sessions ?? 0)} />
                <InfoCell label="Empate" value={room.tie_rule === 'SPLIT' ? 'Divide jackpot' : 'Aleatorio'} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-600 w-full max-w-lg max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-white">Editar {editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Nombre">
                <input className={INPUT_CLS} value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Descripción">
                <textarea className={INPUT_CLS} rows={2} value={editing.description ?? ''}
                  onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Precio cartón ($)">
                  <input type="number" className={INPUT_CLS} value={editing.card_price}
                    onChange={e => setEditing({ ...editing, card_price: +e.target.value })} />
                </Field>
                <Field label="Fee plataforma ($)">
                  <input type="number" className={INPUT_CLS} value={editing.platform_fee}
                    onChange={e => setEditing({ ...editing, platform_fee: +e.target.value })} />
                </Field>
                <Field label="Aporte jackpot ($)">
                  <input type="number" className={INPUT_CLS} value={editing.jackpot_fee}
                    onChange={e => setEditing({ ...editing, jackpot_fee: +e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Modalidad">
                  <select className={INPUT_CLS} value={editing.game_mode}
                    onChange={e => setEditing({ ...editing, game_mode: e.target.value })}>
                    <option value="SALE_O_SALE">Sale o Sale</option>
                    <option value="ACCUMULATIVE">Acumulativo</option>
                  </select>
                </Field>
                <Field label="Máx. bolillas">
                  <input type="number" className={INPUT_CLS} value={editing.max_balls}
                    onChange={e => setEditing({ ...editing, max_balls: +e.target.value })} />
                </Field>
              </div>
              <Field label="Intervalo express (min, vacío = no)">
                <input type="number" className={INPUT_CLS}
                  value={editing.interval_minutes ?? ''}
                  onChange={e => setEditing({ ...editing, interval_minutes: e.target.value ? +e.target.value : null })} />
              </Field>
              <Field label='Horarios diarios (ej: ["14:00","23:00"])'>
                <input className={INPUT_CLS}
                  value={JSON.stringify(editing.daily_times ?? [])}
                  onChange={e => {
                    try { setEditing({ ...editing, daily_times: JSON.parse(e.target.value) }); } catch { }
                  }} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Día semanal (0=Dom…6=Sáb)">
                  <input type="number" min={0} max={6} className={INPUT_CLS}
                    value={editing.weekly_day ?? ''}
                    onChange={e => setEditing({ ...editing, weekly_day: e.target.value ? +e.target.value : null })} />
                </Field>
                <Field label="Hora semanal (HH:MM)">
                  <input className={INPUT_CLS} value={editing.weekly_time ?? ''}
                    onChange={e => setEditing({ ...editing, weekly_time: e.target.value || null })} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={editing.is_featured}
                  onChange={e => setEditing({ ...editing, is_featured: e.target.checked })} />
                Sala destacada (Domingo Millonario)
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-semibold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  'w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white ' +
  'focus:outline-none focus:border-blue-500';
