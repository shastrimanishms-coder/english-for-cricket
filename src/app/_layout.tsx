import { Stack } from 'expo-router';
import { View } from 'react-native';
import '../global.css';

export default function RootLayout() {
  return (
    <View className="flex-1 bg-surface-background">
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
  );
}