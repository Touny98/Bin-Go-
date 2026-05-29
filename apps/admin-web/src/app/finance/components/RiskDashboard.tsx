'use client';

import React from 'react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as RechartsTooltip
} from 'recharts';
import { ShieldAlert, Fingerprint, Zap } from 'lucide-react';

const riskData = [
  { subject: 'Multi-cuenta', A: 120, fullMark: 150 },
  { subject: 'Retiros rápidos', A: 98, fullMark: 150 },
  { subject: 'Abuso referidos', A: 86, fullMark: 150 },
  { subject: 'IPs anómalas', A: 99, fullMark: 150 },
  { subject: 'Abuso bonos', A: 85, fullMark: 150 },
];

export const RiskDashboard: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold flex items-center gap-2 text-red-600">
          <ShieldAlert className="w-5 h-5" />
          Inteligencia de Riesgo y Fraude
        </h3>
        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase">
          <Zap className="w-3 h-3 text-yellow-500" />
          Motor en tiempo real: ACTIVO
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={riskData}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#6B7280' }} />
              <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
              <Radar
                name="Risk Level"
                dataKey="A"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.6}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Nivel de amenaza global</span>
              <span className="text-xs font-bold text-yellow-600">MEDIO</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-500 w-[65%]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 text-center">
              <Fingerprint className="w-5 h-5 text-red-500 mx-auto mb-2" />
              <p className="text-[10px] text-gray-500 uppercase font-bold">IPs sospechosas</p>
              <h4 className="text-xl font-bold text-red-600">12</h4>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/30 text-center">
              <ShieldAlert className="w-5 h-5 text-orange-500 mx-auto mb-2" />
              <p className="text-[10px] text-gray-500 uppercase font-bold">Alertas de riesgo</p>
              <h4 className="text-xl font-bold text-orange-600">42</h4>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Anomalía reciente</p>
            <p className="text-xs text-gray-700 dark:text-gray-300 italic">"Velocidad de retiros sospechosa detectada en 3 usuarios en Sala #14. ID: tx_9821"</p>
          </div>
        </div>
      </div>
    </div>
  );
};
