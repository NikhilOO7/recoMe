import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AgentScreen } from './src/screens/AgentScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { WatchlistScreen } from './src/screens/WatchlistScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  ShareReceivedScreen,
  type ShareReceivedScreenProps,
} from './src/screens/ShareReceivedScreen';
import { ShareReceiver, type ShareInput, type ShareResult } from './src/services/ShareReceiver';

const Tab = createBottomTabNavigator();

export default function App() {
  // ── OS share-sheet plumbing ────────────────────────────────────────────
  // Both platforms route shared URLs through ShareReceiver.attach (see the
  // file header for the iOS Share Extension ↔ host-app contract). When a
  // share lands we ingest immediately and show a small confirmation modal
  // — no navigation, so the user is one tap away from going back to
  // whatever they were doing.
  const [shareInput, setShareInput] = useState<ShareInput | null>(null);
  const [shareState, setShareState] = useState<ShareReceivedScreenProps['state']>({
    kind: 'ingesting',
  });

  useEffect(() => {
    const detach = ShareReceiver.attach(async (input) => {
      setShareInput(input);
      setShareState({ kind: 'ingesting' });
      const result = await ShareReceiver.ingest(input);
      setShareState({ kind: 'done', result });
    });
    return detach;
  }, []);

  const retry = async () => {
    if (!shareInput) return;
    setShareState({ kind: 'ingesting' });
    const result: ShareResult = await ShareReceiver.ingest(shareInput);
    setShareState({ kind: 'done', result });
  };

  return (
    <>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#1a1a2e' },
            headerTintColor: '#e0e0ff',
            tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#2a2a4e' },
            tabBarActiveTintColor: '#7c6df0',
            tabBarInactiveTintColor: '#666',
          }}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
          <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights' }} />
          <Tab.Screen name="Agent" component={AgentScreen} options={{ title: 'Chat' }} />
          <Tab.Screen
            name="Watchlist"
            component={WatchlistScreen}
            options={{ title: 'Watchlist' }}
          />
          <Tab.Screen
            name="Preferences"
            component={PreferencesScreen}
            options={{ title: 'Prefs' }}
          />
          <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Tab.Navigator>
      </NavigationContainer>

      {shareInput && (
        <ShareReceivedScreen
          input={shareInput}
          state={shareState}
          onDismiss={() => setShareInput(null)}
          onRetry={retry}
        />
      )}
    </>
  );
}
