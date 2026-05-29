'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, DollarSign, CreditCard, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);
}

export const RevenueDashboard: React.FC = () => {
  const { data: summary, isLoading: loadingSum } = useQuery({
    queryKey: ['revenueSummary'],
    queryFn: async () => {
      const res = await api.get('/api/admin/finance/revenue/summary');
      return res.data;
    },
    refetchInterval: 30000,
  });

  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ['revenueDaily'],
    queryFn: async () => {
      const res = await api.get('/api/admin/finance/revenue/daily');
      return res.data.chartData as Array<{ name: string; revenue: number; fees: number; cards: number }>;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Ingresos por Cartones (30 días)</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Total cobrado a usuarios por cartones confirmados y pagados</p>
          <div className="flex items-center justify-between mt-2">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loadingSum ? '...' : formatARS(summary?.totalSales ?? 0)}
            </h4>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Ganancia Neta Plataforma (30 días)</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Solo el fee retenido por BinGo (sin jackpot ni premios)</p>
          <div className="flex items-center justify-between mt-2">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loadingSum ? '...' : formatARS(summary?.platformFees ?? 0)}
            </h4>
            <TrendingUp className="w-5 h-5 text-indigo-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Cartones Vendidos (30 días)</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Reservas confirmadas y pagadas</p>
          <div className="flex items-center justify-between mt-2">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loadingSum ? '...' : (summary?.totalCards ?? 0)}
            </h4>
            <CreditCard className="w-5 h-5 text-blue-500" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Jugadores Activos (30 días)</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Usuarios únicos con al menos un cartón comprado</p>
          <div className="flex items-center justify-between mt-2">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loadingSum ? '...' : (summary?.activePlayers ?? 0)}
            </h4>
            <Users className="w-5 h-5 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Gráfico de los últimos 7 días */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          Ingresos vs Fee de Plataforma (Últimos 7 días)
        </h3>
        <p className="text-xs text-gray-400 mb-6">
          Azul = ventas totales de cartones confirmados · Verde = fee retenido por la plataforma
        </p>
        {loadingDaily ? (
          <div className="h-[300px] flex items-center justify-center text-gray-400">Cargando...</div>
        ) : !daily || daily.length === 0 ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 gap-2">
            <DollarSign className="w-8 h-8 opacity-20" />
            <p className="text-sm">Sin ventas en los últimos 7 días</p>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => formatARS(v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => [
                    formatARS(value),
                    name === 'revenue' ? 'Ventas' : 'Fee plataforma',
                  ]}
                />
                <Bar dataKey="revenue" name="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="fees" name="fees" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
