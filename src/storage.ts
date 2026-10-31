// IndexedDB persistence via idb-keyval. Every call is wrapped so the app keeps working if storage is unavailable.
import { createStore, del, get, keys, set, getMany } from 'idb-keyval';
import { normalizeMatch, type Match } from './engine';
import { normalizeSettings, type AppSettings } from './settings';

const store = createStore('tt-courtside', 'kv');
const CURRENT = 'current-match';
const PREFS = 'prefs';
const SETTINGS = 'settings';
const ARCHIVE_PREFIX = 'archive:';

export interface Prefs {
  swappedSides: boolean;
  keepAwake: boolean;
}
export const defaultPrefs: Prefs = { swappedSides: false, keepAwake: true };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn('[storage]', e);
    return fallback;
  }
}

export const loadCurrent = async () => {
  const m = await safe(() => get<Match>(CURRENT, store), undefined);
  return m ? normalizeMatch(m) : undefined;
};
export const saveCurrent = (m: Match) => safe(() => set(CURRENT, m, store), undefined);

export const loadPrefs = async (): Promise<Prefs> => ({ ...defaultPrefs, ...(await safe(() => get<Prefs>(PREFS, store), undefined)) });
export const savePrefs = (p: Prefs) => safe(() => set(PREFS, p, store), undefined);

/** Settings include the Jira API token; they stay on this device and are never exported. */
export const loadSettings = async (): Promise<AppSettings> => normalizeSettings(await safe(() => get<AppSettings>(SETTINGS, store), undefined));
export const saveSettings = (s: AppSettings) => safe(() => set(SETTINGS, s, store), undefined);
export const getArchived = async (id: string) => {
  const m = await safe(() => get<Match>(ARCHIVE_PREFIX + id, store), undefined);
  return m ? normalizeMatch(m) : undefined;
};

/** Archive keyed by match id: saving the same match again replaces its entry instead of duplicating it. */
export const archiveMatch = (m: Match) => safe(() => set(ARCHIVE_PREFIX + m.id, m, store), undefined);
export const deleteArchived = (id: string) => safe(() => del(ARCHIVE_PREFIX + id, store), undefined);

export async function listArchive(): Promise<Match[]> {
  return safe(async () => {
    const ks = (await keys(store)).filter((k) => typeof k === 'string' && k.startsWith(ARCHIVE_PREFIX));
    const items = (await getMany<Match | undefined>(ks, store)).filter((m): m is Match => Boolean(m)).map(normalizeMatch);
    return items.sort((a, b) => (b.meta.matchDate + b.createdAt).localeCompare(a.meta.matchDate + a.createdAt));
  }, []);
}

/** Ask the browser not to evict our data. Safari may ignore this; installing to the home screen matters more. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
