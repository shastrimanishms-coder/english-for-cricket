import { useEffect } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { AwardedBadge } from '../../lib/badgeAwards';

/**
 * NewBadgeCard - the "🎉 New Badge!" moment on the lesson completion
 * screen. Springs in, shows the badge the way the learner profile does
 * (URL image, or the emoji stored in image_url inside an amber circle),
 * and dismisses itself after ~4s or when the student taps "Nice!". The
 * parent queues several badges by rendering one card at a time, keyed
 * by badge id so each gets a fresh pop-in and timer.
 */
export default function NewBadgeCard({
  badge,
  onDismiss,
}: {
  badge: AwardedBadge;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.set(withSpring(1, { damping: 11, stiffness: 220 }));
    opacity.set(withSpring(1, { damping: 14, stiffness: 200 }));
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
    // Fresh mount per badge (parent keys by badge id); run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style} className="w-full max-w-sm mb-6">
      <View className="bg-amber-50 border-2 border-amber-300 rounded-3xl px-6 py-5 items-center shadow-sm">
        <Text className="text-lg font-bold text-amber-600 mb-3">🎉 New Badge!</Text>
        {badge.image_url && badge.image_url.startsWith('http') ? (
          <Image
            source={{ uri: badge.image_url }}
            className="w-20 h-20 rounded-full border-2 border-amber-300 bg-white mb-3"
          />
        ) : (
          <View className="w-20 h-20 rounded-full bg-white border-2 border-amber-300 items-center justify-center mb-3">
            <Text className="text-4xl">{badge.image_url || '🏆'}</Text>
          </View>
        )}
        <Text className="text-xl font-bold text-[#0A192F] text-center mb-4">{badge.title}</Text>
        <Pressable onPress={onDismiss} className="px-6 py-2.5 bg-amber-400 rounded-full">
          <Text className="text-white font-bold">Nice!</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
