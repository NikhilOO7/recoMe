import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AgentScreen } from './src/screens/AgentScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { WatchlistScreen } from './src/screens/WatchlistScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
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
        <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: 'Watchlist' }} />
        <Tab.Screen name="Preferences" component={PreferencesScreen} options={{ title: 'Prefs' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
