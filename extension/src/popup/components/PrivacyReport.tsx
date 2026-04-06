import { useEffect, useState } from 'react';

interface PrivacyData {
  localStorageBytes: number;
  syncStorageBytes: number;
  idbEntries: number;
  apiKeysConfigured: string[];
  cloudSyncEnabled: boolean;
  encryptionActive: boolean;
  lastExport: string | null;
}

function send(
  type: string,
  payload: unknown = null,
): Promise<{ success: boolean; data?: unknown }> {
  return chrome.runtime.sendMessage({ type, payload });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PrivacyReport() {
  const [data, setData] = useState<PrivacyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrivacyData();
  }, []);

  async function loadPrivacyData() {
    setLoading(true);
    try {
      // Get local storage usage
      const localBytes = await chrome.storage.local.getBytesInUse(null);
      const syncBytes = await chrome.storage.sync.getBytesInUse(null).catch(() => 0);

      // Get IDB entry count via message
      const dbRes = await send('GET_DB_STATS');
      const dbStats = dbRes.data as { indexeddb?: Record<string, number> } | undefined;
      const idbEntries = dbStats?.indexeddb
        ? Object.values(dbStats.indexeddb).reduce((a, b) => a + b, 0)
        : 0;

      // Check which API keys are configured (masked)
      const settingsRes = await send('GET_SETTINGS');
      const settings = settingsRes.data as Record<string, unknown> | undefined;
      const apiKeys: string[] = [];
      if (settings?.anthropic_api_key) apiKeys.push('Anthropic (Claude)');
      if (settings?.openai_api_key) apiKeys.push('OpenAI (GPT)');
      if (settings?.gemini_api_key) apiKeys.push('Google (Gemini)');

      // Check cloud sync
      const cloudRes = await send('CLOUD_GET_STATUS');
      const cloud = cloudRes.data as { authenticated?: boolean } | undefined;

      // Check last export timestamp
      const exportData = await chrome.storage.local.get('recome_last_export');
      const lastExport = (exportData.recome_last_export as string) ?? null;

      setData({
        localStorageBytes: localBytes,
        syncStorageBytes: syncBytes,
        idbEntries,
        apiKeysConfigured: apiKeys,
        cloudSyncEnabled: cloud?.authenticated === true,
        encryptionActive: apiKeys.length > 0, // Keys are encrypted via KeyVault
        lastExport,
      });
    } catch {
      // Fallback minimal data
      setData({
        localStorageBytes: 0,
        syncStorageBytes: 0,
        idbEntries: 0,
        apiKeysConfigured: [],
        cloudSyncEnabled: false,
        encryptionActive: false,
        lastExport: null,
      });
    }
    setLoading(false);
  }

  if (loading) return null;
  if (!data) return null;

  return (
    <div className="privacy-report">
      <h3 className="setting-title">Privacy Report</h3>
      <p className="setting-text" style={{ marginBottom: 10 }}>
        All your browsing data stays on this device. Here's exactly what RecoMe stores.
      </p>

      {/* Data locality */}
      <div className="privacy-section">
        <div className="privacy-row">
          <span className="privacy-icon">💾</span>
          <div className="privacy-info">
            <span className="privacy-label">Local storage</span>
            <span className="privacy-value">{formatBytes(data.localStorageBytes)}</span>
          </div>
        </div>
        <div className="privacy-row">
          <span className="privacy-icon">🗄️</span>
          <div className="privacy-info">
            <span className="privacy-label">Interest graph entries</span>
            <span className="privacy-value">{data.idbEntries.toLocaleString()}</span>
          </div>
        </div>
        <div className="privacy-row">
          <span className="privacy-icon">☁️</span>
          <div className="privacy-info">
            <span className="privacy-label">Cloud sync</span>
            <span className="privacy-value">
              {data.cloudSyncEnabled ? 'On (E2E encrypted)' : 'Off — data stays local only'}
            </span>
          </div>
        </div>
      </div>

      {/* API key status */}
      <div className="privacy-section">
        <div className="privacy-row">
          <span className="privacy-icon">🔑</span>
          <div className="privacy-info">
            <span className="privacy-label">API keys</span>
            <span className="privacy-value">
              {data.apiKeysConfigured.length > 0
                ? `${data.apiKeysConfigured.join(', ')} — stored encrypted on-device`
                : 'None configured — no external API calls'}
            </span>
          </div>
        </div>
      </div>

      {/* Data flow transparency */}
      <div className="privacy-section">
        <span className="privacy-section-title">What leaves your device</span>
        <div className="privacy-flow-item privacy-flow-safe">
          <span>Interest graph, preferences, browsing signals</span>
          <span className="privacy-flow-badge">Never sent</span>
        </div>
        {data.apiKeysConfigured.length > 0 && (
          <div className="privacy-flow-item privacy-flow-limited">
            <span>Page text (for AI topic extraction)</span>
            <span className="privacy-flow-badge">To your AI provider only</span>
          </div>
        )}
        {data.cloudSyncEnabled && (
          <div className="privacy-flow-item privacy-flow-limited">
            <span>Encrypted sync blob</span>
            <span className="privacy-flow-badge">E2E encrypted — server can't read it</span>
          </div>
        )}
        {!data.cloudSyncEnabled && data.apiKeysConfigured.length === 0 && (
          <div className="privacy-flow-item privacy-flow-safe">
            <span>Nothing leaves your device</span>
            <span className="privacy-flow-badge">Fully local</span>
          </div>
        )}
      </div>
    </div>
  );
}
