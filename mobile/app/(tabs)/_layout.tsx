import { Tabs } from 'expo-router';
import Navbar from '@/components/Navbar';

export default function TabLayout() {
  return (
    <Tabs tabBar={() => <Navbar />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="two" />
      <Tabs.Screen name="user" />
    </Tabs>
  );
}
