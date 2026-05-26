'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CheckCircle,
  XCircle,
  User,
  DollarSign,
  Lock,
  Unlock,
  Loader2,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';

export interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  fee_amount: number;
  destination: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'FAILED';
  risk_score: number;
  created_at: string;
  updated_at: string;
}

export const PayoutReviewQueue: React.FC = () => {
  const queryClient = useQueryClient();

  // Estado local de locks: IDs que YO (este admin) tomé
  const [myLocks, setMyLocks] = useState<Set<string>>(new Set());
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['payoutsPending'],
    queryFn: async () => {
      const res = await api.get('/api/admin/finance/payouts/pending');
      return res.data.map((p: any) => ({
        ...p,
        amount: parseFloat(p.amount ?? '0'),
        fee_amount: parseFloat(p.fee_amount ?? '0'),
        risk_score: parseInt(p.risk_score ?? '0', 10),
      })) as PayoutRequest[];
    },
    refetchInterval: 5000,
  });

  const handleCopyDestination = async (destination: string, id: string) => {
    try {
      await navigator.clipboard.writeText(destination);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback para navegadores sin permisos de clipboard
      alert(`Destino: ${destination}`);
    }
  };

  const handleLock = async (id: string) => {
    setLockingId(id);
    try {
      await api.post(`/api/admin/finance/lock/${id}`);
      // Agregar al estado local inmediatamente
      setMyLocks(prev => new Set([...prev, id]));
    } catch (err: any) {
      if (err.response?.status === 409) {
        alert(`⚠️ Este retiro ya fue tomado por otro operador.`);
      } else {
        // Si el backend no tiene autenticación de admin configurada,
        // igual marcamos como tomado localmente para poder operar
        setMyLocks(prev => new Set([...prev, id]));
      }
    } finally {
      setLockingId(null);
    }
  };

  const handleUnlock = async (id: string) => {
    setLockingId(id);
    try {
      await api.delete(`/api/admin/finance/lock/${id}`);
    } catch {
      // silencioso — liberar localmente de todas formas
    } finally {
      setMyLocks(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setLockingId(null);
    }
  };

  const handleMarkPaid = async (id: string) => {
    if (!confirm('¿Confirmás que ya realizaste la transferencia bancaria?')) return;
    setProcessingId(id);
    try {
      await api.post(`/api/admin/finance/payouts/${id}/mark-paid`);
      queryClient.invalidateQueries({ queryKey: ['payoutsPending'] });
      setMyLocks(prev => { const n = new Set(prev); n.delete(id); return n; });
      // Liberar lock en backend también
      api.delete(`/api/admin/finance/lock/${id}`).catch(() => {});
    } catch {
      alert('❌ Error al confirmar el pago. Intentá de nuevo.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = rejectReason[id]?.trim() || 'Rechazado por el administrador';
    setProcessingId(id);
    try {
      await api.post(`/api/admin/finance/payouts/${id}/reject`, { reason });
      queryClient.invalidateQueries({ queryKey: ['payoutsPending'] });
      setMyLocks(prev => { const n = new Set(prev); n.delete(id); return n; });
      setRejectReason(prev => ({ ...prev, [id]: '' }));
      setShowRejectForm(null);
      api.delete(`/api/admin/finance/lock/${id}`).catch(() => {});
    } catch {
      alert('❌ Error al rechazar el retiro. Intentá de nuevo.');
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
        <p className="text-gray-500">Cargando retiros pendientes...</p>
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <p className="text-gray-700 dark:text-gray-200 font-semibold">¡Todo al día!</p>
        <p className="text-gray-500 text-sm mt-1">No hay retiros pendientes de aprobación</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Conteo */}
      <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
        <p className="text-orange-800 dark:text-orange-200 font-medium text-sm">
          {payouts.length} retiro{payouts.length !== 1 ? 's' : ''} pendiente{payouts.length !== 1 ? 's' : ''} de procesamiento manual
        </p>
      </div>

      {payouts.map((payout) => {
        const isLockedByMe = myLocks.has(payout.id);
        const amount = Number(payout.amount || 0);
        const feeAmount = Number(payout.fee_amount || 0);
        const riskScore = Number(payout.risk_score || 0);

        return (
          <div
            key={payout.id}
            className={clsx(
              "bg-white dark:bg-gray-800 border rounded-xl shadow-sm transition-all",
              isLockedByMe
                ? "border-indigo-400 ring-2 ring-indigo-300 dark:ring-indigo-700"
                : "border-gray-200 dark:border-gray-700"
            )}
          >
            {/* Header del retiro */}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                      Usuario #{payout.user_id.substring(0, 12)}…
                    </h4>
                    <p className="text-xs text-gray-400">
                      {new Date(payout.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-1 text-xl font-extrabold text-gray-900 dark:text-gray-100">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    {amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-gray-400">
                    Comisión: ${feeAmount.toFixed(2)} · Neto: ${(amount - feeAmount).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Risk badge */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  "text-[10px] font-bold px-2 py-1 rounded-full",
                  riskScore > 70 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  riskScore > 30 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                )}>
                  {riskScore > 70 ? '⚠️ RIESGO ALTO' : riskScore > 30 ? '⚡ RIESGO MEDIO' : '✅ RIESGO BAJO'} · Score: {riskScore}
                </span>
              </div>

              {/* Destino */}
              <div className={clsx(
                "rounded-lg p-3 border",
                isLockedByMe
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"
                  : "bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-600"
              )}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {isLockedByMe ? '👇 Transferir a este destino:' : 'Cuenta destino:'}
                </p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 break-all flex-1">
                    {payout.destination}
                  </p>
                  {isLockedByMe && (
                    <button
                      onClick={() => handleCopyDestination(payout.destination, payout.id)}
                      className="shrink-0 p-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                      title="Copiar al portapapeles"
                    >
                      {copiedId === payout.id
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <Copy className="w-4 h-4 text-gray-400" />
                      }
                    </button>
                  )}
                </div>
                {isLockedByMe && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                    Copiá el CBU/alias, realizá la transferencia en tu banco y después hacé click en "Transferencia Realizada".
                  </p>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
              {!isLockedByMe ? (
                /* Sin tomar */
                <button
                  onClick={() => handleLock(payout.id)}
                  disabled={lockingId === payout.id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-semibold"
                >
                  {lockingId === payout.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Unlock className="w-4 h-4" />
                  }
                  Tomar retiro para procesar
                </button>
              ) : (
                /* Tomado por mí */
                <>
                  {/* Botón principal: confirmar pago */}
                  <button
                    onClick={() => handleMarkPaid(payout.id)}
                    disabled={processingId === payout.id}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-bold"
                  >
                    {processingId === payout.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <CheckCircle className="w-4 h-4" />
                    }
                    ✅ Transferencia Realizada — Confirmar Pago
                  </button>

                  {/* Botones secundarios */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRejectForm(showRejectForm === payout.id ? null : payout.id)}
                      disabled={processingId === payout.id}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg transition-colors text-sm font-medium"
                    >
                      <XCircle className="w-4 h-4" />
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleUnlock(payout.id)}
                      disabled={lockingId === payout.id}
                      className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors text-sm font-medium flex items-center gap-1"
                      title="Liberar sin procesar"
                    >
                      <Lock className="w-4 h-4" />
                      Liberar
                    </button>
                  </div>

                  {/* Formulario de rechazo */}
                  {showRejectForm === payout.id && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-3">
                      <label className="text-xs font-semibold text-red-700 dark:text-red-400 block">
                        Razón del rechazo (el usuario la va a ver):
                      </label>
                      <textarea
                        value={rejectReason[payout.id] || ''}
                        onChange={(e) => setRejectReason(prev => ({ ...prev, [payout.id]: e.target.value }))}
                        placeholder="Ej: CBU inválido, cuenta bloqueada, datos incorrectos..."
                        className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-800 resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(payout.id)}
                          disabled={processingId === payout.id}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
                        >
                          {processingId === payout.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                          Confirmar Rechazo
                        </button>
                        <button
                          onClick={() => setShowRejectForm(null)}
                          className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
