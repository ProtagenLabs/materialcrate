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
  const { isOffline } = useServerStatus();

  if (isOffline) {
    return <ServerDownScreen />;
  }

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadStoredAuth().finally(() => {
      setReady(true);
      SplashScreen.hideAsync();
    });
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ServerStatusProvider>
        <AppContent />
      </ServerStatusProvider>
    </SafeAreaProvider>
  );
}
