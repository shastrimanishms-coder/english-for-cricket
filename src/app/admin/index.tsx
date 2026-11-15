import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, View } from 'react-native';
import BadgesManager from '../../components/admin/BadgesManager';
import CategoriesManager from '../../components/admin/CategoriesManager';
import CurriculumManager from '../../components/admin/CurriculumManager';
import DownloadsManager from '../../components/admin/DownloadsManager';
import GamesManager from '../../components/admin/GamesManager';
import HelpCenterManager from '../../components/admin/HelpCenterManager';
import PageManager from '../../components/admin/PageManager';
import SlideBuilder from '../../components/admin/SlideBuilder';
import SystemSettings from '../../components/admin/SystemSettings';
import UsersManager from '../../components/admin/UsersManager';
import VideosManager from '../../components/admin/VideosManager';
import { useRequireRole } from '../../hooks/useRequireRole';
import { supabase } from '../../lib/supabase';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ADMIN_MENU = [
  { id: 'overview', label: 'Dashboard Overview', icon: '📊' },
  { 
    id: 'learning_path', 
    label: 'Learning Path CMS', 
    icon: '📚',
    subItems: [
      { id: 'curriculum', label: 'Modules & Lessons' },
      { id: 'slide_builder', label: 'Interactive Slide Builder' },
    ]
  },
  { 
    id: 'taxonomy', 
    label: 'Content Taxonomy', 
    icon: '🏷️',
    subItems: [
      { id: 'categories', label: 'Categories Manager' },
    ]
  },
  { 
    id: 'assets', 
    label: 'Asset Managers', 
    icon: '📁',
    subItems: [
      { id: 'downloads', label: 'Downloads & Workbooks' },
      { id: 'games', label: 'Games & Arcade' },
      { id: 'videos', label: 'Video Lectures' },
    ]
  },
  { id: 'badges', label: 'Gamification & Badges', icon: '🏆' },
  { id: 'organizations', label: 'Users & Organizations', icon: '🏛️' },
  { id: 'pages', label: 'Static Pages & Legal', icon: '📄' },
  { id: 'support_faqs', label: 'Support & FAQs', icon: '❓' },
  { id: 'settings', label: 'System Settings', icon: '⚙️' },
];

export default function SuperAdminDashboard() {
  const router = useRouter();
  // Defense-in-depth: only super_admin sessions may see the CMS at all.
  // (RLS on the tables remains the real enforcement.)
  const guardStatus = useRequireRole(['super_admin']);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    learning_path: false,
    taxonomy: false,
    assets: false,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const toggleMenu = (menuId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const renderMainContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <View className="space-y-6">
            <Text className="text-2xl font-bold text-text-primary mb-2">Platform Overview</Text>
            <View className="flex-row flex-wrap gap-4">
              <View className="bg-white p-6 rounded-xl border border-slate-200 flex-1 min-w-[200px]">
                <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Total Orgs</Text>
                <Text className="text-3xl font-bold text-[#0A192F]">0</Text>
              </View>
              <View className="bg-white p-6 rounded-xl border border-slate-200 flex-1 min-w-[200px]">
                <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Active Students</Text>
                <Text className="text-3xl font-bold text-[#0A192F]">0</Text>
              </View>
            </View>
          </View>
        );
      
      case 'categories':
        return <CategoriesManager />;

      case 'downloads':
        return <DownloadsManager />;

      case 'games':
        return <GamesManager />;

      case 'videos':
        return <VideosManager />;

      case 'curriculum':
        return <CurriculumManager />;

      case 'slide_builder':
        return <SlideBuilder />;

      case 'organizations':
        return <UsersManager />;

      case 'pages':
        return <PageManager />;

      case 'support_faqs':
        return <HelpCenterManager />;

      case 'settings':
        return <SystemSettings />;

      case 'badges':
        return <BadgesManager />;
      
      default:
        return (
          <View>
            <Text className="text-2xl font-bold text-text-primary mb-6 capitalize">
              {activeTab.replace('_', ' ')}
            </Text>
            <View className="bg-white rounded-xl border border-slate-200 p-8 items-center justify-center min-h-[400px]">
              <Text className="text-text-secondary">Module under construction. DB Schema pending.</Text>
            </View>
          </View>
        );
    }
  };

  // Until the guard authorizes, render only a spinner - no CMS shell or
  // data is shown to logged-out or wrong-role visitors.
  if (guardStatus !== 'authorized') {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 flex-col md:flex-row bg-slate-50">
      
      {/* LEFT SIDEBAR */}
      <View className="w-full md:w-72 bg-[#0A192F] flex-col justify-between border-r border-slate-800">
        <ScrollView>
          <View className="p-6 border-b border-slate-800 mb-4">
            <Text className="text-xl font-bold text-white tracking-wider">KYCO</Text>
            <Text className="text-[#D4AF37] text-xs font-bold tracking-widest uppercase mt-1">Super Admin CMS</Text>
          </View>

          <View className="px-4 space-y-1 gap-1 pb-6">
            {ADMIN_MENU.map((item) => {
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isExpanded = expandedMenus[item.id];
              const isActivePrimary = activeTab === item.id || (hasSubItems && item.subItems.some(sub => sub.id === activeTab));

              return (
                <View key={item.id}>
                  {/* Primary Menu Item */}
                  <Pressable
                    onPress={() => hasSubItems ? toggleMenu(item.id) : setActiveTab(item.id)}
                    className={`flex-row items-center justify-between px-4 py-3 rounded-lg ${isActivePrimary && !hasSubItems ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{item.icon}</Text>
                      <Text className={`font-semibold text-sm ${isActivePrimary ? 'text-white' : 'text-slate-400'}`}>
                        {item.label}
                      </Text>
                    </View>
                    {hasSubItems && (
                      <Text className="text-slate-400 text-xs">{isExpanded ? '▼' : '▶'}</Text>
                    )}
                  </Pressable>

                  {/* Collapsible Sub-Items */}
                  {hasSubItems && isExpanded && (
                    <View className="mt-1 mb-2 ml-10 space-y-1 gap-1 border-l-2 border-slate-700 pl-3">
                      {item.subItems.map((subItem) => {
                        const isSubActive = activeTab === subItem.id;
                        return (
                          <Pressable
                            key={subItem.id}
                            onPress={() => setActiveTab(subItem.id)}
                            className={`py-2 px-3 rounded-lg ${isSubActive ? 'bg-[#D4AF37]/20' : 'hover:bg-white/5'}`}
                          >
                            <Text className={`text-sm ${isSubActive ? 'text-[#D4AF37] font-bold' : 'text-slate-400'}`}>
                              {subItem.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View className="p-4 border-t border-slate-800 mt-auto">
          <Pressable 
            onPress={handleLogout}
            className="flex-row items-center px-4 py-3 rounded-lg hover:bg-white/5"
          >
            <Text className="text-xl mr-3">🚪</Text>
            <Text className="font-semibold text-sm text-slate-400">Log Out</Text>
          </Pressable>
        </View>
      </View>

      {/* RIGHT MAIN CONTENT AREA */}
      <View className="flex-1 flex-col">
        <ScrollView contentContainerStyle={{ padding: 32, flexGrow: 1 }}>
          <View className="max-w-6xl w-full mx-auto">
            {renderMainContent()}
          </View>
        </ScrollView>
      </View>

    </View>
  );
}