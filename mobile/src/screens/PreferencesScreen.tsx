import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SyncService } from '../services/SyncService';

interface Preference {
  topic: string;
  strength: number;
  sentiment: 'positive' | 'negative';
}

export function PreferencesScreen() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPreferences = async () => {
    const sync = SyncService.getInstance();
    const prefs = await sync.fetchPreferences();
    setPreferences(prefs);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPreferences();
    setRefreshing(false);
  };

  useEffect(() => {
    void loadPreferences();
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={preferences}
        keyExtractor={(item) => item.topic}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.sentiment}>{item.sentiment === 'positive' ? '+' : '-'}</Text>
              <Text style={styles.topic}>{item.topic}</Text>
            </View>
            <View style={styles.barContainer}>
              <View style={[styles.bar, { width: `${item.strength * 100}%` }]} />
            </View>
            <Text style={styles.strength}>{Math.round(item.strength * 100)}%</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No preferences synced yet. Use the extension to build your profile.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  card: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sentiment: { color: '#7c6df0', fontWeight: 'bold', fontSize: 16, marginRight: 8 },
  topic: { color: '#e0e0ff', fontSize: 15, flex: 1 },
  barContainer: {
    height: 4,
    backgroundColor: '#2a2a4e',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: { height: '100%', backgroundColor: '#7c6df0', borderRadius: 2 },
  strength: { color: '#666', fontSize: 11, marginTop: 4, textAlign: 'right' },
  empty: { color: '#555', textAlign: 'center', marginTop: 40, padding: 20 },
});
