import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Elegant redesign primitives (Shastri-approved direction,
 * 2026-11-17): one theme for the whole app — navy kit anchor,
 * gold kept precious (stars, XP, the one main action per screen),
 * pitch green for go/correct, warm off-white canvas, hairline
 * borders, refined type (Fraunces display + Manrope UI).
 *
 * These are purely presentational. Screens keep their own layout
 * and logic; they borrow these pieces so every screen speaks the
 * same visual language.
 */

/** Small-caps gold section label, wide tracking (jersey lettering). */
export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Text
      className={`font-sans text-[11px] font-bold uppercase tracking-[2.5px] text-gold-dark ${className}`}
    >
      {children}
    </Text>
  );
}

/** The standard white card: hairline warm border, soft shadow. */
export function ElegantCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-[20px] border border-inkline bg-white shadow-sm ${className}`}
    >
      {children}
    </View>
  );
}

interface PillButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}

/** The one main action on a screen: gold pill, navy text, tactile
 *  darker bottom edge (the press-down feel, kept subtle). */
export function GoldButton({ label, onPress, disabled, className = '' }: PillButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-full border-b-4 border-gold-dark bg-gold px-6 py-3.5 ${
        disabled ? 'opacity-50' : 'active:opacity-90'
      } ${className}`}
    >
      <Text className="font-sans text-base font-bold text-navy">{label}</Text>
    </Pressable>
  );
}

/** Secondary action: navy pill, white text. */
export function NavyButton({ label, onPress, disabled, className = '' }: PillButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-full border-b-4 border-navy-deep bg-navy px-6 py-3.5 ${
        disabled ? 'opacity-50' : 'active:opacity-90'
      } ${className}`}
    >
      <Text className="font-sans text-base font-bold text-white">{label}</Text>
    </Pressable>
  );
}

/** Tertiary action: quiet white pill with a hairline border. */
export function GhostButton({ label, onPress, disabled, className = '' }: PillButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`items-center rounded-full border border-inkline bg-white px-6 py-3.5 ${
        disabled ? 'opacity-50' : 'active:opacity-90'
      } ${className}`}
    >
      <Text className="font-sans text-base font-semibold text-slate-600">{label}</Text>
    </Pressable>
  );
}

/** Slim navy screen header with a back chevron and a refined title. */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View className="w-full bg-navy">
      <View className="mx-auto w-full max-w-7xl flex-row items-center justify-between px-4 py-4 md:px-6">
        <View className="flex-row items-center gap-3">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 active:bg-white/20"
            >
              <Text className="text-lg font-bold text-white">‹</Text>
            </Pressable>
          ) : null}
          <Text className="font-display text-xl font-semibold text-white md:text-2xl">{title}</Text>
        </View>
        {right ?? null}
      </View>
    </View>
  );
}
