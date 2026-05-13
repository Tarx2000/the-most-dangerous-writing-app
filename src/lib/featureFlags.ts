import { storage } from '@/lib/storage';
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_STORAGE_KEY,
  type FeatureFlags,
} from '@/config/flags';

let _cachedFlags: FeatureFlags | null = null;

export async function loadFeatureFlags(): Promise<FeatureFlags> {
  try {
    const raw = await storage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FeatureFlags>;
      _cachedFlags = { ...DEFAULT_FEATURE_FLAGS, ...parsed };
      return _cachedFlags;
    }
  } catch {
    /* ignore parse errors */
  }
  _cachedFlags = { ...DEFAULT_FEATURE_FLAGS };
  return _cachedFlags;
}

export function getFeatureFlags(): FeatureFlags {
  if (_cachedFlags) return _cachedFlags;
  return { ...DEFAULT_FEATURE_FLAGS };
}

export function updateFeatureFlag<K extends keyof FeatureFlags>(
  key: K,
  value: FeatureFlags[K]
): void {
  if (!_cachedFlags) {
    _cachedFlags = { ...DEFAULT_FEATURE_FLAGS };
  }
  _cachedFlags[key] = value;
}

export async function persistFeatureFlags(): Promise<void> {
  if (_cachedFlags) {
    await storage.setItem(FEATURE_FLAG_STORAGE_KEY, JSON.stringify(_cachedFlags));
  }
}
