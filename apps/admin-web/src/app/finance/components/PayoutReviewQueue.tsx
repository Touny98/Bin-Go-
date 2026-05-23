'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  User, 
  DollarSign,
  ArrowRight,
  Lock,
  Unlock,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';

export interface PayoutRequest {
  id: string;
  userId: string;
  username: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  riskScore: number;
  timestamp: string;
}

const mockPayouts: PayoutRequest[] = [
  { id: 'pay-1', userId: 'u-123', username: 'john_doe', amount: 500, status: 'PENDING', riskScore: 15, timestamp: new Date().toISOString() },
  { id: 'pay-2', userId: 'u-456', username: 'jane_smith', amount: 1200, status: 'PENDING', riskScore: 85, timestamp: new Date().toISOString() },
  { id: 'pay-3', userId: 'u-789', username: 'bob_builder', amount: 50, status: 'PENDING', riskScore: 5, timestamp: new Date().toISOString() },
];

export const PayoutReviewQueue: React.FC = () => {
  const queryClient = useQueryClient();
  const [localPayouts, setLocalPayouts] = useState(mockPayouts);
  const [lockingId, setLockingId] = useState<string | null>(null);

  // Get locks from global query state (populated by WebSockets)
  const locks = useQuery({
    queryKey: ['payoutLocks'],
    initialData: {}
  }).data as Record<string, any>;

  const handleLock = async (id: string) => {
    setLockingId(id);
    try {
      await api.post(`/api/admin/finance/lock/${id}`);
      // Lock will be updated via WebSocket, but we can also refetch/update locally
    } catch (err: any) {
      if (err.response?.status === 409) {
        alert(`Resource is already locked by ${err.response.data.lockedBy}`);
      }
    } finally {
      setLockingId(null);
    }
  };

  const handleUnlock = async (id: string) => {
    setLockingId(id);
    try {
      await api.delete(`/api/admin/finance/lock/${id}`);
    } finally {
      setLockingId(null);
    }
  };

  const handleAction = (id: string, action: 'APPROVED' | 'REJECTED') => {
    setLocalPayouts(prev => prev.map(p => p.id === id ? { ...p, status: action } : p));
    handleUnlock(id);
  };

  return (
    <div className="space-y-4">
      {localPayouts.filter(p => p.status === 'PENDING').map((payout) => {
        const lock = locks[payout.id];
        const isLockedByMe = lock?.operatorId === 'admin-1'; // Mock ID
        const isLockedByOther = lock && !isLockedByMe;

        return (
          <div 
            key={payout.id} 
            className={clsx(
              "bg-white dark:bg-gray-800 border p-4 rounded-xl shadow-sm transition-all relative overflow-hidden",
              isLockedByMe ? "border-indigo-500 ring-1 ring-indigo-500" : 
              isLockedByOther ? "border-red-200 opacity-75 grayscale-[0.5]" : 
              "border-gray-100 dark:border-gray-700"
            )}
          >
            {isLockedByOther && (
              <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 font-bold rounded-bl-lg flex items-center gap-1">
                <Lock className="w-3 h-3" />
                LOCKED BY {lock.operatorName.toUpperCase()}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">{payout.username}</h4>
                  <p className="text-xs text-gray-500">User ID: {payout.userId}</p>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-lg font-bold text-gray-900 dark:text-gray-100">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    {payout.amount.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-gray-500">{new Date(payout.timestamp).toLocaleTimeString()}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={clsx(
                    "text-[10px] font-bold px-2 py-1 rounded-full",
                    payout.riskScore > 70 ? "bg-red-100 text-red-700" : 
                    payout.riskScore > 30 ? "bg-yellow-100 text-yellow-700" : 
                    "bg-green-100 text-green-700"
                  )}>
                    RISK: {payout.riskScore}
                  </span>
                </div>

                <div className="flex items-center gap-2 border-l border-gray-100 dark:border-gray-700 pl-6">
                  {!lock ? (
                    <button 
                      onClick={() => handleLock(payout.id)}
                      disabled={lockingId === payout.id}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 rounded-lg transition-all"
                      title="Acquire Lock"
                    >
                      {lockingId === payout.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Unlock className="w-5 h-5" />}
                    </button>
                  ) : isLockedByMe ? (
                    <>
                      <button 
                        onClick={() => handleAction(payout.id, 'REJECTED')}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={() => handleAction(payout.id, 'APPROVED')}
                        className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500 rounded-lg transition-colors"
                      >
                        <CheckCircle className="w-6 h-6" />
                      </button>
                      <button 
                        onClick={() => handleUnlock(payout.id)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-indigo-500 rounded-lg transition-all"
                        title="Release Lock"
                      >
                        <Lock className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <div className="p-2 text-red-400">
                      <Lock className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
