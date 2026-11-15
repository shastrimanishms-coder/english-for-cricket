import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Celebration - a one-shot confetti-style burst for big kid moments
 * (lesson completion). When `visible` flips true, ~24 particles (sport /
 * star emoji plus small brand-coloured circles) burst from the centre of
 * the screen, fall with a gravity-ish arc and fade out over ~1.6s, then
 * `onDone` fires. Pure Reanimated, so it behaves identically on web and
 * native. The overlay never intercepts touches, and once the burst ends
 * the particles sit at opacity 0 - nothing needs to unmount them.
 */

const PARTICLE_COUNT = 24;
const BURST_MS = 1600;
const EMOJIS = ['🏏', '⭐', '🎉', '🏆', '✨'];
const CIRCLE_COLORS = ['#0A192F', '#D4AF37', '#10B981', '#2E7D32', '#FFC107'];

interface ParticleConfig {
  emoji: string | null;
  color: string;
  angle: number; // radians
  distance: number; // px travelled outward
  fall: number; // extra px of downward drift (the "gravity")
  size: number; // emoji font size or circle diameter
  delay: number; // 0..0.15 of the timeline before this particle starts
  spin: number; // degrees of rotation across the burst
}

function buildParticles(): ParticleConfig[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const isEmoji = i % 2 === 0;
    return {
      emoji: isEmoji ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : null,
      color: CIRCLE_COLORS[Math.floor(Math.random() * CIRCLE_COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      distance: 80 + Math.random() * 150,
      fall: 90 + Math.random() * 130,
      size: isEmoji ? 17 + Math.random() * 14 : 6 + Math.random() * 7,
      delay: Math.random() * 0.15,
      spin: (Math.random() - 0.5) * 260,
    };
  });
}

function Particle({
  config,
  progress,
}: {
  config: ParticleConfig;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Local progress: each particle can lag the burst slightly.
    const p = Math.min(1, Math.max(0, (progress.value - config.delay) / (1 - config.delay)));
    const out = 1 - Math.pow(1 - p, 3); // fast launch, soft landing
    const x = Math.cos(config.angle) * config.distance * out;
    const y = Math.sin(config.angle) * config.distance * out + config.fall * p * p;
    return {
      opacity: interpolate(p, [0, 0.65, 1], [1, 1, 0]),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${config.spin * p}deg` },
        { scale: interpolate(p, [0, 0.25, 1], [0.4, 1.1, 0.9]) },
      ],
    };
  });

  // Anchored at the overlay's centre point (50%/50% minus half the
  // particle size) so the burst origin is the middle of the screen on
  // every platform; the animated transforms carry particles outward.
  const anchor = {
    left: '50%' as const,
    top: '50%' as const,
    marginLeft: -config.size / 2,
    marginTop: -config.size / 2,
  };

  if (config.emoji) {
    return (
      <Animated.Text style={[styles.particle, anchor, style, { fontSize: config.size }]}>
        {config.emoji}
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={[
        styles.particle,
        anchor,
        style,
        {
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor: config.color,
        },
      ]}
    />
  );
}

export default function Celebration({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone?: () => void;
}) {
  const progress = useSharedValue(0);
  const particles = useMemo(() => buildParticles(), []);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!visible) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: BURST_MS, easing: Easing.linear }));
    const timer = setTimeout(() => onDoneRef.current?.(), BURST_MS + 150);
    return () => clearTimeout(timer);
    // progress is a stable shared value; the burst restarts only when
    // `visible` flips back to true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {particles.map((config, i) => (
        <Particle key={i} config={config} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  particle: {
    position: 'absolute',
  },
});
