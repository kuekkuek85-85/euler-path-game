import type { GlobalConfig, PlayLog, StageRecord, StudentProfile } from '../types';
import { firebaseEnabled, firestoreApi, getDb } from './firebase';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from './storage';

export const DEFAULT_CONFIG: GlobalConfig = {
  dashboardVisible: true,
  // PRD 5.4는 기본 ON이었으나 2026-09-01 작성자 결정으로 OFF로 바꿨다.
  // 교사 모드에서 언제든 다시 켤 수 있다.
  nameMasking: false,
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
 * ensureStudent의 결과. `fromServer`가 false면 **서버 기록을 못 읽은 것**이고,
 * 돌려준 profile은 로컬 기록이거나 빈 값이다 — 화면은 이를 "기록 없음"이 아니라
 * "아직 못 불러옴"으로 다뤄야 한다 (2026-09-11 사고).
 */
export interface EnsureStudentResult {
  profile: StudentProfile;
  fromServer: boolean;
}

/** 교실 와이파이에서 한 번 실패했다고 포기하면 학생 기록이 통째로 안 보인다. */
const READ_RETRIES = 3;
const RETRY_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 학번으로 학생 문서를 확보한다. 이미 있으면 그 기록을 이어받고(기기 교체 대응, AC-05),
 * 없으면 0점 문서를 만든다. Firestore를 못 쓰면 localStorage 기록으로 되돌아간다.
 *
 * 2026-09-11 사고 이후로 지키는 것:
 *  - 서버를 못 읽었을 때 **빈 프로필을 로컬에 덮어쓰지 않는다.** 예전에는 읽기 실패가
 *    곧 "기록 없는 새 학생"이 되어, 기기에 남아 있던 기록까지 0으로 지워졌다.
 *  - 읽기를 몇 번 더 시도한다. 25대가 한꺼번에 접속하는 교실에서 한 번 실패는 흔하다.
 *  - 못 읽었으면 fromServer=false로 알려서, 화면이 0점짜리 새 학생처럼 그리지 않게 한다.
 */
export async function ensureStudent(input: {
  studentNo: string;
  name: string;
  classId: string;
  uid: string | null;
}): Promise<EnsureStudentResult> {
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
    // 로컬 전용 모드. 여기서는 로컬이 곧 원본이라 덮어써도 잃을 것이 없다.
    writeLocalProfile(fallback);
    return { profile: fallback, fromServer: true };
  }

  const { doc, getDoc, setDoc, serverTimestamp } = await firestoreApi();
  const ref = doc(db, 'students', input.studentNo);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= READ_RETRIES; attempt += 1) {
    try {
      const snapshot = await getDoc(ref);

      if (snapshot.exists()) {
        const remote = normalizeProfile(input.studentNo, snapshot.data());
        // 이름이 바뀌었으면 갱신하되 점수는 건드리지 않는다.
        // 이 쓰기가 실패해도 읽어 온 기록은 그대로 쓴다 — 이름 표기 때문에 기록을 잃지 않는다.
        if (remote.name !== input.name || remote.classId !== input.classId) {
          try {
            await setDoc(
              ref,
              { studentNo: input.studentNo, name: input.name, classId: input.classId },
              { merge: true },
            );
          } catch (error) {
            console.warn('[repository] 이름·반 갱신에 실패했지만 기록은 그대로 씁니다.', error);
          }
          remote.name = input.name;
          remote.classId = input.classId;
        }
        writeLocalProfile(remote);
        return { profile: remote, fromServer: true };
      }

      // 서버에 정말 없는 학생. 보안 규칙(§6.4)이 생성 시 totalScore == 0 을 요구한다.
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
      return { profile: created, fromServer: true };
    } catch (error) {
      lastError = error;
      if (attempt < READ_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  // 여기까지 왔으면 서버 기록을 못 봤다. 로컬 기록이 있으면 그것으로 진행하되,
  // **없다고 해서 빈 프로필을 로컬에 쓰지는 않는다.** 그 한 줄이 기록을 지웠다.
  console.warn('[repository] 학생 문서를 읽지 못했습니다. 기록을 덮어쓰지 않습니다.', lastError);
  return { profile: fallback, fromServer: false };
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
      const ref = doc(db, 'students', item.profile.studentNo);
      const writeProfile = () =>
        setDoc(
          ref,
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

      try {
        try {
          await writeProfile();
        } catch (error) {
          if (!isPermanentFailure(error)) throw error;
          /*
            2026-09-11 기록 손실의 진짜 원인.

            학생 문서가 아직 없으면 merge 쓰기도 Firestore가 **create로 처리**한다.
            그런데 보안 규칙의 create 조건은 `totalScore == 0`이라, 한 판이라도 깬 뒤의
            저장은 예외 없이 permission-denied가 된다. 아래 catch가 이를 "영구 실패"로
            보고 큐에서 버렸고, 그 판은 영영 사라졌다. plays 로그에는 그런 조건이 없어
            혼자만 남았다 — "로그는 있는데 점수는 없는" 학생이 그래서 생겼다.

            그러니 버리기 전에 0점 문서를 먼저 만들고 한 번 더 보낸다.
            문서가 이미 있다면 이 씨앗 쓰기는 점수를 낮추는 update라 규칙이 거부하는데,
            그게 맞다 — 남의 기록을 0으로 밀지 않는다.
          */
          await setDoc(
            ref,
            {
              studentNo: item.profile.studentNo,
              name: item.profile.name,
              classId: item.profile.classId,
              totalScore: 0,
              clearedCount: 0,
              best: {},
              createdAt: serverTimestamp(),
              lastPlayedAt: serverTimestamp(),
            },
            { merge: true },
          );
          await writeProfile();
        }
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

/* ------------------------------------------------------------------ */
/* 교사 설정 (config/global)                                           */
/* ------------------------------------------------------------------ */

export function readLocalConfig(): GlobalConfig {
  return readJson<GlobalConfig>(STORAGE_KEYS.localConfig, DEFAULT_CONFIG);
}

function normalizeConfig(data: Record<string, unknown>): GlobalConfig {
  return {
    dashboardVisible: data.dashboardVisible !== false,
    // 필드가 없으면 마스킹하지 않는다(기본값 OFF와 일치).
    nameMasking: data.nameMasking === true,
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
