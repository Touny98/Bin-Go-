'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Activity,
  DollarSign,
  LayoutDashboard,
  ArrowRight,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';

function StatBadge({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  );
}

export default function HomePage() {
  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ['payoutsPending'],
    queryFn: async () => {
      const res = await api.get('/api/admin/finance/payouts/pending');
      return res.data as any[];
    },
    refetchInterval: 10000,
  });

  const sections = [
    {
      href: '/liveops',
      icon: Activity,
      iconColor: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/20',
      title: 'Operaciones en Vivo',
      description: 'Métricas en tiempo real, estado de workers, colas BullMQ y alertas del sistema.',
      stats: [
        { label: 'Juegos activos', value: '—' },
        { label: 'Workers', value: '✅ OK' },
      ],
      badge: null,
    },
    {
      href: '/finance',
      icon: DollarSign,
      iconColor: 'text-indigo-400',
      bgColor: 'bg-indigo-500/10 border-indigo-500/20',
      title: 'Centro Financiero',
      description: 'Retiros pendientes, libro mayor de transacciones, métricas de ingresos y análisis de riesgo.',
      stats: [
        { label: 'Retiros pendientes', value: pendingPayouts.length },
        { label: 'Pestaña', value: 'Retiros' },
      ],
      badge: pendingPayouts.length > 0
        ? { label: `${pendingPayouts.length} requieren acción`, color: 'bg-orange-500' }
        : { label: 'Todo al día', color: 'bg-green-500' },
    },
    {
      href: '/rooms',
      icon: LayoutDashboard,
      iconColor: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
      title: 'Gestión de Salas',
      description: 'Configuración de salas de bingo, precios de cartones, horarios y modo de juego.',
      stats: [
        { label: 'Salas', value: '3 activas' },
        { label: 'Modos', value: 'Express · Diario · Semanal' },
      ],
      badge: null,
    },
  ];

  return (
    <main className="p-6 md:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
              BinGo! Admin
            </h1>
            <p className="text-gray-500 text-sm">Panel de control operativo</p>
          </div>
        </div>
      </div>

      {/* Alert de retiros pendientes */}
      {pendingPayouts.length > 0 && (
        <Link href="/finance" className="block mb-6">
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-center gap-4 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-orange-800 dark:text-orange-200">
                {pendingPayouts.length} retiro{pendingPayouts.length !== 1 ? 's' : ''} esperando aprobación
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Hacé click para revisar y aprobar los retiros pendientes
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-orange-500 shrink-0" />
          </div>
        </Link>
      )}

      {/* Secciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <div className={`relative bg-white dark:bg-gray-800 border rounded-2xl p-6 hover:shadow-lg transition-all cursor-pointer group h-full ${section.bgColor}`}>
                {/* Badge */}
                {section.badge && (
                  <span className={`absolute top-4 right-4 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ${section.badge.color}`}>
                    {section.badge.label}
                  </span>
                )}

                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${section.iconColor}`} />
                </div>

                {/* Title & Description */}
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {section.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  {section.description}
                </p>

                {/* Stats */}
                <div className="flex gap-3 flex-wrap">
                  {section.stats.map((stat, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                      <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Arrow */}
                <div className="mt-4 flex items-center gap-1 text-sm font-medium text-indigo-500 group-hover:gap-2 transition-all">
                  Ir a {section.title}
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick access */}
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          Acceso rápido
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/finance" className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
            <DollarSign className="w-4 h-4 text-indigo-400" />
            Ver retiros
          </Link>
          <Link href="/finance" className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Libro mayor
          </Link>
          <Link href="/liveops" className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
            <Activity className="w-4 h-4 text-blue-400" />
            Workers
          </Link>
          <Link href="/rooms" className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
            <LayoutDashboard className="w-4 h-4 text-purple-400" />
            Salas
          </Link>
        </div>
      </div>

      {/* Info de acceso */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-500">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">📊 Queue Monitor</p>
          <a href="http://localhost:3010/admin/queues" target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 hover:underline text-xs">
            localhost:3010/admin/queues →
          </a>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">🌐 ngrok Tunnel</p>
          <a href="http://localhost:4040" target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 hover:underline text-xs">
            localhost:4040 →
          </a>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">🐘 Base de datos</p>
          <p className="text-xs">localhost:5432 · bingo_db</p>
        </div>
      </div>
    </main>
  );
}
