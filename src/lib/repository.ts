import type { GlobalConfig, PlayLog, StageRecord, StudentProfile } from '../types';
import { firebaseEnabled, firestoreApi, getDb } from './firebase';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from './storage';

export const DEFAULT_CONFIG: GlobalConfig = {
  dashboardVisible: true,
  nameMasking: true,
  activeStages: [],
  oddViewUnlocked: false,
};

type Unsubscribe = () => void;

/**
 * Firestore 모듈이 도착하기 전에 구독이 해제될 수 있으므로,
 * 즉시 해제 함수를 돌려주고 실제 리스너는 준비되는 대로 연결한다.
 */
function lazySubscribe(connect: () => Promise<Unsubscribe | null>): Unsubscribe {
  let inner: Unsubscribe | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const unsubscribe = await connect();
      if (cancelled) unsubscribe?.();
      else inner = unsubscribe;
    } catch (error) {
      console.warn('[repository] 구독을 시작하지 못했습니다.', error);
    }
  })();
  return () => {
    cancelled = true;
    inner?.();
    inner = null;
  };
}

/* ------------------------------------------------------------------ */
/* 저장 대기 큐 (PRD 7.3)                                              */
/* ------------------------------------------------------------------ */

interface PendingPlay {
  localId: string;
  log: PlayLog;
  profile: StudentProfile;
}

type Listener = (pendingCount: number) => void;
const listeners = new Set<Listener>();

function readPending(): PendingPlay[] {
  return readJson<PendingPlay[]>(STORAGE_KEYS.pendingPlays, []);
}

function writePending(items: PendingPlay[]): void {
  writeJson(STORAGE_KEYS.pendingPlays, items);
  for (const listener of listeners) listener(items.length);
}

export function pendingCount(): number {
  return readPending().length;
}

export function onPendingChange(listener: Listener): Unsubscribe {
  listeners.add(listener);
  listener(pendingCount());
  return () => {
    listeners.delete(listener);
  };
}

/* ------------------------------------------------------------------ */
/* 학생 문서                                                           */
/* ------------------------------------------------------------------ */

function localProfileKey(studentNo: string): string {
  return `${STORAGE_KEYS.profile}:${studentNo}`;
}

export function readLocalProfile(studentNo: string): StudentProfile | null {
  return readJson<StudentProfile | null>(localProfileKey(studentNo), null);
}

export function writeLocalProfile(profile: StudentProfile): void {
  writeJson(localProfileKey(profile.studentNo), profile);
}

/** Firestore Timestamp를 정적 import 없이 밀리초로 바꾼다. */
function toMillis(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function normalizeProfile(studentNo: string, data: Record<string, unknown>): StudentProfile {
  return {
    studentNo,
    name: String(data.name ?? ''),
    classId: String(data.classId ?? ''),
    uid: typeof data.uid === 'string' ? data.uid : undefined,
    totalScore: Number(data.totalScore ?? 0),
    clearedCount: Number(data.clearedCount ?? 0),
    best: (data.best as Record<string, StageRecord>) ?? {},
    createdAt: toMillis(data.createdAt),
    lastPlayedAt: toMillis(data.lastPlayedAt),
  };
}

/**
 * 학번으로 학생 문서를 확보한다. 이미 있으면 그 기록을 이어받고(기기 교체 대응, AC-05),
 * 없으면 0점 문서를 만든다. Firestore를 못 쓰면 localStorage 기록으로 되돌아간다.
 */
export async function ensureStudent(input: {
  studentNo: string;
  name: string;
  classId: string;
  uid: string | null;
}): Promise<StudentProfile> {
  const local = readLocalProfile(input.studentNo);
  const fallback: StudentProfile = local
    ? { ...local, name: input.name, classId: input.classId }
    : {
        studentNo: input.studentNo,
        name: input.name,
        classId: input.classId,
        uid: input.uid ?? undefined,
        totalScore: 0,
        clearedCount: 0,
        best: {},
        createdAt: Date.now(),
      };

  const db = await getDb();
  if (!db) {
    writeLocalProfile(fallback);
    return fallback;
  }

  try {
    const { doc, getDoc, setDoc, serverTimestamp } = await firestoreApi();
    const ref = doc(db, 'students', input.studentNo);
    const snapshot = await getDoc(ref);

    if (snapshot.exists()) {
      const remote = normalizeProfile(input.studentNo, snapshot.data());
      // 이름이 바뀌었으면 갱신하되 점수는 건드리지 않는다.
      if (remote.name !== input.name || remote.classId !== input.classId) {
        await setDoc(
          ref,
          { studentNo: input.studentNo, name: input.name, classId: input.classId },
          { merge: true },
        );
        remote.name = input.name;
        remote.classId = input.classId;
      }
      writeLocalProfile(remote);
      return remote;
    }

    // 보안 규칙(§6.4)이 생성 시 totalScore == 0 을 요구한다.
    const created: StudentProfile = { ...fallback, totalScore: 0, clearedCount: 0, best: {} };
    await setDoc(ref, {
      studentNo: created.studentNo,
      name: created.name,
      classId: created.classId,
      uid: input.uid ?? null,
      totalScore: 0,
      clearedCount: 0,
      best: {},
      createdAt: serverTimestamp(),
      lastPlayedAt: serverTimestamp(),
    });
    writeLocalProfile(created);
    return created;
  } catch (error) {
    console.warn('[repository] 학생 문서를 읽지 못해 로컬 기록으로 진행합니다.', error);
    writeLocalProfile(fallback);
    return fallback;
  }
}

/**
 * 스테이지 최고 기록만 누적한다 (PRD 3.4). 새 기록이 아니면 프로필은 그대로다.
 */
export function applyBest(
  profile: StudentProfile,
  stageId: string,
  record: StageRecord,
): { profile: StudentProfile; improved: boolean } {
  const previous = profile.best[stageId];
  const improved = !previous || record.score > previous.score;
  if (!improved) return { profile, improved: false };

  const best = { ...profile.best, [stageId]: record };
  const totalScore = Object.values(best).reduce((sum, item) => sum + item.score, 0);
  return {
    profile: {
      ...profile,
      best,
      totalScore,
      clearedCount: Object.keys(best).length,
      lastPlayedAt: Date.now(),
    },
    improved: true,
  };
}

/* ------------------------------------------------------------------ */
/* 플레이 기록 저장                                                    */
/* ------------------------------------------------------------------ */

/**
 * 플레이 결과를 큐에 넣고 곧바로 전송을 시도한다.
 * 네트워크가 없어도 즉시 반환하므로 결과 화면이 막히지 않는다 (PRD 7.3 / AC-07).
 */
export function recordPlay(log: PlayLog, profile: StudentProfile): void {
  writeLocalProfile(profile);
  // 로컬 전용 모드에서는 보낼 곳이 없다. 큐에 쌓으면 "저장 대기 중" 배지가 영영 안 사라진다.
  if (!firebaseEnabled) return;
  const pending = readPending();
  pending.push({ localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, log, profile });
  writePending(pending);
  void flushQueue();
}

let flushing = false;

/**
 * 다시 시도해 봐야 소용없는 실패인지 판단한다.
 * 보안 규칙이 거부했거나(permission-denied) 값이 규칙 조건을 못 맞추면(invalid-argument)
 * 몇 번을 보내도 같은 결과다. 이런 항목을 큐에 남겨 두면 뒤에 쌓인 정상 기록까지
 * 영영 막히고 "저장 대기 중" 배지가 사라지지 않는다.
 */
function isPermanentFailure(error: unknown): boolean {
  const code = /code=([a-z-]+)/.exec(String(error))?.[1] ?? '';
  return code === 'permission-denied' || code === 'invalid-argument';
}

/**
 * 큐에 쌓인 기록을 순서대로 전송한다.
 * 일시적 실패는 큐에 남겨 다음 기회를 노리고, 영구 거부는 버려서 큐를 막지 않는다.
 */
export async function flushQueue(): Promise<void> {
  if (flushing || !firebaseEnabled) return;
  if (readPending().length === 0) return;
  flushing = true;
  try {
    const db = await getDb();
    if (!db) return;
    const { addDoc, collection, doc, serverTimestamp, setDoc } = await firestoreApi();

    let pending = readPending();
    while (pending.length > 0) {
      const item = pending[0];

      // 1) 플레이 로그. 규칙에 걸려 거부돼도 학생의 점수 저장까지 막지는 않는다.
      try {
        await addDoc(collection(db, 'plays'), {
          studentNo: item.log.studentNo,
          name: item.log.name,
          classId: item.log.classId,
          stageId: item.log.stageId,
          cleared: item.log.cleared,
          timeMs: item.log.timeMs,
          score: item.log.score,
          stars: item.log.stars,
          undoCount: item.log.undoCount,
          hintCount: item.log.hintCount,
          path: item.log.path,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        if (!isPermanentFailure(error)) {
          console.warn('[repository] 기록 전송 실패 — 큐에 남겨 둡니다.', error);
          return;
        }
        // 예: 규칙의 timeMs > 1000 조건에 걸린 아주 빠른 클리어.
        // 대시보드의 최단 시간 기록만 빠지고, 총점은 아래에서 계속 저장한다.
        console.warn('[repository] 플레이 로그가 규칙에 거부되어 건너뜁니다.', error);
      }

      // 2) 학생 문서(총점·최고 기록). 이쪽이 진짜 중요한 저장이다.
      try {
        await setDoc(
          doc(db, 'students', item.profile.studentNo),
          {
            studentNo: item.profile.studentNo,
            name: item.profile.name,
            classId: item.profile.classId,
            totalScore: item.profile.totalScore,
            clearedCount: item.profile.clearedCount,
            best: item.profile.best,
            lastPlayedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        if (!isPermanentFailure(error)) {
          console.warn('[repository] 기록 전송 실패 — 큐에 남겨 둡니다.', error);
          return;
        }
        console.warn('[repository] 학생 문서 저장이 규칙에 거부되어 건너뜁니다.', error);
      }

      pending = readPending().filter((p) => p.localId !== item.localId);
      writePending(pending);
    }
  } finally {
    flushing = false;
  }
}

/** 브라우저가 온라인으로 돌아오면 큐를 비운다. */
export function startQueueWatcher(): Unsubscribe {
  const handler = () => void flushQueue();
  window.addEventListener('online', handler);
  const timer = window.setInterval(handler, 30_000);
  void flushQueue();
  return () => {
    window.removeEventListener('online', handler);
    window.clearInterval(timer);
  };
}

/* ------------------------------------------------------------------ */
/* 대시보드 구독 (PRD 5.4 — 대시보드 화면에서만 활성화한다)             */
/* ------------------------------------------------------------------ */

export interface RankingRow {
  studentNo: string;
  name: string;
  classId: string;
  totalScore: number;
  clearedCount: number;
}

export interface StageTimeRow {
  studentNo: string;
  name: string;
  classId: string;
  timeMs: number;
  score: number;
  stars: number;
}

export interface FeedRow {
  id: string;
  studentNo: string;
  name: string;
  classId: string;
  stageId: string;
  createdAt: number;
}

function toRankingRow(id: string, data: Record<string, unknown>): RankingRow {
  const profile = normalizeProfile(id, data);
  return {
    studentNo: profile.studentNo,
    name: profile.name,
    classId: profile.classId,
    totalScore: profile.totalScore,
    clearedCount: profile.clearedCount,
  };
}

export function subscribeRanking(
  count: number,
  onData: (rows: RankingRow[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) {
      onData([]);
      return null;
    }
    const { collection, limit, onSnapshot, orderBy, query } = await firestoreApi();
    return onSnapshot(
      query(collection(db, 'students'), orderBy('totalScore', 'desc'), limit(count)),
      (snapshot) => onData(snapshot.docs.map((d) => toRankingRow(d.id, d.data()))),
      (error) => onError?.(error),
    );
  });
}

export function subscribeStageTimes(
  stageId: string,
  count: number,
  onData: (rows: StageTimeRow[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) {
      onData([]);
      return null;
    }
    const { collection, limit, onSnapshot, orderBy, query, where } = await firestoreApi();
    return onSnapshot(
      query(
        collection(db, 'plays'),
        where('stageId', '==', stageId),
        where('cleared', '==', true),
        orderBy('timeMs', 'asc'),
        limit(count * 4),
      ),
      (snapshot) => {
        // 같은 학생이 여러 번 클리어했으면 가장 빠른 기록만 남긴다.
        const bestByStudent = new Map<string, StageTimeRow>();
        for (const d of snapshot.docs) {
          const data = d.data();
          const row: StageTimeRow = {
            studentNo: String(data.studentNo ?? ''),
            name: String(data.name ?? ''),
            classId: String(data.classId ?? ''),
            timeMs: Number(data.timeMs ?? 0),
            score: Number(data.score ?? 0),
            stars: Number(data.stars ?? 0),
          };
          const existing = bestByStudent.get(row.studentNo);
          if (!existing || row.timeMs < existing.timeMs) bestByStudent.set(row.studentNo, row);
        }
        onData([...bestByStudent.values()].sort((a, b) => a.timeMs - b.timeMs).slice(0, count));
      },
      (error) => onError?.(error),
    );
  });
}

export function subscribeClass(
  classId: string,
  onData: (rows: RankingRow[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) {
      onData([]);
      return null;
    }
    const { collection, limit, onSnapshot, orderBy, query, where } = await firestoreApi();
    return onSnapshot(
      query(
        collection(db, 'students'),
        where('classId', '==', classId),
        orderBy('totalScore', 'desc'),
        limit(60),
      ),
      (snapshot) => onData(snapshot.docs.map((d) => toRankingRow(d.id, d.data()))),
      (error) => onError?.(error),
    );
  });
}

/** 학급별 스테이지 클리어 인원을 세기 위해 학급 학생들의 best 맵을 그대로 넘긴다. */
export function subscribeClassBest(
  classId: string,
  onData: (rows: { studentNo: string; best: Record<string, StageRecord> }[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) {
      onData([]);
      return null;
    }
    const { collection, limit, onSnapshot, query, where } = await firestoreApi();
    return onSnapshot(
      query(collection(db, 'students'), where('classId', '==', classId), limit(60)),
      (snapshot) =>
        onData(
          snapshot.docs.map((d) => ({
            studentNo: d.id,
            best: (d.data().best as Record<string, StageRecord>) ?? {},
          })),
        ),
      (error) => onError?.(error),
    );
  });
}

export function subscribeFeed(
  count: number,
  onData: (rows: FeedRow[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) {
      onData([]);
      return null;
    }
    const { collection, limit, onSnapshot, orderBy, query, where } = await firestoreApi();
    return onSnapshot(
      query(
        collection(db, 'plays'),
        where('cleared', '==', true),
        orderBy('createdAt', 'desc'),
        limit(count),
      ),
      (snapshot) =>
        onData(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              studentNo: String(data.studentNo ?? ''),
              name: String(data.name ?? ''),
              classId: String(data.classId ?? ''),
              stageId: String(data.stageId ?? ''),
              createdAt: toMillis(data.createdAt) ?? Date.now(),
            };
          }),
        ),
      (error) => onError?.(error),
    );
  });
}

/* ------------------------------------------------------------------ */
/* 교사 설정 (config/global)                                           */
/* ------------------------------------------------------------------ */

export function readLocalConfig(): GlobalConfig {
  return readJson<GlobalConfig>(STORAGE_KEYS.localConfig, DEFAULT_CONFIG);
}

function normalizeConfig(data: Record<string, unknown>): GlobalConfig {
  return {
    dashboardVisible: data.dashboardVisible !== false,
    nameMasking: data.nameMasking !== false,
    activeStages: Array.isArray(data.activeStages) ? (data.activeStages as string[]) : [],
    oddViewUnlocked: data.oddViewUnlocked === true,
    updatedAt: toMillis(data.updatedAt),
  };
}

export function subscribeConfig(onData: (config: GlobalConfig) => void): Unsubscribe {
  // 서버 응답을 기다리지 않고 마지막으로 알던 설정을 먼저 적용한다.
  onData(readLocalConfig());
  return lazySubscribe(async () => {
    const db = await getDb();
    if (!db) return null;
    const { doc, onSnapshot } = await firestoreApi();
    return onSnapshot(
      doc(db, 'config', 'global'),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const config = normalizeConfig(snapshot.data());
        writeJson(STORAGE_KEYS.localConfig, config);
        onData(config);
      },
      (error) => console.warn('[repository] 설정을 읽지 못했습니다. 기본값으로 진행합니다.', error),
    );
  });
}

/**
 * config/global 문서가 없으면 기본값으로 만든다.
 * 선생님이 콘솔에서 문서를 손으로 만들 필요가 없도록, 교사 모드가 열릴 때 한 번 호출한다.
 * (students·plays는 첫 저장 때 자동으로 생기므로 따로 만들 것이 없다.)
 */
export async function ensureConfigDoc(): Promise<{
  status: 'created' | 'exists' | 'failed';
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { status: 'failed', error: 'Firebase가 설정되지 않았습니다.' };
  try {
    const { doc, getDoc, serverTimestamp, setDoc } = await firestoreApi();
    const ref = doc(db, 'config', 'global');
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) return { status: 'exists' };
    // 보안 규칙이 허용하는 필드만 정확히 담는다.
    await setDoc(ref, {
      dashboardVisible: DEFAULT_CONFIG.dashboardVisible,
      nameMasking: DEFAULT_CONFIG.nameMasking,
      activeStages: DEFAULT_CONFIG.activeStages,
      oddViewUnlocked: DEFAULT_CONFIG.oddViewUnlocked,
      updatedAt: serverTimestamp(),
    });
    return { status: 'created' };
  } catch (error) {
    return { status: 'failed', error: String(error) };
  }
}

export async function saveConfig(config: GlobalConfig): Promise<{ ok: boolean; error?: string }> {
  writeJson(STORAGE_KEYS.localConfig, config);
  const db = await getDb();
  if (!db) return { ok: false, error: 'Firebase가 설정되지 않아 이 기기에만 저장했습니다.' };
  try {
    const { doc, serverTimestamp, setDoc } = await firestoreApi();
    await setDoc(doc(db, 'config', 'global'), {
      dashboardVisible: config.dashboardVisible,
      nameMasking: config.nameMasking,
      activeStages: config.activeStages,
      oddViewUnlocked: config.oddViewUnlocked,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `Firestore에 저장하지 못했습니다(보안 규칙 확인 필요). 이 기기에만 반영됩니다. ${String(error)}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* 교사 모드 — 전체 조회 / 삭제                                        */
/* ------------------------------------------------------------------ */

export async function listAllStudents(): Promise<StudentProfile[]> {
  const db = await getDb();
  if (!db) return [];
  const { collection, getDocs, limit, orderBy, query } = await firestoreApi();
  const snapshot = await getDocs(
    query(collection(db, 'students'), orderBy('totalScore', 'desc'), limit(500)),
  );
  return snapshot.docs.map((d) => normalizeProfile(d.id, d.data()));
}

export async function deleteStudent(studentNo: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: 'Firebase가 설정되지 않았습니다.' };
  try {
    const { deleteDoc, doc } = await firestoreApi();
    await deleteDoc(doc(db, 'students', studentNo));
    removeKey(localProfileKey(studentNo));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export const isRemoteEnabled = firebaseEnabled;
