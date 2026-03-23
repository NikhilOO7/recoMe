import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SyncService } from '../services/SyncService';

interface Insight {
  id: string;
  type: string;
  title: string;
  body: string;
  platform: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: number;
}

export function InsightsScreen() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadInsights = async () => {
    const sync = SyncService.getInstance();
    const items = await sync.fetchInsights();
    setInsights(items);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsights();
    setRefreshing(false);
  };

  useEffect(() => {
    void loadInsights();
  }, []);

  const typeColors: Record<string, string> = {
    deal: '#4ecb71',
    event: '#e5a52a',
    alert: '#e55a5a',
    content: '#5a8de5',
    trend: '#c45ae5',
    connection: '#5ae5c4',
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={insights}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.header}>
              <View
                style={[styles.typeBadge, { backgroundColor: typeColors[item.type] ?? '#666' }]}
              >
                <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
              </View>
              <Text style={styles.platform}>{item.platform}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            {item.actionUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(item.actionUrl!)}>
                <Text style={styles.action}>{item.actionLabel ?? 'View'}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No insights yet. Browse supported platforms with the extension to generate insights.
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { color: '#0f0f23', fontSize: 9, fontWeight: '700' },
  platform: { color: '#666', fontSize: 11 },
  title: { color: '#e0e0ff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  body: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  action: { color: '#7c6df0', fontSize: 13, fontWeight: '600', marginTop: 8 },
  time: { color: '#444', fontSize: 10, marginTop: 8 },
  empty: { color: '#555', textAlign: 'center', marginTop: 40, padding: 20 },
});
