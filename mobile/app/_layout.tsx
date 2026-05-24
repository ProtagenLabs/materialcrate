import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadStoredAuth } from '@/lib/auth-store';
import { ServerStatusProvider, useServerStatus } from '@/lib/server-status';
import ServerDownScreen from '@/components/ServerDownScreen';
import AppSplashScreen from '@/components/AppSplashScreen';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { status } = useServerStatus();

  if (status === 'checking') return <AppSplashScreen />;
  if (status === 'offline') return <ServerDownScreen />;

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
    </Stack>
  );
}

const MIN_SPLASH_MS = 3000;

export default function RootLayout() {
  const [authReady, setAuthReady] = useState(false);
  const [minDelayDone, setMinDelayDone] = useState(false);

  useEffect(() => {
    // Hide the native splash after first render so our custom screen takes over seamlessly
    void SplashScreen.hideAsync();
    loadStoredAuth().finally(() => setAuthReady(true));
    const t = setTimeout(() => setMinDelayDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (!authReady || !minDelayDone) return <AppSplashScreen />;

  return (
    <SafeAreaProvider>
      <ServerStatusProvider>
        <AppContent />
      </ServerStatusProvider>
    </SafeAreaProvider>
  );
}
