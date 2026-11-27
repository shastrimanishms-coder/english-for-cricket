import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppSessionLogger from '../components/AppSessionLogger';
import { initOfflineSupport } from '../lib/offlineSupport';
import '../global.css';

export default function RootLayout() {
  // Offline support (Round 93): register the service worker that
  // lets the installed app open offline, and arm the progress
  // queue's replay triggers so offline-earned progress syncs on
  // reconnect. Web + production only; fails soft everywhere.
  useEffect(() => {
    initOfflineSupport();
  }, []);

  // A URL typed with ".html" on the end (e.g. /register.html) is
  // served the page's file by the host, but the router sees the .html
  // path and reports an unmatched route. Send the browser to the
  // clean extensionless path, which the router does know.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const { pathname, search, hash } = window.location;
      if (pathname.endsWith('.html')) {
        let clean = pathname.slice(0, -'.html'.length);
        if (clean === '' || clean === '/index') clean = '/';
        window.location.replace(clean + search + hash);
      }
    }
  }, []);

  // Elegant redesign type pairing: Fraunces (display) + Manrope
  // (UI/body). Non-blocking: the tree renders immediately and the
  // fonts swap in when ready, so a slow font fetch never blanks
  // the app.
  useFonts({
    Fraunces: Fraunces_600SemiBold,
    Fraunces_700Bold,
    Manrope: Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
    <View className="flex-1 bg-surface-background">
      {/* Whole-app active-time stream (Round 81); renders nothing. */}
      <AppSessionLogger />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAFC' },
          animation: 'fade', 
        }}
      >
        {/* Auth Routes */}
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="switch-account" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="update-password" />
        
        {/* Dashboards */}
        <Stack.Screen name="admin" />
        <Stack.Screen name="manager" />
        <Stack.Screen name="learner" />
        
        {/* Global Media Portals (Phase 1) */}
        <Stack.Screen name="games" />
        <Stack.Screen name="videos" />
        <Stack.Screen name="downloads" />
        
        {/* Lesson Player (Phase 3) */}
        <Stack.Screen name="lesson/[id]" />
      </Stack>
    </View>
    </SafeAreaProvider>
  );
}