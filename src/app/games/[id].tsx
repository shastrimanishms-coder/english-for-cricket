import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import BuiltinGame from '../../components/games/BuiltinGame';
import { evaluateGameBadge, type AwardedBadge } from '../../lib/badgeAwards';
import { awardExtraIfTagged } from '../../lib/extras';
import { getStudentIdentity, type StudentIdentity } from '../../lib/studentIdentity';
import { supabase } from '../../lib/supabase';
import { useActivityLogger } from '../../lib/useActivityLogger';
import { useSafeBack } from '../../lib/useSafeBack';

interface GameDetails {
  id: string;
  title: string;
  game_url: string;
  lesson_id?: string | null;
  engine?: string | null;
  data?: any;
}

type EmbedStatus = 'loading' | 'ready' | 'error';

/**
 * BadgeToast - a small pill that slides in under the header when opening
 * a game earns a badge, then fades away on its own (~3.5s). The parent
 * queues multiple badges by rendering one toast at a time, keyed by
 * badge id.
 */
function BadgeToast({ badge, onDone }: { badge: AwardedBadge; onDone: () => void }) {
  const translateY = useSharedValue(-28);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.set(withSpring(0, { damping: 14, stiffness: 220 }));
    opacity.set(withTiming(1, { duration: 250 }));
    const hideTimer = setTimeout(() => {
      opacity.set(withTiming(0, { duration: 250 }));
      translateY.set(withTiming(-16, { duration: 250 }));
    }, 3250);
    const doneTimer = setTimeout(onDone, 3550);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
    // Fresh mount per badge (parent keys by badge id); run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 76,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 20,
        },
        style,
      ]}
    >
      <View className="bg-navy/95 border border-gold rounded-full px-5 py-2.5 shadow-lg flex-row items-center gap-2">
        <Ionicons name="trophy" size={16} color="#D4AF37" />
        <Text className="text-white font-sans font-bold text-sm">Badge earned: {badge.title}</Text>
      </View>
    </Animated.View>
  );
}

export default function GamePlayer() {
  const { id } = useLocalSearchParams();
  const goBack = useSafeBack();
  const [game, setGame] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);
  // A failed fetch (network/RLS) is NOT the same as a missing game: the
  // two states render differently (retry vs. plain "not found").
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>('loading');
  const [embedKey, setEmbedKey] = useState(0);
  // Uploaded HTML games are rendered from their file CONTENT, not by
  // pointing the frame at the file URL: an upload stored with a wrong
  // content type (some browsers report .html files as text/plain, and
  // the storage server then serves the source as plain text) would
  // otherwise show the game's code instead of running it. Fetching
  // the text and handing it to the frame directly is immune to the
  // stored content type, for this upload and any future one.
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  // Badges newly earned by opening this game, toasted one at a time.
  const [badgeToasts, setBadgeToasts] = useState<AwardedBadge[]>([]);
  // The signed-in student, kept so a game's own completion moment
  // (the workbook player's Finish page, Round 83) can re-run the
  // extra award then — the ledger dedupes, so this never double-pays.
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);

  // Playtime telemetry for both identity kinds (see useActivityLogger).
  // Starts once the game row is loaded; fails soft until migration
  // 20261115000008 (log_activity RPC) has been run.
  useActivityLogger({ activityType: 'game', targetId: game?.id ?? null });

  // "Play a Game" badges (v1 semantics): opening the game earns its
  // badge. Evaluated once the game row has loaded - the same moment the
  // activity logger above starts - because embedded games expose no
  // completion signal to award against. Fails soft.
  useEffect(() => {
    if (!game) return;
    (async () => {
      const identity = await getStudentIdentity();
      if (!identity) return;
      setIdentity(identity);
      const awarded = await evaluateGameBadge(identity, game.id);
      if (awarded.length > 0) setBadgeToasts(awarded);
      // If this game is tagged to a lesson, opening it also completes
      // that lesson's recommended extra (+3 stars, once per game).
      await awardExtraIfTagged(identity, 'game', game.id, game.lesson_id);
    })();
  }, [game]);

  // A built-in game reporting its own completion (workbook player):
  // make sure the lesson-tag extra award has landed. Idempotent.
  const handleGameComplete = useCallback(async () => {
    if (!game) return;
    const who = identity ?? (await getStudentIdentity());
    if (!who) return;
    await awardExtraIfTagged(who, 'game', game.id, game.lesson_id);
  }, [game, identity]);

  const fetchGameDetails = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      let { data, error } = await supabase
        .from('games')
        .select('id, title, game_url, lesson_id, engine, data')
        .eq('id', id)
        .maybeSingle();

      if (error && /engine|data/.test(error.message)) {
        // Migration 30 not run yet: built-in game columns do not exist.
        const retry = await supabase
          .from('games')
          .select('id, title, game_url, lesson_id')
          .eq('id', id)
          .maybeSingle();
        data = retry.data as typeof data;
        error = retry.error;
      }

      if (error && /lesson_id/.test(error.message)) {
        // Migration 17 not run yet: the tag column does not exist.
        const retry = await supabase
          .from('games')
          .select('id, title, game_url')
          .eq('id', id)
          .maybeSingle();
        data = retry.data as typeof data;
        error = retry.error;
      }

      if (error) throw error;
      setGame(data as GameDetails);
      setEmbedStatus('loading');
    } catch (error: any) {
      console.error('Error fetching game:', error);
      setFetchError(error?.message || 'Something went wrong while loading this game.');
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      await fetchGameDetails();
    })();
  }, [fetchGameDetails]);

  const retryEmbed = useCallback(() => {
    setEmbedStatus('loading');
    setEmbedKey((k) => k + 1);
  }, []);

  // For an uploaded .html game, fetch its content (see htmlContent
  // above). External embeds (Scratch and friends) keep the plain URL
  // path. A failed fetch falls back to the URL rather than erroring:
  // the frame may still manage where the fetch could not.
  useEffect(() => {
    if (!game) return;
    if (game.engine) {
      // Built-in game: nothing to embed; it renders directly.
      return;
    }
    const url = game.game_url || '';
    if (!/\.html?($|[?#])/i.test(url)) return;
    let live = true;
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const text = await response.text();
        if (!live || !text) return;
        // Relative assets inside the game resolve against the
        // uploaded file's folder, not the app page.
        const base = url.slice(0, url.lastIndexOf('/') + 1);
        const withBase = /<head[^>]*>/i.test(text)
          ? text.replace(/<head[^>]*>/i, (m) => `${m}<base href="${base}">`)
          : `<base href="${base}">${text}`;
        setHtmlContent(withBase);
        setEmbedStatus('ready');
      } catch {
        // Fall back to loading by URL.
      }
    })();
    return () => {
      live = false;
    };
  }, [game, embedKey]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </SafeAreaView>
    );
  }

  if (fetchError) {
    return (
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center p-6">
        <Text className="text-white font-display text-xl font-semibold mb-2 text-center">
          Couldn&apos;t load this game
        </Text>
        <Text className="text-slate-400 font-sans text-center mb-6">
          Something went wrong while loading. Check your connection and try again.
        </Text>
        <Pressable
          onPress={() => {
            (async () => {
              await fetchGameDetails();
            })();
          }}
          className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full mb-3"
        >
          <Text className="font-sans font-bold text-navy">Try Again</Text>
        </Pressable>
        <Pressable onPress={goBack} className="px-6 py-3">
          <Text className="font-sans font-bold text-slate-300">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!game) {
    return (
      <SafeAreaView className="flex-1 bg-navy-deep items-center justify-center p-6">
        <Text className="text-white font-display text-xl font-semibold mb-4">Game not found.</Text>
        <Pressable onPress={goBack} className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full">
          <Text className="font-sans font-bold text-navy">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-navy-deep">
      <View className="flex-row items-center justify-between p-4 bg-navy-deep/70 z-10 absolute top-0 left-0 right-0">
        <Pressable onPress={goBack} className="h-10 w-10 items-center justify-center bg-white/10 rounded-full border border-white/20">
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
        </Pressable>
        <Text className="text-white font-display font-semibold text-lg flex-1 text-center mx-2" numberOfLines={1}>{game.title}</Text>
        {/* Spacer for centering (comment on its own line: a same-line
            comment after an element leaves a stray " " text node) */}
        <View className="w-10" />
      </View>

      {badgeToasts[0] ? (
        <BadgeToast
          key={badgeToasts[0].id}
          badge={badgeToasts[0]}
          onDone={() => setBadgeToasts((queue) => queue.slice(1))}
        />
      ) : null}

      <View className="flex-1 pt-16">
        {game.engine ? (
          <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <View className="w-full max-w-3xl mx-auto">
              <BuiltinGame engine={game.engine} data={game.data} title={game.title} onComplete={handleGameComplete} />
            </View>
          </ScrollView>
        ) : embedStatus === 'error' ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-white font-display text-xl font-semibold mb-2 text-center">
              This game couldn&apos;t be loaded
            </Text>
            <Text className="text-slate-400 font-sans text-center mb-6">
              The game itself failed to load. You can try again, or pick a different game.
            </Text>
            <Pressable onPress={retryEmbed} className="px-6 py-3 bg-gold border-b-4 border-gold-dark rounded-full mb-3">
              <Text className="font-sans font-bold text-navy">Retry</Text>
            </Pressable>
            <Pressable onPress={goBack} className="px-6 py-3">
              <Text className="font-sans font-bold text-slate-300">Go Back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {Platform.OS === 'web' ? (
              htmlContent !== null ? (
                <iframe
                  key={embedKey}
                  srcDoc={htmlContent}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={game.title}
                  allowFullScreen
                  onLoad={() => setEmbedStatus('ready')}
                  onError={() => setEmbedStatus('error')}
                />
              ) : (
                <iframe
                  key={embedKey}
                  src={game.game_url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={game.title}
                  allowFullScreen
                  onLoad={() => setEmbedStatus('ready')}
                  onError={() => setEmbedStatus('error')}
                />
              )
            ) : (
              <WebView
                key={embedKey}
                source={
                  htmlContent !== null
                    ? {
                        html: htmlContent,
                        baseUrl: game.game_url.slice(0, game.game_url.lastIndexOf('/') + 1),
                      }
                    : { uri: game.game_url }
                }
                className="flex-1"
                allowsInlineMediaPlayback
                bounces={false}
                onLoadEnd={() => setEmbedStatus('ready')}
                onError={() => setEmbedStatus('error')}
                onHttpError={() => setEmbedStatus('error')}
              />
            )}
            {embedStatus === 'loading' ? (
              <View className="absolute inset-0 items-center justify-center bg-navy-deep">
                <ActivityIndicator size="large" color="#ffffff" />
                <Text className="text-slate-400 font-sans mt-3">Loading game…</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
