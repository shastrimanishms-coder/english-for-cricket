import { Link, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image, ScrollView, Text, View } from 'react-native';
import AnimatedButton from '../components/ui/AnimatedButton';

export default function LandingPage() {
  const router = useRouter();
  
  const player = useVideoPlayer('https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4', player => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  return (
    <ScrollView className="flex-1 bg-surface-background">
      {/* HEADER - Upgraded with Animated Buttons */}
      <View className="w-full bg-surface shadow-sm">
        <View className="max-w-7xl w-full mx-auto flex-row justify-between items-center p-6">
          <View className="flex-col">
            <Text className="text-xl font-bold text-text-primary tracking-widest uppercase">
              English
            </Text>
            <Text className="text-sm font-semibold text-text-secondary tracking-widest uppercase">
              For Cricket
            </Text>
          </View>
          <View className="flex-row items-center space-x-4 gap-4">
            <View className="w-24">
              <AnimatedButton 
                title="Login" 
                onPress={() => router.push('/login')} 
                variant="outline" 
                size="sm" 
              />
            </View>
            <View className="w-28">
              <AnimatedButton 
                title="Register" 
                onPress={() => router.push('/register')} 
                variant="primary" 
                size="sm" 
              />
            </View>
          </View>
        </View>
      </View>

      {/* HERO SECTION */}
      <View className="w-full bg-[#1A2639]">
        <View className="max-w-7xl w-full mx-auto flex-col md:flex-row items-center px-6 py-16 md:py-24">
          
          {/* Left Side: Text and Call to Action */}
          <View className="flex-1 md:pr-12 w-full mb-12 md:mb-0">
            <Text className="text-4xl md:text-5xl font-bold text-white mb-6">
              English for Cricket
            </Text>
            <Text className="text-lg text-slate-300 mb-10 leading-relaxed">
              An introduction text of our English for cricket program here, that it's an initiative of KYCO and it's completely free and always will be.
            </Text>
            <View className="w-full max-w-xs">
              <AnimatedButton 
                title="Start Learning for Free" 
                onPress={() => router.push('/register')} 
                variant="primary" 
              />
            </View>
          </View>

          {/* Right Side: Looping Video with Poster Image */}
          <View className="flex-1 w-full h-64 md:h-80 rounded-xl overflow-hidden bg-[#0F172A] shadow-lg relative">
            {/* Background Poster Image */}
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop' }}
              className="absolute inset-0 w-full h-full opacity-40"
              resizeMode="cover"
            />
            {/* Video overlay */}
            <VideoView
              style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              player={player}
              nativeControls={false}
              contentFit="cover"
            />
          </View>

        </View>
      </View>

{/* FOOTER */}
      <View className="w-full bg-surface-background border-t border-slate-200">
        <View className="max-w-7xl w-full mx-auto flex-col items-center p-8 md:p-12">
          <View className="flex-row flex-wrap justify-center gap-4 md:gap-8 mb-6">
            {/* Note the /p/ prefix matching the slug you created in the Page Manager */}
            <Link href="/p/terms-and-conditions" asChild>
              <Text className="text-text-secondary font-semibold hover:text-brand">Terms & Conditions</Text>
            </Link>
            <Link href="/p/privacy-policy" asChild>
              <Text className="text-text-secondary font-semibold hover:text-brand">Privacy Policy</Text>
            </Link>
            {/* We will build the dedicated support viewer page later */}
            <Link href="/support" asChild>
              <Text className="text-text-secondary font-semibold hover:text-brand">Support Center</Text>
            </Link>
            <Link href="/contact" asChild>
              <Text className="text-text-secondary font-semibold hover:text-brand">Contact us</Text>
            </Link>
          </View>
          <Text className="text-slate-400 text-sm text-center">
            © 2026 Kansai Youth Cricket Organization. All rights reserved.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}