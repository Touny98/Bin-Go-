'use client';

import React from 'react';
import { useLiveMetrics } from './hooks/useLiveMetrics';
import { MetricCard } from './components/MetricCard';
import { QueueDepthChart } from './components/QueueDepthChart';
import { SystemAlertsFeed } from './components/SystemAlertsFeed';
import { WorkerStatusTable } from './components/WorkerStatusTable';
import { 
  Activity, 
  DollarSign, 
  Users, 
  Home, 
  Wifi, 
  WifiOff, 
  AlertCircle 
} from 'lucide-react';
import clsx from 'clsx';

export default function LiveOpsPage() {
  const { metrics, alerts, isLoading, isError, isStale, isConnected } = useLiveMetrics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Inicializando Torre de Control...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Conexión Fallida</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">No pudimos conectarnos al Centro de Control de Operaciones. Por favor, verifica tus credenciales y tu conexión de red.</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Reintentar Conexión
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
            Centro de Operaciones en Vivo
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Monitoreo y control de la plataforma en tiempo real</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
            isConnected 
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse"
          )}>
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'CONEXIÓN ACTIVA' : 'RECONECTANDO...'}
          </div>
          
          {isStale && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-sm font-bold">
              <Activity className="w-4 h-4 animate-bounce" />
              DATOS DESACTUALIZADOS
            </div>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        {/* Metric Cards */}
        <div className="lg:col-span-1 space-y-6">
          <MetricCard 
            title="Ingresos Diarios" 
            value={`$${metrics?.business.dailyRevenue.toLocaleString()}`} 
            icon={<DollarSign className="w-6 h-6" />}
            description="Monto total acumulado por ventas de cartones de juego durante el día de hoy."
          />
          <MetricCard 
            title="Salas Activas" 
            value={metrics?.business.activeRooms} 
            icon={<Home className="w-6 h-6" />}
            description="Salas de Bingo habilitadas en el sistema que están programando o corriendo partidas."
          />
          <MetricCard 
            title="Jugadores en Línea" 
            value={metrics?.presence.online} 
            icon={<Users className="w-6 h-6" />}
            description="Usuarios con conexión activa en tiempo real o interacción de chat en los últimos 5 minutos."
          />
        </div>

        {/* Chart & Alerts */}
        <div className="lg:col-span-2">
          <QueueDepthChart data={metrics?.queueDepths || {}} />
        </div>
        
        <div className="lg:col-span-1">
          <SystemAlertsFeed alerts={alerts} />
        </div>
      </div>

      {/* Worker Table */}
      <div className="grid grid-cols-1 gap-6">
        <WorkerStatusTable 
          workers={[
            {
              id: 'worker-1',
              type: 'Gateway en Tiempo Real',
              health: metrics?.system.redisHealth === 'healthy' ? 'HEALTHY' : 'DEGRADED',
              uptime: 12450,
              jobsPerSec: 45.2,
              queueLag: 12,
              retries: 2,
              memoryUsage: metrics?.system.memoryUsage || 0,
              lastHeartbeat: new Date().toISOString()
            },
            {
              id: 'worker-2',
              type: 'Procesador de Retiros',
              health: metrics?.health?.db ? 'HEALTHY' : 'DEGRADED',
              uptime: 86400,
              jobsPerSec: 2.1,
              queueLag: metrics?.queueDepths?.payout ?? 0,
              retries: 0,
              memoryUsage: 124.5,
              lastHeartbeat: new Date().toISOString()
            }
          ]} 
        />
      </div>
    </main>
  );
}
