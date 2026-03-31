import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export type AzureStatus = 'loading' | 'not_configured' | 'configured' | 'error';

interface UseAzureStatusResult {
  status: AzureStatus;
  subscriptionCount: number | null;
  lastChecked: Date | null;
  refetch: () => Promise<void>;
}

export function useAzureStatus(): UseAzureStatusResult {
  const [status, setStatus] = useState<AzureStatus>('loading');
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkStatus = async () => {
    setStatus('loading');
    try {
      const data = await api.get('/credentials/azure-status');

      if (!data.configured) {
        setStatus('not_configured');
        setSubscriptionCount(null);
        return;
      }

      setStatus('configured');
      setSubscriptionCount(null);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Error checking Azure status:', error);
      setStatus('error');
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return { status, subscriptionCount, lastChecked, refetch: checkStatus };
}
