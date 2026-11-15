import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Game {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
}

export default function GamesGallery() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const { data, error } = await supabase
          .from('games')
          .select('id, title, description, thumbnail_url, categories(name)')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Map the joined category name for the UI
        const formattedData = data?.map(item => ({
          ...item,
          category: item.categories ? (item.categories as any).name : 'Uncategorized'
        }));
        
        setGames(formattedData || []);
      } catch (error) {
        console.error('Error fetching games:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, []);

  return (
    <View className="flex-1 bg-surface-background">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="mb-8">
          <Text className="text-4xl font-bold text-text-primary mb-2">Arcade</Text>
          <Text className="text-lg text-text-secondary">Play and practice your English vocabulary.</Text>
        </View>

        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0A192F" />
          </View>
        ) : games.length === 0 ? (
          <View className="py-20 items-center justify-center bg-white rounded-2xl border border-slate-200">
            <Text className="text-6xl mb-4">🎮</Text>
            <Text className="text-xl font-bold text-text-primary mb-2">No Games Yet</Text>
            <Text className="text-text-secondary">Check back soon for new releases!</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-6">
            {games.map((game) => (
              <Link key={game.id} href={`/games/${game.id}`} asChild>
                <Pressable className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {game.thumbnail_url ? (
                    <Image source={{ uri: game.thumbnail_url }} className="w-full h-48 bg-slate-100 object-cover" />
                  ) : (
                    <View className="w-full h-48 bg-slate-100 items-center justify-center">
                      <Text className="text-4xl">🎮</Text>
                    </View>
                  )}
                  <View className="p-5">
                    {game.category && (
                      <Text className="text-xs font-bold text-brand uppercase tracking-wider mb-1">
                        {game.category}
                      </Text>
                    )}
                    <Text className="text-xl font-bold text-text-primary mb-2" numberOfLines={1}>
                      {game.title}
                    </Text>
                    <Text className="text-text-secondary text-sm" numberOfLines={2}>
                      {game.description}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}