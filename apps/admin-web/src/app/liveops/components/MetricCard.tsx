import React, { useState } from 'react';
import { Info } from 'lucide-react';
import clsx from 'clsx';

interface MetricCardProps {
  title: string;
  value?: string | number;
  loading?: boolean;
  icon?: React.ReactNode;
  description?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, loading = false, icon, description }) => {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 relative border border-gray-100 dark:border-gray-700 transition-all duration-200 hover:scale-[1.02]')}>
      {description && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(!showInfo);
          }}
          className={clsx(
            "absolute top-3 right-3 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700",
            showInfo ? "text-indigo-500" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          )}
          title="Ver descripción"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex items-center space-x-3">
        {icon && <div className="text-indigo-500 text-2xl">{icon}</div>}
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 pr-4">{title}</h3>
          {loading ? (
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value ?? '—'}</p>
          )}
        </div>
      </div>

      {description && showInfo && (
        <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 animate-fadeIn transition-all duration-300 leading-relaxed">
          {description}
        </div>
      )}
    </div>
  );
};
