import React from 'react';
import clsx from 'clsx';
import { Skeleton } from 'react-loading-skeleton';

interface MetricCardProps {
  title: string;
  value?: string | number;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, loading = false, icon }) => {
  return (
    <div className={clsx('bg-surface dark:bg-gray-800 rounded-xl shadow-sm p-4 flex items-center space-x-3', 'transition-transform hover:scale-[1.02]')}> 
      {icon && <div className="text-primary text-2xl">{icon}</div>}
      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">{title}</h3>
        {loading ? (
          <Skeleton height={24} width={80} />
        ) : (
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
        )}
      </div>
    </div>
  );
};
