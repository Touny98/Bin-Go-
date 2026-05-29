'use client';

import React from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';

const data = [
  { name: 'Liquidez disponible', value: 750000, color: '#10b981' },
  { name: 'Retiros pendientes', value: 150000, color: '#f59e0b' },
  { name: 'Jackpot reservado', value: 300000, color: '#6366f1' },
];

export const LiquidityDashboard: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-500" />
          Liquidez y Pasivos
        </h3>
        <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
          <ShieldCheck className="w-4 h-4" />
          RATIO: 2.5x (SALUDABLE)
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{item.name}</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">${item.value.toLocaleString()}</span>
            </div>
          ))}
          
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-yellow-800 dark:text-yellow-400">Alerta de Reserva Baja</p>
              <p className="text-[10px] text-yellow-700 dark:text-yellow-500 mt-1">Los retiros pendientes están alcanzando el 20% de la liquidez. Considerá recargar la billetera operativa.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
