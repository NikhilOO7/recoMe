import { useEffect, useState, useCallback } from 'react';
import { SyncService } from '../services/SyncService';

interface UseSyncState {
  isAuthenticated: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useSync(): UseSyncState {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const sync = SyncService.getInstance();
    const authed = await sync.isAuthenticated();
    setIsAuthenticated(authed);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isAuthenticated, isLoading, refresh };
}
