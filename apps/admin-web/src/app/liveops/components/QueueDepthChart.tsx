'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface QueueDepthChartProps {
  data: Record<string, number>;
}

export const QueueDepthChart: React.FC<QueueDepthChartProps> = ({ data }) => {
  // Convert Record<string, number> to Array for Recharts
  const chartData = useMemo(() => {
    return Object.entries(data).map(([name, value]) => ({
      name: name.replace('Queue', ''),
      depth: value
    }));
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700 h-[300px]">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Queue Pressure</h3>
      <div className="h-full pb-8">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorDepth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis 
              dataKey="name" 
              stroke="#9CA3AF" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
            />
            <YAxis 
              stroke="#9CA3AF" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1F2937', 
                border: 'none', 
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              itemStyle={{ color: '#F9FAFB' }}
            />
            <Area 
              type="monotone" 
              dataKey="depth" 
              stroke="#8884d8" 
              fillOpacity={1} 
              fill="url(#colorDepth)" 
              strokeWidth={2}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
