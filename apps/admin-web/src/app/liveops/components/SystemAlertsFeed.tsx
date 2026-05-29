'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';

export interface Alert {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'ERROR';
  message: string;
  timestamp: string;
  correlationId?: string;
}

interface SystemAlertsFeedProps {
  alerts: Alert[];
}

export const SystemAlertsFeed: React.FC<SystemAlertsFeedProps> = ({ alerts }) => {
  const getIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'ERROR':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'WARNING':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700 h-[400px] flex flex-col">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
        Alertas del Sistema
        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">En vivo</span>
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">Sin alertas activas</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div 
              key={alert.id}
              className={clsx(
                "p-3 rounded-lg border-l-4 transition-all duration-300",
                alert.severity === 'CRITICAL' || alert.severity === 'ERROR' 
                  ? "bg-red-50 dark:bg-red-900/10 border-red-500" 
                  : alert.severity === 'WARNING' 
                  ? "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-500"
                  : "bg-blue-50 dark:bg-blue-900/10 border-blue-500"
              )}
            >
              <div className="flex items-start gap-3">
                {getIcon(alert.severity)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                    {alert.correlationId && (
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">
                        ID: {alert.correlationId.substring(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
