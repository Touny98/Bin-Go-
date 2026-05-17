'use client';

import React from 'react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { CheckSquare, AlertCircle, RefreshCw } from 'lucide-react';

const data = [
  { x: 10, y: 10, z: 200, name: 'Matched' },
  { x: 20, y: 30, z: 260, name: 'Matched' },
  { x: 30, y: 20, z: 400, name: 'Matched' },
  { x: 40, y: 40, z: 280, name: 'Mismatch', fill: '#ef4444' },
  { x: 50, y: 50, z: 500, name: 'Matched' },
  { x: 60, y: 10, z: 200, name: 'Orphaned', fill: '#f59e0b' },
];

export const ReconciliationDashboard: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-green-500" />
          Reconciliation Health
        </h3>
        <button className="flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold hover:bg-indigo-100 transition-colors">
          <RefreshCw className="w-3 h-3 animate-spin-slow" />
          RUN RECONCILIATION
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis type="number" dataKey="x" name="Transaction ID" stroke="#9CA3AF" fontSize={10} />
              <YAxis type="number" dataKey="y" name="Status Code" stroke="#9CA3AF" fontSize={10} />
              <ZAxis type="number" dataKey="z" range={[60, 400]} name="Amount" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter name="Transactions" data={data} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase">Success Rate</span>
              <span className="text-sm font-bold text-green-600">99.8%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
              <div className="h-full bg-green-500 w-[99.8%]" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-medium">Mismatches</span>
            </div>
            <span className="text-xs font-bold text-red-600">3</span>
          </div>

          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-medium">Orphaned TXs</span>
            </div>
            <span className="text-xs font-bold text-yellow-600">7</span>
          </div>
          
          <div className="pt-4">
            <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase">Recent Incident</p>
            <p className="text-[10px] text-gray-600 dark:text-gray-400">"ID: tx_882 mismatch on provider confirmation. Resolved by system."</p>
          </div>
        </div>
      </div>
    </div>
  );
};
