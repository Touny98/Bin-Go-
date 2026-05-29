'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Users,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
} from 'lucide-react';
import clsx from 'clsx';

interface UserRow {
  phone_number: string | null;
  name: string | null;
  last_name: string | null;
  email: string | null;
  onboarding_completed: boolean;
  created_at: string;
  balance: number;
  bingo_games: number;
  truco_games: number;
}

function ars(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPhone(raw: string | null): string {
  if (!raw) return '';
  // Quitar cualquier sufijo de JID (@s.whatsapp.net, @c.us, @lid) por si quedó persistido
  const clean = String(raw).split('@')[0].replace(/\D/g, '');
  if (!clean) return '';
  return `+${clean}`;
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserRow[]>('/api/admin/users');
      setUsers(res.data);
      setFiltered(res.data);
    } catch {
      setError('No se pudo cargar la lista de usuarios. Verificá que el backend esté activo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) { setFiltered(users); return; }
    setFiltered(users.filter((u) =>
      u.phone_number.includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.last_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    ));
  }, [search, users]);

  if (loading && !users.length) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Cargando usuarios...</p>
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
            onClick={load}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const completed = users.filter((u) => u.onboarding_completed).length;

  return (
    <main className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">

      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-7 h-7 text-indigo-500" />
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              Usuarios
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            {users.length} usuarios registrados · {completed} con perfil completo
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por teléfono, nombre o email..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-right">Bingo</th>
                <th className="px-4 py-3 text-right">Truco</th>
                <th className="px-4 py-3 text-center">Perfil</th>
                <th className="px-4 py-3">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.phone_number} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {u.phone_number ? (
                        formatPhone(u.phone_number)
                      ) : (
                        <span className="text-gray-400 font-sans italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.name || u.last_name ? (
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {[u.name, u.last_name].filter(Boolean).join(' ')}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Sin nombre</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.email ? (
                        <span className="text-gray-700 dark:text-gray-300">{u.email}</span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Sin email</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-emerald-600">
                      {ars(parseFloat(u.balance as any))}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {u.bingo_games}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {u.truco_games}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.onboarding_completed ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fechaCorta(u.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
