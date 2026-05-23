import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadStoredAuth } from '@/lib/auth-store';
import { ServerStatusProvider, useServerStatus } from '@/lib/server-status';
import ServerDownScreen from '@/components/ServerDownScreen';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { status } = useServerStatus();

  // Keep the native splash up until we know the server status
  useEffect(() => {
    if (status !== 'checking') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  if (status === 'checking') return null;
  if (status === 'offline') return <ServerDownScreen />;

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    loadStoredAuth().finally(() => setAuthReady(true));
  }, []);

  // Keep splash visible until auth is loaded; server check runs after
  if (!authReady) return null;

  return (
    <SafeAreaProvider>
      <ServerStatusProvider>
        <AppContent />
      </ServerStatusProvider>
    </SafeAreaProvider>
  );
}
