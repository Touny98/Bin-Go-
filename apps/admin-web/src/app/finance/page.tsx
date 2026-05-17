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
            Financial Command Center
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Real-time financial intelligence & operations</p>
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
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('ledger')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'ledger' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <History className="w-4 h-4" />
            Ledger
          </button>
          <button 
            onClick={() => setActiveTab('payouts')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'payouts' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            Payouts
          </button>
          <button 
            onClick={() => setActiveTab('risk')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'risk' ? "bg-indigo-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            )}
          >
            <BarChart4 className="w-4 h-4" />
            Risk
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard 
          title="Daily Revenue" 
          value={`$${metrics?.business.dailyRevenue.toLocaleString()}`} 
          icon={<ArrowUpRight className="w-6 h-6 text-green-500" />}
        />
        <MetricCard 
          title="Pending Payouts" 
          value={metrics?.business.pendingPayouts || 0} 
          icon={<ArrowDownLeft className="w-6 h-6 text-orange-500" />}
        />
        <MetricCard 
          title="Liquidity Ratio" 
          value="2.5x" 
          icon={<Wallet className="w-6 h-6 text-blue-500" />}
        />
        <MetricCard 
          title="Risk Threshold" 
          value="98.5" 
          icon={<ShieldCheck className="w-6 h-6 text-indigo-500" />}
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
            Ledger Explorer
          </h3>
          <LedgerExplorer />
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-orange-500" />
              Payout Review Queue
            </h3>
            <PayoutReviewQueue />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
              <h4 className="font-bold mb-4">Operator Activity</h4>
              <p className="text-sm text-gray-500 italic">"Admin John Doe is currently reviewing payout pay_123..."</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl text-white">
              <h4 className="font-bold mb-2">Automated Payouts</h4>
              <p className="text-xs opacity-80 mb-4">Auto-approval threshold: $50.00</p>
              <button className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-all">
                CONFIGURE LIMITS
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
              Live Fraud Alerts
            </h4>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 rounded-lg text-xs">
                Suspicious IP cluster detected in Argentina. Potential multi-account farming.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
