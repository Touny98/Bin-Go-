import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';

export interface MetricsData {
  timestamp: string;
  queueDepths: Record<string, number>;
  health: {
    db: boolean;
    redis: boolean;
  };
  system: {
    cpuLoad: number[];
    memoryUsage: number;
    redisHealth?: string;
  };
  business: {
    dailyRevenue: number;
    activeRooms: number;
    pendingPayouts?: number;
  };
  presence: {
    online: number;
  };
  alerts: any[];
}

export interface MetricsResponse {
  version: string;
  generatedAt: string;
  stale: boolean;
  data: MetricsData;
}

export const useLiveMetrics = () => {
  const queryClient = useQueryClient();
  const [isStale, setIsStale] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [alerts, setAlerts] = useState<any[]>([]);

  const { data, isLoading, isError, refetch } = useQuery<MetricsResponse>({
    queryKey: ['liveMetrics'],
    queryFn: async () => {
      const response = await api.get('/api/admin/metrics/live');
      return response.data;
    },
    refetchInterval: false, // We rely on WebSockets for updates
    staleTime: 30000,
  });

  useEffect(() => {
    if (data?.data?.alerts) {
      setAlerts(data.data.alerts);
    }
  }, [data]);

  useEffect(() => {
    // 1. Join the admin_dashboard room
    socket.emit('join_room', 'admin_dashboard');

    // 2. Listen for full snapshots
    const onSnapshot = (newMetrics: any) => {
      console.log('[useLiveMetrics] Received snapshot');
      queryClient.setQueryData(['liveMetrics'], (oldData: any) => ({
        ...oldData,
        data: {
          ...oldData?.data,
          ...newMetrics,
        },
        stale: false,
        generatedAt: new Date().toISOString(),
      }));
      setIsStale(false);
    };

    // 3. Listen for deltas (incremental updates)
    const onDelta = (delta: any) => {
      console.log('[useLiveMetrics] Received delta', delta);
      queryClient.setQueryData(['liveMetrics'], (oldData: any) => {
        if (!oldData || !oldData.data) return oldData;
        
        const updatedData = { ...oldData.data };
        // Apply deltas to top-level numeric fields for now
        Object.keys(delta).forEach((key) => {
          if (typeof delta[key] === 'object' && delta[key].current !== undefined) {
            (updatedData as any)[key] = delta[key].current;
          }
        });

        return {
          ...oldData,
          data: updatedData,
          generatedAt: new Date().toISOString(),
        };
      });
    };

    // 4. Listen for alerts
    const onAlert = (alert: any) => {
      console.log('[useLiveMetrics] Received alert', alert);
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
    };

    // 5. Listen for locks
    const onPayoutLocked = (data: any) => {
      console.log('[useLiveMetrics] Payout locked', data);
      queryClient.setQueryData(['payoutLocks'], (prev: any = {}) => ({
        ...prev,
        [data.resourceId]: data
      }));
    };

    const onPayoutReleased = (data: any) => {
      console.log('[useLiveMetrics] Payout released', data);
      queryClient.setQueryData(['payoutLocks'], (prev: any = {}) => {
        const next = { ...prev };
        delete next[data.resourceId];
        return next;
      });
    };

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => {
      setIsConnected(false);
      setIsStale(true);
    };

    socket.on('metrics.snapshot', onSnapshot);
    socket.on('metrics.delta', onDelta);
    socket.on('alerts.feed', onAlert);
    socket.on('payout.locked', onPayoutLocked);
    socket.on('payout.released', onPayoutReleased);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('metrics.snapshot', onSnapshot);
      socket.off('metrics.delta', onDelta);
      socket.off('alerts.feed', onAlert);
      socket.off('payout.locked', onPayoutLocked);
      socket.off('payout.released', onPayoutReleased);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [queryClient]);

  return {
    metrics: data?.data,
    alerts,
    isLoading,
    isError,
    isStale: isStale || data?.stale,
    isConnected,
    refetch
  };
};
