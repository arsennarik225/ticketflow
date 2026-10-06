import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClient } from './src/api/client';
import { AuthProvider } from './src/auth/AuthProvider';
import { AuthSession } from './src/auth/AuthSession';
import { createSessionStorage } from './src/auth/sessionStorage';
import { getApiUrl } from './src/config/env';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  const [session] = useState(() => {
    const apiUrl = getApiUrl();
    return new AuthSession(new ApiClient(apiUrl), createSessionStorage(apiUrl));
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider session={session}>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
