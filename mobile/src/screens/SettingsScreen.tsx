import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SyncService } from '../services/SyncService';

export function SettingsScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tier, setTier] = useState('FREE');
  const [autoSync, setAutoSync] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const sync = SyncService.getInstance();

  useEffect(() => {
    const checkAuth = async () => {
      const authed = await sync.isAuthenticated();
      setIsLoggedIn(authed);
      if (authed) {
        const profile = await sync.fetchProfile();
        setTier(profile?.tier ?? 'FREE');
      }
    };
    void checkAuth();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    const success = await sync.login(email, password);
    if (success) {
      setIsLoggedIn(true);
      setPassword('');
      Alert.alert('Success', 'Logged in successfully');
    } else {
      Alert.alert('Error', 'Invalid credentials');
    }
  };

  const handleLogout = async () => {
    await sync.logout();
    setIsLoggedIn(false);
    setTier('FREE');
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Account</Text>

      {isLoggedIn ? (
        <View style={styles.section}>
          <Text style={styles.label}>Signed in as: {email || 'User'}</Text>
          <Text style={styles.tierBadge}>Plan: {tier}</Text>
          <TouchableOpacity style={styles.button} onPress={handleLogout}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.section}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#555"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Sync</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Auto-sync</Text>
        <Switch value={autoSync} onValueChange={setAutoSync} trackColor={{ true: '#7c6df0' }} />
      </View>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Price alerts</Text>
        <Switch
          value={notifications}
          onValueChange={setNotifications}
          trackColor={{ true: '#7c6df0' }}
        />
      </View>

      <Text style={styles.version}>RecoMe Mobile v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 16 },
  sectionTitle: {
    color: '#7c6df0',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
    letterSpacing: 1,
  },
  section: { marginBottom: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
  },
  label: { color: '#e0e0ff', fontSize: 14 },
  tierBadge: { color: '#7c6df0', fontSize: 14, fontWeight: '600', marginVertical: 8 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    color: '#e0e0ff',
    fontSize: 14,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#7c6df0',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  version: { color: '#333', textAlign: 'center', marginTop: 40, fontSize: 12 },
});
