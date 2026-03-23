import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from 'react-native';
import { SyncService } from '../services/SyncService';

interface TrackedProduct {
  id: string;
  title: string;
  url: string;
  platform: string;
  currentPrice: number;
  lowestPrice: number;
  currency: string;
}

export function WatchlistScreen() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = async () => {
    const sync = SyncService.getInstance();
    const items = await sync.fetchWatchlist();
    setProducts(items);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(item.url)}>
            <Text style={styles.platform}>{item.platform.toUpperCase()}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>
                {item.currency}
                {item.currentPrice.toFixed(2)}
              </Text>
              {item.currentPrice <= item.lowestPrice && (
                <Text style={styles.lowBadge}>ALL-TIME LOW</Text>
              )}
            </View>
            <Text style={styles.lowest}>
              Lowest: {item.currency}
              {item.lowestPrice.toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No tracked products. Visit product pages with the extension to start tracking.
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
  platform: { color: '#7c6df0', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#e0e0ff', fontSize: 14, marginTop: 4, marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { color: '#4ecb71', fontSize: 18, fontWeight: 'bold' },
  lowBadge: {
    backgroundColor: '#4ecb71',
    color: '#0f0f23',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowest: { color: '#666', fontSize: 11, marginTop: 4 },
  empty: { color: '#555', textAlign: 'center', marginTop: 40, padding: 20 },
});
