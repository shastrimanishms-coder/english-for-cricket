// Round 97: the shared "upload door" for admin content sections.
//
// Content is no longer created by typing into admin forms - it
// arrives as one JSON package file (the shape the future Content
// Studio exports). The door follows the Workbooks import pattern:
//   1. pick a package file,
//   2. full validation + a plain-language PLAN (nothing installed),
//   3. Install button -> install -> result report.
// A package that fails validation or planning installs NOTHING.

import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface DoorValidation {
  errors: string[];
  items?: any[];
}

export interface DoorPlan {
  errors: string[];
  lines: string[];
}

interface ContentUploadDoorProps {
  title: string;
  blurb: string;
  formatLines: string[];
  exampleJson: string;
  exampleFileName: string;
  validate: (text: string) => DoorValidation;
  plan: (items: any[]) => Promise<DoorPlan>;
  install: (items: any[]) => Promise<string[]>;
  onInstalled?: () => void;
}

type Phase = 'idle' | 'checking' | 'invalid' | 'planned' | 'installing' | 'done';
// Admin palette (matches the NativeWind navy/slate theme used
// across the admin managers).
const COLORS = {
  primary: '#0A192F',
  white: '#ffffff',
  text: '#1e293b',
  textLight: '#64748b',
  border: '#e2e8f0',
  error: '#dc2626',
};


export default function ContentUploadDoor({
  title,
  blurb,
  formatLines,
  exampleJson,
  exampleFileName,
  validate,
  plan,
  install,
  onInstalled,
}: ContentUploadDoorProps) {
  const [showFormat, setShowFormat] = useState(false);
  const [fileName, setFileName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errors, setErrors] = useState<string[]>([]);
  const [planLines, setPlanLines] = useState<string[]>([]);
  const [resultLines, setResultLines] = useState<string[]>([]);
  const [items, setItems] = useState<any[] | null>(null);
  const [busyNote, setBusyNote] = useState('');

  function reset() {
    setFileName('');
    setPhase('idle');
    setErrors([]);
    setPlanLines([]);
    setResultLines([]);
    setItems(null);
    setBusyNote('');
  }

  async function handlePick() {
    setBusyNote('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setFileName(asset.name);
    setPhase('checking');
    setErrors([]);
    setPlanLines([]);
    setResultLines([]);
    setItems(null);
    try {
      const res = await fetch(asset.uri);
      const text = await res.text();
      const checked = validate(text);
      if (checked.errors.length > 0 || !checked.items) {
        setErrors(checked.errors.length > 0 ? checked.errors : ['The package could not be read.']);
        setPhase('invalid');
        return;
      }
      const planned = await plan(checked.items);
      if (planned.errors.length > 0) {
        setErrors(planned.errors);
        setPhase('invalid');
        return;
      }
      setItems(checked.items);
      setPlanLines(planned.lines);
      setPhase('planned');
    } catch (e: any) {
      setErrors([e?.message ?? 'The file could not be read.']);
      setPhase('invalid');
    }
  }

  async function handleInstall() {
    if (!items) return;
    setPhase('installing');
    try {
      const lines = await install(items);
      setResultLines(lines);
      setPhase('done');
      onInstalled?.();
    } catch (e: any) {
      setErrors([e?.message ?? 'Install failed. Nothing further was written.']);
      setPhase('invalid');
    }
  }

  function downloadExample() {
    if (Platform.OS !== 'web') return;
    const blob = new Blob([exampleJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exampleFileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.blurb}>{blurb}</Text>

      <TouchableOpacity onPress={() => setShowFormat((v) => !v)}>
        <Text style={styles.formatToggle}>
          {showFormat ? '▾ Hide the package format' : '▸ Package format & example'}
        </Text>
      </TouchableOpacity>
      {showFormat ? (
        <View style={styles.formatBox}>
          {formatLines.map((line) => (
            <Text key={line} style={styles.formatLine}>
              • {line}
            </Text>
          ))}
          <Text style={styles.exampleLabel}>Example package:</Text>
          <Text style={styles.exampleText} selectable>
            {exampleJson}
          </Text>
          {Platform.OS === 'web' ? (
            <TouchableOpacity style={styles.exampleBtn} onPress={downloadExample}>
              <Text style={styles.exampleBtnText}>⬇ Download this example file</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {phase !== 'done' ? (
        <TouchableOpacity
          style={styles.pickBtn}
          onPress={handlePick}
          disabled={phase === 'checking' || phase === 'installing'}
        >
          <Text style={styles.pickBtnText}>
            {phase === 'checking' ? 'Checking the package…' : '📄 Choose a package file (.json)'}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.pickBtn} onPress={reset}>
          <Text style={styles.pickBtnText}>📄 Upload another package</Text>
        </TouchableOpacity>
      )}
      {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}
      {busyNote ? <Text style={styles.note}>{busyNote}</Text> : null}

      {phase === 'invalid' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Nothing was installed. Please fix these and upload again:</Text>
          {errors.map((e) => (
            <Text key={e} style={styles.errorLine}>
              • {e}
            </Text>
          ))}
        </View>
      ) : null}

      {phase === 'planned' || phase === 'installing' ? (
        <View style={styles.planBox}>
          <Text style={styles.planTitle}>Plan - this is what will happen:</Text>
          {planLines.map((l) => (
            <Text key={l} style={styles.planLine}>
              • {l}
            </Text>
          ))}
          <TouchableOpacity
            style={[styles.installBtn, phase === 'installing' && styles.btnDisabled]}
            onPress={handleInstall}
            disabled={phase === 'installing'}
          >
            <Text style={styles.installBtnText}>
              {phase === 'installing' ? 'Installing…' : '✅ Install this package'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {phase === 'done' ? (
        <View style={styles.doneBox}>
          <Text style={styles.doneTitle}>Installed:</Text>
          {resultLines.map((l) => (
            <Text key={l} style={styles.doneLine}>
              • {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#eef6ee',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bcd8bc',
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  blurb: { fontSize: 13, color: COLORS.textLight, lineHeight: 19, marginBottom: 8 },
  formatToggle: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  formatBox: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formatLine: { fontSize: 12, color: COLORS.text, lineHeight: 18, marginBottom: 4 },
  exampleLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginTop: 8, marginBottom: 4 },
  exampleText: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontSize: 11,
    color: COLORS.text,
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    padding: 8,
  },
  exampleBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  exampleBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  pickBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  pickBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  fileName: { fontSize: 12, color: COLORS.textLight, marginTop: 6 },
  note: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  errorBox: {
    backgroundColor: '#fdecea',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#f0b8b0',
  },
  errorTitle: { fontSize: 13, fontWeight: '700', color: COLORS.error, marginBottom: 4 },
  errorLine: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  planBox: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  planTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  planLine: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  installBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 10,
  },
  btnDisabled: { opacity: 0.6 },
  installBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  doneBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  doneTitle: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  doneLine: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
});
