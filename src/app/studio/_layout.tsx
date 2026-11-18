import { Stack } from 'expo-router';

/**
 * Voice Studio routes (hidden: linked from nowhere public - actors
 * arrive from the login link the admin sends them). Plain stack in
 * the elegant canvas, no header chrome; screens draw their own.
 */
export default function StudioLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FAF8F4' },
      }}
    />
  );
}
