'use client';

import React, { useState } from 'react';
import { useLiveMetrics } from '../liveops/hooks/useLiveMetrics';
import { MetricCard } from '../liveops/components/MetricCard';
import { LedgerExplorer } from './components/LedgerExplorer';
import { PayoutReviewQueue } from './components/PayoutReviewQueue';
import { RevenueDashboard } from './components/RevenueDashboard';
import { LiquidityDashboard } from './components/LiquidityDashboard';
import { RiskDashboard } from './components/RiskDashboard';
import { ReconciliationDashboard } from './components/ReconciliationDashboard';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ShieldCheck, 
  History,
  LayoutDashboard,
  Activity,
  BarChart4
} from 'lucide-react';
import clsx from 'clsx';

export default function FinancePage() {
  const { metrics } = useLiveMetrics();
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'payouts' | 'risk'>('overview');

  return (
    <main className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
            Centro de Control Financiero
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Inteligencia y operaciones financieras en tiempo real</p>
        </div>
        
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <button 
            onClick={() => setActiveTab('overview')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'overview' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Resumen
          </button>
          <button 
            onClick={() => setActiveTab('ledger')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'ledger' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <History className="w-4 h-4" />
            Libro Mayor
          </button>
          <button 
            onClick={() => setActiveTab('payouts')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'payouts' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            Retiros
          </button>
          <button 
            onClick={() => setActiveTab('risk')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'risk' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <BarChart4 className="w-4 h-4" />
            Riesgo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Ingresos del día"
          value={`$${(metrics?.business.dailyRevenue || 0).toLocaleString('es-AR')}`}
          icon={<ArrowUpRight className="w-6 h-6 text-green-500" />}
          description="Total cobrado hoy por ventas de cartones. Si es $0, no hubo partidas hoy todavía."
        />
        <MetricCard
          title="Retiros sin procesar"
          value={metrics?.business.pendingPayouts || 0}
          icon={<ArrowDownLeft className="w-6 h-6 text-orange-500" />}
          description="Usuarios que pidieron retirar dinero y están esperando que vos les hagas la transferencia. Ir a pestaña Retiros."
        />
        <MetricCard
          title="Salud financiera"
          value="✅ Normal"
          icon={<Wallet className="w-6 h-6 text-blue-500" />}
          description="Indica si el sistema tiene fondos suficientes para cubrir todos los premios comprometidos."
        />
        <MetricCard
          title="Alertas de fraude"
          value="0 hoy"
          icon={<ShieldCheck className="w-6 h-6 text-indigo-500" />}
          description="Retiros bloqueados automáticamente por comportamiento sospechoso (muchos retiros seguidos, montos altos, etc.)."
        />
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RevenueDashboard />
          <LiquidityDashboard />
          <RiskDashboard />
          <ReconciliationDashboard />
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            Explorador de Libro Mayor
          </h3>
          <LedgerExplorer />
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-500" />
              Cola de Revisión de Retiros
            </h3>
            <PayoutReviewQueue />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
              <h4 className="font-bold mb-4">Actividad del Operador</h4>
              <p className="text-sm text-gray-500 italic">"El administrador Juan Pérez está revisando el retiro pay_123..."</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl text-white">
              <h4 className="font-bold mb-2">Retiros Automatizados</h4>
              <p className="text-xs opacity-80 mb-4">Umbral de auto-aprobación: $50.00</p>
              <button className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-all">
                CONFIGURAR LÍMITES
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="space-y-8">
          <RiskDashboard />
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-red-500" />
              Alertas de Fraude en Vivo
            </h4>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 rounded-lg text-xs">
                Grupo de IPs sospechosas detectado en Argentina. Posible granja multicuentas.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
