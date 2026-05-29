'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRight,
  Search,
  Filter,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';

export interface LedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  referenceId?: string;
  timestamp: string;
  status: 'COMPLETED';
  walletId?: string;
  metadata?: any;
}

/**
 * Flujo contable desde la perspectiva de la plataforma:
 *
 *  flow: 'income'   → dinero que ENTRA al sistema desde afuera (venta de cartones)
 *  flow: 'internal' → movimiento DENTRO del sistema (premio acreditado a billetera del
 *                     usuario — el dinero sigue en el sistema hasta que el usuario retire)
 *  flow: 'expense'  → dinero que SALE definitivamente del sistema (retiro a CBU/alias)
 *
 * FEE           = cobro al usuario al comprar cartón       → INGRESO
 * CARD_PURCHASE = pago con saldo de billetera              → INGRESO (saldo se mueve a plataforma)
 * WINNING       = premio acreditado a billetera ganadora   → INTERNO (¡no salió del sistema!)
 * GAME_WIN      = ídem WINNING                            → INTERNO
 * BONUS         = bono otorgado al usuario                → INTERNO
 * WITHDRAWAL    = retiro aprobado a CBU/alias             → EGRESO (sale del sistema)
 * REFUND        = devolución a CBU/alias                  → EGRESO
 * DEPOSIT       = depósito externo del usuario             → INGRESO
 */
const CATEGORY_META: Record<string, { label: string; flow: 'income' | 'internal' | 'expense'; description: string }> = {
  FEE:          { label: 'Comisión plataforma', flow: 'internal', description: 'Comisión neta de la plataforma — ya contabilizada en la compra del cartón, no es dinero adicional' },
  CARD_PURCHASE:{ label: 'Venta de cartón',    flow: 'income',   description: 'Dinero ingresado por compra de cartones (con saldo de billetera)' },
  WINNING:      { label: 'Premio a billetera', flow: 'internal', description: 'Premio acreditado a la billetera del ganador — el dinero sigue en el sistema hasta que se retire' },
  GAME_WIN:     { label: 'Premio bingo',       flow: 'internal', description: 'Premio del juego acreditado a billetera — aún en el sistema' },
  BONUS:        { label: 'Bono',               flow: 'internal', description: 'Bono otorgado al usuario — saldo interno' },
  WITHDRAWAL:   { label: 'Retiro efectivo',    flow: 'expense',  description: 'Dinero transferido al CBU/alias del usuario — sale del sistema' },
  REFUND:       { label: 'Devolución',         flow: 'expense',  description: 'Reintegro al usuario — sale del sistema' },
  DEPOSIT:      { label: 'Depósito externo',   flow: 'income',   description: 'Acreditación de saldo externo' },
};

type CategoryMeta = { label: string; flow: 'income' | 'internal' | 'expense'; description: string };

function getCategoryMeta(category: string, entryType: 'CREDIT' | 'DEBIT'): CategoryMeta {
  if (CATEGORY_META[category]) return CATEGORY_META[category];
  // Fallback inferido
  return {
    label: category,
    flow: entryType === 'CREDIT' ? 'income' : 'expense',
    description: '',
  };
}

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(n);
}

export const LedgerExplorer: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ledgerEntries', filterCategory],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (filterCategory) params.set('category', filterCategory);
      const res = await api.get(`/api/admin/finance/ledger?${params.toString()}`);
      return res.data as { entries: LedgerEntry[]; total: number };
    },
    refetchInterval: 15000,
  });

  const entries = (data?.entries ?? []).filter(e =>
    !searchText ||
    e.category.toLowerCase().includes(searchText.toLowerCase()) ||
    (e.referenceId ?? '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* Encabezado / Filtros */}
      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por categoría o referencia..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{data?.total ?? 0} registros</span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-medium hover:bg-indigo-100 transition-colors"
          >
            <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5 text-green-500" /><strong>Ingreso</strong> = dinero que entra al sistema (venta de cartón)</span>
        <span className="flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5 text-blue-500" /><strong>Interno</strong> = dinero que se mueve dentro del sistema (ej: premio acreditado a billetera — todavía no salió)</span>
        <span className="flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5 text-red-500" /><strong>Egreso</strong> = dinero que sale del sistema (retiro a CBU/alias)</span>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="p-12 flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">Cargando libro mayor...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="p-12 flex flex-col items-center gap-3 text-gray-400">
          <ArrowUpCircle className="w-10 h-10 opacity-20" />
          <p className="text-sm">Sin entradas en el libro mayor todavía.</p>
          <p className="text-xs text-center max-w-sm">
            Las entradas aparecen acá cuando se procesan pagos de cartones, premios de bingo y retiros.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Referencia</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Categoría</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Monto</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {entries.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    className={clsx(
                      'hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer',
                      expandedId === entry.id && 'bg-indigo-50/50 dark:bg-indigo-900/10'
                    )}
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="px-6 py-4">
                      {(() => {
                        const meta = getCategoryMeta(entry.category, entry.type);
                        const icon = meta.flow === 'income'
                          ? <ArrowUpCircle className="w-5 h-5 text-green-500 shrink-0" />
                          : meta.flow === 'expense'
                          ? <ArrowDownCircle className="w-5 h-5 text-red-500 shrink-0" />
                          : <ArrowRight className="w-5 h-5 text-blue-400 shrink-0" />;
                        return (
                          <div className="flex items-center gap-3">
                            {icon}
                            <p className="text-[11px] font-mono text-gray-500 truncate max-w-[160px]">
                              {entry.referenceId ?? entry.id}
                            </p>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const meta = getCategoryMeta(entry.category, entry.type);
                        return (
                          <div>
                            <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg">
                              {meta.label}
                            </span>
                            {meta.description && (
                              <p className="text-[10px] text-gray-400 mt-1 max-w-[180px]">{meta.description}</p>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className={clsx(
                      'px-6 py-4 text-right font-bold text-sm',
                      getCategoryMeta(entry.category, entry.type).flow === 'income'
                        ? 'text-green-600'
                        : getCategoryMeta(entry.category, entry.type).flow === 'expense'
                        ? 'text-red-600'
                        : 'text-blue-500'
                    )}>
                      {(() => {
                        const f = getCategoryMeta(entry.category, entry.type).flow;
                        return (f === 'income' ? '+' : f === 'expense' ? '-' : '↔ ') + formatARS(entry.amount);
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const meta = getCategoryMeta(entry.category, entry.type);
                        const styles = meta.flow === 'income'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : meta.flow === 'expense'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
                        const label = meta.flow === 'income' ? 'Ingreso' : meta.flow === 'expense' ? 'Egreso' : 'Interno';
                        return (
                          <span className={clsx('text-xs font-bold px-2 py-1 rounded-full', styles)}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {new Date(entry.timestamp).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-indigo-500 hover:text-indigo-600">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>

                  {/* Fila expandida con metadata */}
                  {expandedId === entry.id && (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-100 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Información</h5>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-500">ID interno</span>
                                <span className="font-mono font-bold">{entry.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Billetera</span>
                                <span className="font-bold">{entry.walletId ?? '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Estado</span>
                                <span className="text-green-600 font-bold">Completado</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Referencia</h5>
                            <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 break-all">
                              {entry.referenceId ?? 'Sin referencia'}
                            </p>
                          </div>

                          <div>
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Metadatos</h5>
                            {entry.metadata ? (
                              <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 overflow-auto max-h-24">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-xs text-gray-400 italic">Sin metadatos</p>
                            )}
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
      )}
    </div>
  );
};
