import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ElegantCard, MicroLabel, ScreenHeader } from '../../components/ui/Elegant';
import { isOfflineNow } from '../../lib/connectivity';
import { fetchStageNameMap } from '../../lib/curriculumTaxonomy';
import {
  buildPackInventory,
  cacheInventory,
  deletePack,
  downloadPack,
  formatBytes,
  getCachedInventory,
  listModules,
  listPackRecords,
  offlinePacksSupported,
  type ModuleSummary,
  type PackDownloadProgress,
  type PackInventory,
  type PackRecord,
} from '../../lib/offlinePacks';
import { queuedProgressCount } from '../../lib/progressQueue';
import { showAlert } from '../../lib/showAlert';
import { useSafeBack } from '../../lib/useSafeBack';

/**
 * My Downloads (Round 93, offline packs Phase 1).
 *
 * One row per curriculum module. A pack is the module's lessons,
 * pictures and recorded voices (the student's own chosen voices),
 * stored on this device so the lessons play with no connection.
 * The pack's real size is measured from its actual files and shown
 * BEFORE anything downloads — no surprises on a family's phone.
 *
 * Downloaded packs survive app updates and browser restarts. If
 * the device is offline when this screen opens, it simply lists
 * the packs already on the device.
 */

type RowBusy = 'sizing' | 'downloading' | undefined;

function moduleShortTitle(module: ModuleSummary): string {
  const name = module.title.replace(/^Stage \d+ · Module \d+:\s*/, '');
  const moduleNo = module.orderIndex % 100;
  return `Module ${moduleNo} · ${name}`;
}

export default function MyDownloads() {
  const goBack = useSafeBack();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [packs, setPacks] = useState<Map<string, PackRecord>>(new Map());
  const [inventories, setInventories] = useState<Map<string, PackInventory>>(new Map());
  const [busy, setBusy] = useState<Map<string, RowBusy>>(new Map());
  const [progress, setProgress] = useState<Map<string, PackDownloadProgress>>(new Map());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const supported = offlinePacksSupported();

  const refreshLocalState = useCallback(async () => {
    const records = await listPackRecords();
    setPacks(new Map(records.map((r) => [r.moduleId, r])));
    setQueuedCount(await queuedProgressCount());
    try {
      const estimate = await navigator.storage?.estimate?.();
      setStorageUsage(typeof estimate?.usage === 'number' ? estimate.usage : null);
    } catch {
      setStorageUsage(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshLocalState();
        setStageNames(await fetchStageNameMap());
        try {
          const list = await listModules();
          setModules(list);
          // Bring back any sizes measured on earlier visits.
          const cached = new Map<string, PackInventory>();
          for (const m of list) {
            const inv = await getCachedInventory(m.id);
            if (inv) cached.set(m.id, inv);
          }
          setInventories(cached);
        } catch {
          // Offline (or the list would not load): show the packs
          // that are already on this device, derived from their
          // records, and say so.
          const records = await listPackRecords();
          setModules(
            records.map((r) => ({
              id: r.moduleId,
              title: r.moduleTitle,
              orderIndex: r.moduleOrderIndex,
              stageId: null,
            }))
          );
          setOfflineNote(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshLocalState]);

  const setRowBusy = (moduleId: string, state: RowBusy) => {
    setBusy((prev) => {
      const next = new Map(prev);
      if (state === undefined) next.delete(moduleId);
      else next.set(moduleId, state);
      return next;
    });
  };

  const handleMeasure = async (module: ModuleSummary) => {
    setRowBusy(module.id, 'sizing');
    try {
      const inventory = await buildPackInventory(module.id);
      await cacheInventory(inventory);
      setInventories((prev) => new Map(prev).set(module.id, inventory));
    } catch {
      showAlert(
        'Could not measure this pack',
        'The size could not be checked just now. Please check your connection and try again.'
      );
    } finally {
      setRowBusy(module.id, undefined);
    }
  };

  const handleDownload = async (module: ModuleSummary) => {
    setRowBusy(module.id, 'downloading');
    setProgress((prev) => new Map(prev).set(module.id, { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 }));
    try {
      await downloadPack(module.id, (p) => {
        setProgress((prev) => new Map(prev).set(module.id, p));
      });
      await refreshLocalState();
    } catch (err: any) {
      showAlert(
        'Download did not finish',
        (err?.message || 'Something went wrong while downloading.') +
          ' Nothing was saved — you can try again, and files that did arrive will be reused.'
      );
    } finally {
      setRowBusy(module.id, undefined);
      setProgress((prev) => {
        const next = new Map(prev);
        next.delete(module.id);
        return next;
      });
    }
  };

  const handleDelete = async (module: ModuleSummary) => {
    if (confirmingDelete !== module.id) {
      setConfirmingDelete(module.id);
      return;
    }
    setConfirmingDelete(null);
    await deletePack(module.id);
    await refreshLocalState();
  };

  const stages = new Map<number, ModuleSummary[]>();
  for (const m of modules) {
    const stageNo = Math.floor(m.orderIndex / 100);
    if (!stages.has(stageNo)) stages.set(stageNo, []);
    stages.get(stageNo)!.push(m);
  }

  const totalPackBytes = [...packs.values()].reduce((sum, p) => sum + p.sizeBytes, 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <ScreenHeader title="My Downloads" onBack={goBack} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View className="w-full max-w-3xl mx-auto">
          <View className="mb-6">
            <MicroLabel className="mb-2">Learn Anywhere</MicroLabel>
            <Text className="font-sans text-lg text-slate-500">
              Download a module while you are online, and its lessons — pictures and voices
              included — will play on this device with no connection at all.
            </Text>
          </View>

          <ElegantCard className="p-5 mb-6">
            <Text className="font-sans text-sm text-slate-600 leading-6">
              📥 Each pack holds one module: its 8 lessons, every picture, and the recorded
              voices you have chosen in your Profile. The size is measured from the real
              files and shown before you download. If you change your voices later, delete
              the pack and download it again to hear the new voices offline.
            </Text>
            <Text className="font-sans text-sm text-slate-600 leading-6 mt-3">
              🍎 On iPhone, if the device runs very low on space, the browser may remove
              downloaded packs to make room. You can always download them again — nothing
              is ever lost.
            </Text>
            {packs.size > 0 ? (
              <Text className="font-sans text-sm font-bold text-navy mt-3">
                On this device: {packs.size} pack{packs.size === 1 ? '' : 's'} ·{' '}
                {formatBytes(totalPackBytes)}
                {storageUsage !== null ? ` · the app uses about ${formatBytes(storageUsage)} in total` : ''}
              </Text>
            ) : null}
            {queuedCount > 0 ? (
              <Text className="font-sans text-sm font-bold text-pitch-dark mt-2">
                ⏳ {queuedCount} piece{queuedCount === 1 ? '' : 's'} of progress earned offline{' '}
                {isOfflineNow() ? 'will sync when you are back online.' : 'are syncing…'}
              </Text>
            ) : null}
          </ElegantCard>

          {!supported ? (
            <ElegantCard className="p-5 mb-6">
              <Text className="font-sans text-sm text-amber-700">
                Offline packs are not available in this browser. Lessons still work as
                usual whenever you are online.
              </Text>
            </ElegantCard>
          ) : null}

          {offlineNote ? (
            <ElegantCard className="p-5 mb-6">
              <Text className="font-sans text-sm text-slate-600">
                📴 You are offline, so this list shows only the packs already on this
                device. Reconnect to see every module and download more.
              </Text>
            </ElegantCard>
          ) : null}

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0A192F" />
            </View>
          ) : modules.length === 0 ? (
            <ElegantCard className="py-16 items-center justify-center px-6">
              <Text className="text-4xl mb-3">📥</Text>
              <Text className="font-display text-xl font-semibold text-navy mb-2 text-center">
                No modules to show
              </Text>
              <Text className="font-sans text-slate-500 text-center">
                Connect to the internet once, and the modules you can download will appear here.
              </Text>
            </ElegantCard>
          ) : (
            [...stages.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([stageNo, stageModules]) => (
                <View key={stageNo} className="mb-8">
                  <Text className="font-display text-lg font-semibold text-navy mb-3">
                    Stage {stageNo}
                    {stageModules[0]?.stageId && stageNames[stageModules[0].stageId]
                      ? ` · ${stageNames[stageModules[0].stageId]}`
                      : ''}
                  </Text>
                  <View className="gap-3">
                    {stageModules.map((module) => {
                      const pack = packs.get(module.id);
                      const inventory = inventories.get(module.id);
                      const rowBusy = busy.get(module.id);
                      const rowProgress = progress.get(module.id);
                      const pct =
                        rowProgress && rowProgress.bytesTotal > 0
                          ? Math.min(100, Math.round((rowProgress.bytesDone / rowProgress.bytesTotal) * 100))
                          : rowProgress && rowProgress.filesTotal > 0
                            ? Math.round((rowProgress.filesDone / rowProgress.filesTotal) * 100)
                            : 0;
                      return (
                        <ElegantCard key={module.id} className="p-4">
                          <View className="flex-row items-center justify-between gap-3">
                            <View className="flex-1">
                              <Text className="font-sans font-bold text-navy">
                                {moduleShortTitle(module)}
                              </Text>
                              {pack ? (
                                <Text className="font-sans text-xs text-pitch-dark mt-1">
                                  ✓ Downloaded · {formatBytes(pack.sizeBytes)} · {pack.fileCount} files ·{' '}
                                  {new Date(pack.downloadedAt).toLocaleDateString()}
                                </Text>
                              ) : rowBusy === 'downloading' && rowProgress ? (
                                <Text className="font-sans text-xs text-slate-500 mt-1">
                                  Downloading… {rowProgress.filesDone} of {rowProgress.filesTotal} files
                                </Text>
                              ) : inventory ? (
                                <Text className="font-sans text-xs text-slate-500 mt-1">
                                  {inventory.unknownCount > 0 ? 'About ' : ''}
                                  {formatBytes(inventory.sizeBytes)} · {inventory.assets.length} files ·{' '}
                                  {inventory.lessons.length} lessons
                                </Text>
                              ) : (
                                <Text className="font-sans text-xs text-slate-400 mt-1">
                                  Not downloaded
                                </Text>
                              )}
                            </View>
                            {pack ? (
                              <Pressable
                                onPress={() => handleDelete(module)}
                                className={`px-4 py-2 rounded-full border ${
                                  confirmingDelete === module.id
                                    ? 'bg-red-500 border-red-500'
                                    : 'border-inkline bg-white'
                                }`}
                              >
                                <Text
                                  className={`font-sans text-sm font-bold ${
                                    confirmingDelete === module.id ? 'text-white' : 'text-slate-500'
                                  }`}
                                >
                                  {confirmingDelete === module.id ? 'Tap again to delete' : 'Delete'}
                                </Text>
                              </Pressable>
                            ) : rowBusy === 'downloading' ? (
                              <ActivityIndicator color="#0A192F" />
                            ) : rowBusy === 'sizing' ? (
                              <ActivityIndicator color="#0A192F" />
                            ) : inventory ? (
                              <Pressable
                                onPress={() => handleDownload(module)}
                                className="px-4 py-2 rounded-full bg-navy border-b-4 border-navy-deep"
                              >
                                <Text className="font-sans text-sm font-bold text-white">Download</Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() => handleMeasure(module)}
                                className="px-4 py-2 rounded-full bg-white border border-inkline"
                              >
                                <Text className="font-sans text-sm font-bold text-navy">See the size</Text>
                              </Pressable>
                            )}
                          </View>
                          {rowBusy === 'downloading' ? (
                            <View className="h-2 bg-inkline/40 rounded-full mt-3 overflow-hidden">
                              <View className="h-2 bg-gold rounded-full" style={{ width: `${pct}%` }} />
                            </View>
                          ) : null}
                        </ElegantCard>
                      );
                    })}
                  </View>
                </View>
              ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
