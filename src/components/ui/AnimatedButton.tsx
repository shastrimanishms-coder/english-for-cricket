import * as Haptics from 'expo-haptics';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'sm';
  disabled?: boolean;
  className?: string;
}

export default function AnimatedButton({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'default',
  disabled = false,
  className = ''
}: AnimatedButtonProps) {
  
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    scale.value = withSpring(0.95, { damping: 10, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 400 });
  };

  let bgClass = '';
  let textClass = 'text-white';

  if (variant === 'primary') {
    bgClass = 'bg-brand';
  } else if (variant === 'secondary') {
    bgClass = 'bg-action';
  } else if (variant === 'outline') {
    bgClass = 'bg-transparent border-2 border-brand';
    textClass = 'text-brand';
  }

  if (disabled) {
    bgClass = 'bg-slate-300';
    textClass = 'text-slate-500';
  }

  // Adjust height, rounding, and text size based on the new size prop
  const heightClass = size === 'sm' ? 'h-10 rounded-xl' : 'h-14 rounded-2xl';
  const textSize = size === 'sm' ? 'text-sm font-semibold' : 'text-lg font-bold tracking-wide';

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      className={`w-full ${className}`}
    >
      <Animated.View style={animatedStyle}>
        <View className={`${heightClass} w-full justify-center items-center ${bgClass} shadow-sm`}>
          <Text className={`${textClass} ${textSize}`}>
            {title}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}