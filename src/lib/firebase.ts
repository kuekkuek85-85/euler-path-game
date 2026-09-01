import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * 환경변수가 없으면 Firebase 없이 "로컬 전용 모드"로 돈다.
 * 교실에서 설정이 빠져 있어도 게임 자체는 반드시 돌아가야 한다 (PRD 7.3).
 */
export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId);

/**
 * SDK는 전부 동적 import로 불러온다. 첫 화면이 Firebase 번들(gzip 약 130KB)을
 * 기다리지 않고 즉시 그려지고, 네트워크가 나빠도 게임은 그대로 진행된다 (PRD 7.2 / 7.3).
 */
export type FirestoreModule = typeof import('firebase/firestore');

let appPromise: Promise<FirebaseApp | null> | null = null;
let dbPromise: Promise<Firestore | null> | null = null;
let authPromise: Promise<Auth | null> | null = null;
let firestoreModule: Promise<FirestoreModule> | null = null;
let initError: string | null = null;

function loadApp(): Promise<FirebaseApp | null> {
  if (!firebaseEnabled) return Promise.resolve(null);
  appPromise ??= import('firebase/app')
    .then(({ initializeApp }) => initializeApp(config as Record<string, string>))
    .catch((error) => {
      initError = String(error);
      console.warn('[firebase] 초기화 실패 — 로컬 모드로 계속합니다.', error);
      return null;
    });
  return appPromise;
}

export function firestoreApi(): Promise<FirestoreModule> {
  firestoreModule ??= import('firebase/firestore');
  return firestoreModule;
}

export function getDb(): Promise<Firestore | null> {
  if (!firebaseEnabled) return Promise.resolve(null);
  dbPromise ??= (async () => {
    const app = await loadApp();
    if (!app) return null;
    try {
      const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } =
        await firestoreApi();
      // PRD 7.3: 오프라인 지속성. 여러 탭을 열어도 안전한 매니저를 쓴다.
      return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (error) {
      initError = String(error);
      console.warn('[firebase] Firestore 초기화 실패 — 로컬 모드로 계속합니다.', error);
      return null;
    }
  })();
  return dbPromise;
}

function getFirebaseAuth(): Promise<Auth | null> {
  if (!firebaseEnabled) return Promise.resolve(null);
  authPromise ??= (async () => {
    const app = await loadApp();
    if (!app) return null;
    const { getAuth } = await import('firebase/auth');
    return getAuth(app);
  })();
  return authPromise;
}

/** PRD 5.2: 진입 시 익명 인증으로 uid를 확보한다. 실패해도 게임은 계속된다. */
export async function ensureAnonymousAuth(): Promise<string | null> {
  try {
    const auth = await getFirebaseAuth();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser.uid;
    const { signInAnonymously } = await import('firebase/auth');
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  } catch (error) {
    console.warn('[firebase] 익명 인증 실패 — 로컬 모드로 계속합니다.', error);
    return null;
  }
}

export function getFirebaseInitError(): string | null {
  return initError;
}
