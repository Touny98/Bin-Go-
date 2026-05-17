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
  LineChart,
  Line
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

const mockData = [
  { name: 'Mon', revenue: 4000, deposits: 2400 },
  { name: 'Tue', revenue: 3000, deposits: 1398 },
  { name: 'Wed', revenue: 2000, deposits: 9800 },
  { name: 'Thu', revenue: 2780, deposits: 3908 },
  { name: 'Fri', revenue: 1890, deposits: 4800 },
  { name: 'Sat', revenue: 2390, deposits: 3800 },
  { name: 'Sun', revenue: 3490, deposits: 4300 },
];

export const RevenueDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Gross Gaming Revenue (GGR)</p>
          <div className="flex items-center justify-between mt-1">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">$24,500</h4>
            <span className="text-xs text-green-500 flex items-center gap-1 font-bold">
              <TrendingUp className="w-3 h-3" />
              +12%
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Net Gaming Revenue (NGR)</p>
          <div className="flex items-center justify-between mt-1">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">$18,200</h4>
            <span className="text-xs text-red-500 flex items-center gap-1 font-bold">
              <TrendingDown className="w-3 h-3" />
              -3%
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Avg Room Profit</p>
          <div className="flex items-center justify-between mt-1">
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">$420</h4>
            <span className="text-xs text-green-500 flex items-center gap-1 font-bold">
              <TrendingUp className="w-3 h-3" />
              +8%
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 h-[400px]">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          Revenue vs Deposits (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            />
            <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="deposits" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
