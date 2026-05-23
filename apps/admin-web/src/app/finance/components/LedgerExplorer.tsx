'use client';

import React, { useState } from 'react';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRight,
  Search,
  Filter,
} from 'lucide-react';
import clsx from 'clsx';

export interface LedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  description: string;
  timestamp: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
}

const mockEntries: LedgerEntry[] = [
  { id: 'tx-1', type: 'CREDIT', category: 'DEPOSIT', amount: 500, description: 'User deposit via MercadoPago', timestamp: new Date().toISOString(), status: 'COMPLETED' },
  { id: 'tx-2', type: 'DEBIT', category: 'WITHDRAWAL', amount: 200, description: 'User withdrawal request', timestamp: new Date().toISOString(), status: 'COMPLETED' },
  { id: 'tx-3', type: 'CREDIT', category: 'GAME_WIN', amount: 1500, description: 'Bingo Jackpot Win - Room #42', timestamp: new Date().toISOString(), status: 'COMPLETED' },
  { id: 'tx-4', type: 'DEBIT', category: 'CARD_PURCHASE', amount: 10, description: 'Bingo Card Purchase - Room #42', timestamp: new Date().toISOString(), status: 'COMPLETED' },
];

export const LedgerExplorer: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* ... existing header ... */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search transactions..." 
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-sm font-medium transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {mockEntries.map((entry) => (
              <React.Fragment key={entry.id}>
                <tr className={clsx(
                  "hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer",
                  expandedId === entry.id && "bg-indigo-50/50 dark:bg-indigo-900/10"
                )}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {entry.type === 'CREDIT' ? (
                        <ArrowUpCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="w-5 h-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{entry.description}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{entry.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg">
                      {entry.category}
                    </span>
                  </td>
                  <td className={clsx(
                    "px-6 py-4 text-right font-bold text-sm",
                    entry.type === 'CREDIT' ? "text-green-600" : "text-red-600"
                  )}>
                    {entry.type === 'CREDIT' ? '+' : '-'}${entry.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{entry.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-indigo-500 hover:text-indigo-600">
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                {expandedId === entry.id && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-4">Transaction Timeline</h5>
                          <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
                            <div className="relative pl-6">
                              <div className="absolute left-0 top-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                              <p className="text-xs font-bold">Transaction Created</p>
                              <p className="text-[10px] text-gray-500">14:20:05 - System</p>
                            </div>
                            <div className="relative pl-6">
                              <div className="absolute left-0 top-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white dark:border-gray-800" />
                              <p className="text-xs font-bold">Ledger Verified</p>
                              <p className="text-[10px] text-gray-500">14:20:06 - Worker:ledger-01</p>
                            </div>
                            <div className="relative pl-6">
                              <div className="absolute left-0 top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800" />
                              <p className="text-xs font-bold">Payout Initiated</p>
                              <p className="text-[10px] text-gray-500">14:20:10 - Admin:JohnDoe</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-6">
                          <div>
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Audit Trace</h5>
                            <p className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                              correlation_id: track_9921_ax<br/>
                              trace_parent: 00-4bf92...<br/>
                              operator_id: admin_42
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button className="flex-1 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">
                              View Trace
                            </button>
                            <button className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50">
                              Replay Event
                            </button>
                          </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-4">Metadata Analysis</h5>
                          <div className="space-y-3">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Device</span>
                              <span className="font-bold">iPhone 14 Pro</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">IP Geolocation</span>
                              <span className="font-bold">Buenos Aires, AR</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Risk Score</span>
                              <span className="text-green-500 font-bold">Low (5.2)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
