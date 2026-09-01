/**
 * localStorage 얇은 래퍼. 사파리 프라이빗 모드나 저장소 가득 참 상황에서
 * 던지는 예외 때문에 게임이 멈추지 않도록 전부 감싼다.
 */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 무시 — 저장소가 없어도 플레이는 계속된다 */
  }
}

export const STORAGE_KEYS = {
  identity: 'euler:identity',
  profile: 'euler:profile',
  pendingPlays: 'euler:pendingPlays',
  localConfig: 'euler:localConfig',
  teacherUnlocked: 'euler:teacherUnlocked',
} as const;
