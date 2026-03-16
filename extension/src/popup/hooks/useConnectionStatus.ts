import { useState, useEffect } from 'react';

export type ConnectionStatus = 'connected' | 'degraded' | 'offline';

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    // Check if background service worker is responsive
    function checkConnection() {
      const isOnline = navigator.onLine;
      if (!isOnline) {
        setStatus('offline');
        return;
      }

      // Ping the background service worker
      chrome.runtime
        .sendMessage({ type: 'PING' })
        .then(() => setStatus('connected'))
        .catch(() => setStatus('degraded'));
    }

    checkConnection();

    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);

    // Check periodically (SW can sleep)
    const interval = setInterval(checkConnection, 10000);

    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
      clearInterval(interval);
    };
  }, []);

  return status;
}
