import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, Pressable, ScrollView, Text, UIManager, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BadgesManager from '../../components/admin/BadgesManager';
import CategoriesManager from '../../components/admin/CategoriesManager';
import CurriculumManager from '../../components/admin/CurriculumManager';
import DownloadsManager from '../../components/admin/DownloadsManager';
import GamesManager from '../../components/admin/GamesManager';
import HelpCenterManager from '../../components/admin/HelpCenterManager';
import PageTranslationsManager from '../../components/admin/PageTranslationsManager';
import SpeakingManager from '../../components/admin/SpeakingManager';
import ReadingManager from '../../components/admin/ReadingManager';
import SlideBuilder from '../../components/admin/SlideBuilder';
import SystemSettings from '../../components/admin/SystemSettings';
import UsersManager from '../../components/admin/UsersManager';
import VideosManager from '../../components/admin/VideosManager';
import VoiceStudioManager from '../../components/admin/VoiceStudioManager';
import WorkbooksManager from '../../components/admin/WorkbooksManager';
import WordBankManager from '../../components/admin/WordBankManager';
import { useRequireRole } from '../../hooks/useRequireRole';
import { supabase } from '../../lib/supabase';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AdminMenuItem {
  id: string;
  label: string;
  icon: string;
  subItems?: { id: string; label: string }[];
}

const ADMIN_MENU: AdminMenuItem[] = [
  { id: 'overview', label: 'Dashboard Overview', icon: '📊' },
  { 
    id: 'learning_path', 
    label: 'Learning Path CMS', 
    icon: '📚',
    subItems: [
      { id: 'curriculum', label: 'Modules & Lessons' },
      // Round 97: the Interactive Slide Builder tab is hidden -
      // lesson slides now arrive as uploaded packages (Modules &
      // Lessons carries the upload door). The SlideBuilder component
      // stays in the codebase (one-phase rule) and its render case
      // below is simply unreachable from the menu.
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
      { id: 'workbooks', label: 'Workbooks' },
      { id: 'wordbank', label: 'Word Bank' },
      { id: 'videos', label: 'Video Lectures' },
    ]
  },
  { id: 'speaking', label: 'Speaking Practice', icon: '🎙️' },
  { id: 'reading', label: 'Smart Reading', icon: '📖' },
  {
    id: 'contributors',
    label: 'Contributors',
    icon: '🎤',
    subItems: [
      { id: 'voice-studio', label: 'Voice Studio' },
    ]
  },
  { id: 'badges', label: 'Gamification & Badges', icon: '🏆' },
  { id: 'organizations', label: 'Users & Organizations', icon: '🏛️' },
  // Round 99: the old 'pages' tab ("Static Pages & Legal", PageManager)
  // was removed — Pages & Translations below edits every served page
  // (terms, privacy, support text and the help texts) including the
  // English master, which the public renderer applies over the pages
  // table. PageManager.tsx stays in the codebase, unreachable.
  { id: 'page_translations', label: 'Pages & Translations', icon: '🌐' },
  { id: 'support_faqs', label: 'Support & FAQs', icon: '❓' },
  { id: 'settings', label: 'System Settings', icon: '⚙️' },
];

// The only sections a Content Manager may open (Round 37): learning
// content creation and editing, nothing else. The sidebar is filtered
// to these tabs and renderMainContent refuses the rest, but the real
// enforcement is RLS (migration 20261122000028) - a content_manager
// session cannot read or write the other tables at all.
const CONTENT_MANAGER_TABS = new Set([
  'curriculum',
  // Round 97: 'slide_builder' removed with its menu entry (above).
  'downloads',
  'games',
  'workbooks',
  'wordbank',
  'speaking',
  'reading',
]);

// Local-date period starts for the overview growth stats. The week
// starts on Monday.
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Content shortcut cards on the overview: real table counts, each card
// jumps to the admin section that manages that content.
const CONTENT_CARDS = [
  { key: 'modules', label: 'Modules', icon: '📚', table: 'curriculum_modules', tab: 'curriculum' },
  { key: 'lessons', label: 'Lessons', icon: '📖', table: 'curriculum_lessons', tab: 'curriculum' },
  { key: 'videos', label: 'Videos', icon: '📺', table: 'video_lectures', tab: 'videos' },
  { key: 'downloads', label: 'Downloads', icon: '📥', table: 'downloads', tab: 'downloads' },
  { key: 'games', label: 'Games', icon: '🎮', table: 'games', tab: 'games', filter: 'games' },
  { key: 'workbooks', label: 'Workbooks', icon: '📘', table: 'games', tab: 'workbooks', filter: 'workbooks' },
  { key: 'speaking', label: 'Speaking', icon: '🎙️', table: 'speaking_scenarios', tab: 'speaking' },
  { key: 'reading', label: 'Smart Reading', icon: '📖', table: 'reading_stories', tab: 'reading' },
  { key: 'badges', label: 'Badges', icon: '🏆', table: 'badges', tab: 'badges' },
  { key: 'categories', label: 'Categories', icon: '🏷️', table: 'categories', tab: 'categories' },
  { key: 'faqs', label: 'Support FAQs', icon: '❓', table: 'support_faqs', tab: 'support_faqs' },
] as const;

// Sidebar parent menu for tabs that live under a collapsible section,
// so a shortcut can expand the right menu before switching.
const TAB_PARENT_MENU: Record<string, string> = {
  curriculum: 'learning_path',
  slide_builder: 'learning_path',
  categories: 'taxonomy',
  downloads: 'assets',
  games: 'assets',
  workbooks: 'assets',
  wordbank: 'assets',
  videos: 'assets',
  'voice-studio': 'contributors',
};

interface PopularActivity {
  key: string;
  label: string;
  sessions: number;
  minutes: number;
}

interface OverviewExtra {
  content: Record<string, number | null>;
  newToday: number | null;
  newWeek: number | null;
  newMonth: number | null;
  activeToday: number | null;
  activeWeek: number | null;
  popular: PopularActivity[] | null;
  countries: { country: string; count: number }[] | null;
}

const EMPTY_OVERVIEW_EXTRA: OverviewExtra = {
  content: {},
  newToday: null,
  newWeek: null,
  newMonth: null,
  activeToday: null,
  activeWeek: null,
  popular: null,
  countries: null,
};

export default function SuperAdminDashboard() {
  const router = useRouter();
  // Responsive shell: on phone-width layouts the sidebar stacks above
  // the content, so its menu must not swallow the whole screen; the top
  // inset keeps the sidebar header clear of the notch on native.
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isNarrowLayout = windowWidth < 768;
  // Defense-in-depth: only super_admin and content_manager sessions may
  // see the CMS at all. (RLS on the tables remains the real enforcement.)
  const guardStatus = useRequireRole(['super_admin', 'content_manager']);
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    learning_path: false,
    taxonomy: false,
    assets: false,
  });

  // The signed-in admin's own role, so a Content Manager sees only the
  // content sections. Loaded once from the same profile row the guard
  // checks; null while loading (the guard spinner covers that period).
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      const role = (data?.role as string) ?? null;
      setViewerRole(role);
      if (role === 'content_manager') {
        setExpandedMenus(prev => ({ ...prev, learning_path: true, assets: true }));
      }
    })();
  }, []);
  const isContentManager = viewerRole === 'content_manager';

  // Sidebar entries visible to this viewer: for a Content Manager, only
  // the content sections (parents keep just their permitted children).
  const visibleMenu = isContentManager
    ? ADMIN_MENU.flatMap(item => {
        if (item.subItems) {
          const subs = item.subItems.filter(sub => CONTENT_MANAGER_TABS.has(sub.id));
          return subs.length > 0 ? [{ ...item, subItems: subs }] : [];
        }
        return CONTENT_MANAGER_TABS.has(item.id) ? [item] : [];
      })
    : ADMIN_MENU;

  // Overview counts - null shows '—' when a count cannot be loaded.
  const [overviewCounts, setOverviewCounts] = useState<{
    orgs: number | null;
    activeStudents: number | null;
    totalUsers: number | null;
  }>({ orgs: null, activeStudents: null, totalUsers: null });

  const fetchOverviewCounts = useCallback(async () => {
    try {
      const [orgRes, studentRes, userRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('sub_accounts').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      ]);
      setOverviewCounts({
        orgs: orgRes.error ? null : (orgRes.count ?? null),
        activeStudents: studentRes.error ? null : (studentRes.count ?? null),
        totalUsers: userRes.error ? null : (userRes.count ?? null),
      });
    } catch {
      // Counts are decorative on the overview; leave them as '—'.
    }
  }, []);

  // Extended overview stats. Every block fails soft on its own: a
  // failed query leaves its numbers null, which the UI renders as '—'
  // instead of crashing the dashboard.
  const [overviewExtra, setOverviewExtra] = useState<OverviewExtra>(EMPTY_OVERVIEW_EXTRA);

  const fetchOverviewExtra = useCallback(async () => {
    const extra: OverviewExtra = { ...EMPTY_OVERVIEW_EXTRA, content: {} };

    // Content counts (head-count queries against the real tables).
    await Promise.all(
      CONTENT_CARDS.map(async card => {
        try {
          let query = supabase
            .from(card.table)
            .select('id', { count: 'exact', head: true });
          // The games table holds both arcade games and workbook
          // games: the Games card counts only the arcade side (the
          // same published, non-workbook set its tab lists) and the
          // Workbooks card only the workbook side.
          if ('filter' in card && card.filter === 'games') {
            query = query.eq('is_published', true).neq('engine', 'workbook');
          } else if ('filter' in card && card.filter === 'workbooks') {
            query = query.eq('is_published', true).eq('engine', 'workbook');
          }
          const { count, error } = await query;
          extra.content[card.key] = error ? null : (count ?? null);
        } catch {
          extra.content[card.key] = null;
        }
      })
    );

    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    // Growth: new registrations (user_profiles + sub_accounts created_at).
    try {
      const [profileRes, subRes] = await Promise.all([
        supabase.from('user_profiles').select('created_at'),
        supabase.from('sub_accounts').select('created_at'),
      ]);
      if (!profileRes.error && !subRes.error) {
        const stamps = [...(profileRes.data || []), ...(subRes.data || [])]
          .map(r => new Date(r.created_at).getTime())
          .filter(t => !Number.isNaN(t));
        extra.newToday = stamps.filter(t => t >= dayStart.getTime()).length;
        extra.newWeek = stamps.filter(t => t >= weekStart.getTime()).length;
        extra.newMonth = stamps.filter(t => t >= monthStart.getTime()).length;
      }
    } catch {
      // Leave the growth numbers as '—'.
    }

    // Active learners: distinct student_ids in activity_logs.
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('student_id, created_at')
        .gte('created_at', weekStart.toISOString());
      if (!error && data) {
        const weekIds = new Set<string>();
        const todayIds = new Set<string>();
        data.forEach(r => {
          weekIds.add(r.student_id);
          if (new Date(r.created_at).getTime() >= dayStart.getTime()) todayIds.add(r.student_id);
        });
        extra.activeWeek = weekIds.size;
        extra.activeToday = todayIds.size;
      }
    } catch {
      // Leave the activity numbers as '—'.
    }

    // Most popular activities: group the latest activity records by
    // type + target, then resolve target ids to content titles.
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('activity_type, target_id, duration_seconds')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (!error && data) {
        const groups = new Map<string, { type: string; targetId: string | null; sessions: number; seconds: number }>();
        data.forEach(r => {
          const key = `${r.activity_type}:${r.target_id || 'none'}`;
          const g = groups.get(key) || { type: r.activity_type, targetId: r.target_id, sessions: 0, seconds: 0 };
          g.sessions += 1;
          g.seconds += Number(r.duration_seconds) || 0;
          groups.set(key, g);
        });
        const top = [...groups.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 5);

        const titleFor = async (table: string, ids: string[]) => {
          const map = new Map<string, string>();
          if (ids.length === 0) return map;
          const { data: rows, error: titleError } = await supabase.from(table).select('id, title').in('id', ids);
          if (!titleError) (rows || []).forEach(row => map.set(row.id, row.title));
          return map;
        };
        const [lessonTitles, videoTitles, gameTitles] = await Promise.all([
          titleFor('curriculum_lessons', top.filter(g => g.type === 'lesson_slide' && g.targetId).map(g => g.targetId as string)),
          titleFor('video_lectures', top.filter(g => g.type === 'video' && g.targetId).map(g => g.targetId as string)),
          titleFor('games', top.filter(g => g.type === 'game' && g.targetId).map(g => g.targetId as string)),
        ]);

        extra.popular = top.map(g => {
          let label: string;
          if (g.type === 'lesson_slide') label = `📚 Lesson: ${g.targetId ? lessonTitles.get(g.targetId) || 'Untitled lesson' : 'General'}`;
          else if (g.type === 'video') label = `📺 Video: ${g.targetId ? videoTitles.get(g.targetId) || 'Untitled video' : 'General'}`;
          else if (g.type === 'game') label = `🎮 Game: ${g.targetId ? gameTitles.get(g.targetId) || 'Untitled game' : 'General'}`;
          else label = `${g.type}${g.targetId ? '' : ': General'}`;
          return {
            key: `${g.type}:${g.targetId || 'none'}`,
            label,
            sessions: g.sessions,
            minutes: Math.round(g.seconds / 60),
          };
        });
      }
    } catch {
      // Leave the popular list as '—'.
    }

    // Where users are from: country values on registered user profiles.
    // (sub_accounts has no country column - students sit under their
    // school/manager account - so this is honestly a profile breakdown.)
    try {
      const { data, error } = await supabase.from('user_profiles').select('country');
      if (!error && data) {
        const counts = new Map<string, number>();
        data.forEach(r => {
          const c = (r.country || '').trim();
          if (c) counts.set(c, (counts.get(c) || 0) + 1);
        });
        extra.countries = [...counts.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
      }
    } catch {
      // Leave the country list as '—'.
    }

    setOverviewExtra(extra);
  }, []);

  useEffect(() => {
    // The overview is a super_admin section; Content Managers land on
    // the Learning Path instead and never trigger its queries (most
    // would be refused by RLS anyway).
    if (viewerRole !== 'super_admin') return;
    (async () => {
      await Promise.all([fetchOverviewCounts(), fetchOverviewExtra()]);
    })();
  }, [viewerRole, fetchOverviewCounts, fetchOverviewExtra]);

  // Shortcut navigation: switch tab and expand its sidebar parent menu
  // when the tab lives under a collapsible section.
  const goToTab = useCallback((tabId: string) => {
    const parent = TAB_PARENT_MENU[tabId];
    if (parent) {
      setExpandedMenus(prev => ({ ...prev, [parent]: true }));
    }
    setActiveTab(tabId);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const toggleMenu = (menuId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const renderMainContent = () => {
    // A Content Manager can never render a section outside their list,
    // whatever the tab state says - they get the Learning Path instead.
    const effectiveTab =
      isContentManager && !CONTENT_MANAGER_TABS.has(activeTab) ? 'curriculum' : activeTab;
    switch (effectiveTab) {
      case 'overview': {
        const maxCountryCount = overviewExtra.countries && overviewExtra.countries.length > 0
          ? overviewExtra.countries[0].count
          : 0;
        return (
          <View className="space-y-6 gap-6">
            <Text className="font-display text-3xl font-semibold text-navy mb-2">Platform Overview</Text>

            {/* Platform totals - tap through to Users & Organizations */}
            <View className="flex-row flex-wrap gap-4">
              <Pressable onPress={() => goToTab('organizations')} className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
                <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Total Orgs</Text>
                <Text className="font-display text-3xl font-semibold text-navy">{overviewCounts.orgs ?? '—'}</Text>
                <Text className="text-xs font-semibold text-pitch mt-1">Open Users & Organizations →</Text>
              </Pressable>
              <Pressable onPress={() => goToTab('organizations')} className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
                <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Active Students</Text>
                <Text className="font-display text-3xl font-semibold text-navy">{overviewCounts.activeStudents ?? '—'}</Text>
                <Text className="text-xs font-semibold text-pitch mt-1">Open Users & Organizations →</Text>
              </Pressable>
              <Pressable onPress={() => goToTab('organizations')} className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[200px]">
                <Text className="text-slate-500 text-sm font-bold uppercase mb-1">Total Users</Text>
                <Text className="font-display text-3xl font-semibold text-navy">{overviewCounts.totalUsers ?? '—'}</Text>
                <Text className="text-xs font-semibold text-pitch mt-1">Open Users & Organizations →</Text>
              </Pressable>
            </View>

            {/* Content counts with shortcuts into each admin section */}
            <View>
              <Text className="font-display text-xl font-semibold text-navy mb-3">Content</Text>
              <View className="flex-row flex-wrap gap-4">
                {CONTENT_CARDS.map(card => (
                  <Pressable
                    key={card.key}
                    onPress={() => goToTab(card.tab)}
                    className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]"
                  >
                    <Text className="text-2xl mb-1">{card.icon}</Text>
                    <Text className="text-slate-500 text-xs font-bold uppercase mb-1">{card.label}</Text>
                    <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.content[card.key] ?? '—'}</Text>
                    <Text className="text-xs font-semibold text-pitch mt-1">Open →</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Growth & recent activity */}
            <View>
              <Text className="font-display text-xl font-semibold text-navy mb-3">Growth & Activity</Text>
              <View className="flex-row flex-wrap gap-4">
                <View className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]">
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">New Users Today</Text>
                  <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.newToday ?? '—'}</Text>
                </View>
                <View className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]">
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">New Users This Week</Text>
                  <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.newWeek ?? '—'}</Text>
                </View>
                <View className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]">
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">New Users This Month</Text>
                  <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.newMonth ?? '—'}</Text>
                </View>
                <View className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]">
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">Active Learners Today</Text>
                  <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.activeToday ?? '—'}</Text>
                </View>
                <View className="bg-white p-5 rounded-[20px] border border-inkline shadow-sm flex-1 min-w-[150px]">
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">Active Learners This Week</Text>
                  <Text className="font-display text-2xl font-semibold text-navy">{overviewExtra.activeWeek ?? '—'}</Text>
                </View>
              </View>
              <Text className="text-xs text-slate-400 mt-2">
                New users count registered accounts (user profiles + students) created in the period; active learners are distinct students with recorded activity.
              </Text>
            </View>

            {/* Most popular activities + where users are from */}
            <View className="flex-col lg:flex-row gap-4">
              <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1">
                <Text className="font-display font-semibold text-navy text-lg">Most Popular Activities</Text>
                <Text className="text-xs text-slate-400 mt-1 mb-4">Top 5 by recorded sessions (from the latest 5,000 activity records).</Text>
                {overviewExtra.popular === null ? (
                  <Text className="text-slate-400">—</Text>
                ) : overviewExtra.popular.length === 0 ? (
                  <Text className="text-slate-400 italic">No activity recorded yet.</Text>
                ) : (
                  <View className="space-y-3 gap-3">
                    {overviewExtra.popular.map((item, i) => (
                      <View key={item.key} className="flex-row items-center justify-between gap-3">
                        <Text className="text-sm text-text-primary flex-1">{i + 1}. {item.label}</Text>
                        <Text className="text-sm font-bold text-navy">{item.sessions} sessions • {item.minutes} mins</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm flex-1">
                <Text className="font-display font-semibold text-navy text-lg">Where Users Are From</Text>
                <Text className="text-xs text-slate-400 mt-1 mb-4">Countries recorded on registered user profiles. Students learn under their school&apos;s account, so they are counted through it.</Text>
                {overviewExtra.countries === null ? (
                  <Text className="text-slate-400">—</Text>
                ) : overviewExtra.countries.length === 0 ? (
                  <Text className="text-slate-400 italic">No countries recorded on profiles yet.</Text>
                ) : (
                  <View className="space-y-3 gap-3">
                    {overviewExtra.countries.map(row => (
                      <View key={row.country}>
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-sm text-text-primary">{row.country}</Text>
                          <Text className="text-sm font-bold text-navy">{row.count}</Text>
                        </View>
                        <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <View
                            className="h-2 bg-gold rounded-full"
                            style={{ width: `${maxCountryCount > 0 ? Math.round((row.count / maxCountryCount) * 100) : 0}%` }}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      }
      
      case 'categories':
        return <CategoriesManager />;

      case 'downloads':
        return <DownloadsManager />;

      case 'games':
        return <GamesManager />;

      case 'workbooks':
        return <WorkbooksManager />;

      case 'wordbank':
        return <WordBankManager />;

      case 'videos':
        return <VideosManager />;

      case 'speaking':
        return <SpeakingManager />;

      case 'reading':
        return <ReadingManager />;

      case 'voice-studio':
        return <VoiceStudioManager />;

      case 'curriculum':
        return <CurriculumManager />;

      case 'slide_builder':
        return <SlideBuilder />;

      case 'organizations':
        return <UsersManager />;

      case 'page_translations':
        return <PageTranslationsManager />;

      case 'support_faqs':
        return <HelpCenterManager />;

      case 'settings':
        return <SystemSettings />;

      case 'badges':
        return <BadgesManager />;
      
      default:
        return (
          <View>
            <Text className="font-display text-3xl font-semibold text-navy mb-6 capitalize">
              {activeTab.replace('_', ' ')}
            </Text>
            <View className="bg-white rounded-[20px] border border-inkline shadow-sm p-8 items-center justify-center min-h-[400px]">
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
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#0A192F" />
      </View>
    );
  }

  return (
    <View className="flex-1 flex-col md:flex-row bg-canvas">

      {/* LEFT SIDEBAR */}
      <View style={{ paddingTop: insets.top }} className="w-full md:w-72 bg-navy flex-col justify-between border-r border-navy-deep">
        <ScrollView style={isNarrowLayout ? { maxHeight: windowHeight * 0.38 } : undefined}>
          <View className="p-6 border-b border-white/10 mb-4">
            <Text className="font-display text-2xl font-semibold text-white tracking-wide">KYCO</Text>
            <Text className="font-sans text-gold text-[11px] font-bold tracking-[2.5px] uppercase mt-1">{isContentManager ? 'Content Manager' : 'App Manager'}</Text>
          </View>

          <View className="px-4 space-y-1 gap-1 pb-6">
            {visibleMenu.map((item) => {
              const subItems = item.subItems ?? [];
              const hasSubItems = subItems.length > 0;
              const isExpanded = expandedMenus[item.id];
              const isActivePrimary = activeTab === item.id || (hasSubItems && subItems.some(sub => sub.id === activeTab));

              return (
                <View key={item.id}>
                  {/* Primary Menu Item */}
                  <Pressable
                    onPress={() => hasSubItems ? toggleMenu(item.id) : setActiveTab(item.id)}
                    className={`flex-row items-center justify-between px-4 py-3 rounded-xl ${isActivePrimary && !hasSubItems ? 'bg-gold/15' : 'hover:bg-white/5'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{item.icon}</Text>
                      <Text className={`font-sans font-semibold text-sm ${isActivePrimary && !hasSubItems ? 'text-gold' : isActivePrimary ? 'text-white' : 'text-slate-400'}`}>
                        {item.label}
                      </Text>
                    </View>
                    {hasSubItems && (
                      <Text className="text-slate-400 text-xs">{isExpanded ? '▼' : '▶'}</Text>
                    )}
                  </Pressable>

                  {/* Collapsible Sub-Items */}
                  {hasSubItems && isExpanded && (
                    <View className="mt-1 mb-2 ml-10 space-y-1 gap-1 border-l-2 border-white/15 pl-3">
                      {subItems.map((subItem) => {
                        const isSubActive = activeTab === subItem.id;
                        return (
                          <Pressable
                            key={subItem.id}
                            onPress={() => setActiveTab(subItem.id)}
                            className={`py-2 px-3 rounded-xl ${isSubActive ? 'bg-gold/20' : 'hover:bg-white/5'}`}
                          >
                            <Text className={`font-sans text-sm ${isSubActive ? 'text-gold font-bold' : 'text-slate-400'}`}>
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

        <View className="p-4 border-t border-white/10 mt-auto">
          <Pressable
            onPress={handleLogout}
            className="flex-row items-center px-4 py-3 rounded-xl hover:bg-white/5"
          >
            <Text className="text-xl mr-3">🚪</Text>
            <Text className="font-sans font-semibold text-sm text-slate-400">Log Out</Text>
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