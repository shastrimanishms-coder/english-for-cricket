import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Saved accounts for the Switch Account screen (Round 81, Part 3).
 *
 * Families share one device, so every learner who has successfully
 * logged in on this device is remembered here and can be switched to
 * by picking their name and re-entering ONLY their password or PIN.
 *
 * SECURITY RULE — identifiers only, never credentials: a saved entry
 * holds the account kind, the display name, and the login identifier
 * (email for email learners; username for PIN students, which is all
 * the PIN login asks for besides the PIN itself). Passwords and PINs
 * are NEVER written to this list or anywhere else in storage; the
 * credential is typed fresh at every switch and goes only to the
 * existing login calls.
 */
export interface SavedAccount {
  kind: 'auth' | 'sub_account';
  displayName: string;
  /** Email (auth) or username (sub_account), stored lower-cased. */
  identifier: string;
}

const SAVED_ACCOUNTS_KEY = 'efc_saved_accounts';

function normalise(raw: unknown): SavedAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'auth' && r.kind !== 'sub_account') return null;
  if (typeof r.identifier !== 'string' || !r.identifier.trim()) return null;
  return {
    kind: r.kind,
    displayName: typeof r.displayName === 'string' && r.displayName.trim() ? r.displayName : r.identifier,
    identifier: r.identifier.trim().toLowerCase(),
  };
}

export async function loadSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedAccount[] = [];
    for (const item of parsed) {
      const account = normalise(item);
      if (account && !out.some((a) => a.kind === account.kind && a.identifier === account.identifier)) {
        out.push(account);
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function persist(accounts: SavedAccount[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Remembering is a convenience; a storage failure must never
    // break the login that triggered it.
  }
}

/** Add (or refresh) the entry for an account that just logged in. */
export async function rememberSavedAccount(account: SavedAccount): Promise<void> {
  const entry = normalise(account);
  if (!entry) return;
  const existing = await loadSavedAccounts();
  const rest = existing.filter((a) => !(a.kind === entry.kind && a.identifier === entry.identifier));
  await persist([entry, ...rest]);
}

/** Remove one account from this device's list (the account itself is untouched). */
export async function removeSavedAccount(kind: SavedAccount['kind'], identifier: string): Promise<void> {
  const id = identifier.trim().toLowerCase();
  const existing = await loadSavedAccounts();
  await persist(existing.filter((a) => !(a.kind === kind && a.identifier === id)));
}
