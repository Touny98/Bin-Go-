'use client';

import React from 'react';
import { Activity, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

export interface WorkerStatus {
  id: string;
  type: string;
  health: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  uptime: number;
  jobsPerSec: number;
  queueLag: number;
  retries: number;
  memoryUsage: number;
  lastHeartbeat: string;
}

interface WorkerStatusTableProps {
  workers: WorkerStatus[];
}

export const WorkerStatusTable: React.FC<WorkerStatusTableProps> = ({ workers }) => {
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          Worker Status
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {workers.length} active workers
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50">
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Worker Type</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uptime</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Throughput</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Lag</th>
              <th className="px-6 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Memory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {workers.map((worker) => (
              <tr key={worker.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{worker.type}</span>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{worker.id.substring(0, 8)}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {worker.health === 'HEALTHY' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : worker.health === 'DEGRADED' ? (
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={clsx(
                      "text-xs font-semibold px-2 py-1 rounded-full",
                      worker.health === 'HEALTHY' ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" :
                      worker.health === 'DEGRADED' ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400" :
                      "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                    )}>
                      {worker.health}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    <Clock className="w-3 h-3" />
                    {formatUptime(worker.uptime)}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-200">
                    {worker.jobsPerSec.toFixed(1)} <span className="text-[10px] text-gray-400">j/s</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={clsx(
                    "text-sm font-mono",
                    worker.queueLag > 100 ? "text-red-500 font-bold" : "text-gray-700 dark:text-gray-200"
                  )}>
                    {worker.queueLag} <span className="text-[10px] text-gray-400">ms</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-200">
                    {worker.memoryUsage.toFixed(0)} <span className="text-[10px] text-gray-400">MB</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function XCircle({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
    </svg>
  );
}
