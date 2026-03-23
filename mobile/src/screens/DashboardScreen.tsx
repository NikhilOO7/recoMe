import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SyncService } from '../services/SyncService';

interface DashboardStats {
  totalPreferences: number;
  trackedProducts: number;
  pendingInsights: number;
  lastSyncAt: string | null;
}

export function DashboardScreen() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    const sync = SyncService.getInstance();
    const profile = await sync.fetchProfile();
    setStats({
      totalPreferences: profile?.totalPreferences ?? 0,
      trackedProducts: profile?.trackedProducts ?? 0,
      pendingInsights: profile?.pendingInsights ?? 0,
      lastSyncAt: profile?.lastSyncAt ?? null,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  useEffect(() => {
    void loadStats();
  }, []);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>RecoMe</Text>
      <Text style={styles.subtitle}>Your recommendation intelligence</Text>

      <View style={styles.statsGrid}>
        <StatCard label="Preferences" value={stats?.totalPreferences ?? 0} />
        <StatCard label="Tracked Items" value={stats?.trackedProducts ?? 0} />
        <StatCard label="Insights" value={stats?.pendingInsights ?? 0} />
      </View>

      {stats?.lastSyncAt && (
        <Text style={styles.syncText}>
          Last synced: {new Date(stats.lastSyncAt).toLocaleString()}
        </Text>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#e0e0ff', marginTop: 20 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#7c6df0' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  syncText: { fontSize: 12, color: '#555', textAlign: 'center' },
});
