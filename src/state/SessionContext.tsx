import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalConfig, PlayLog, StudentProfile } from '../types';
import { ensureAnonymousAuth, firebaseEnabled } from '../lib/firebase';
import {
  DEFAULT_CONFIG,
  applyBest,
  ensureStudent,
  onPendingChange,
  readLocalProfile,
  recordPlay,
  startQueueWatcher,
  subscribeConfig,
  writeLocalProfile,
} from '../lib/repository';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '../lib/storage';
import { classIdOf } from '../lib/format';
import { STAGE_BY_ID } from '../data/stages';
import { type Identity, SessionContext, type SessionValue } from './sessionStore';

const savedIdentity = () => readJson<Identity | null>(STORAGE_KEYS.identity, null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(savedIdentity);
  /**
   * 첫 렌더부터 로컬 기록을 들고 있어야 한다.
   * 새로고침이나 /play/S12 직접 진입에서 잠금 판정이 한 프레임 동안
   * "아무것도 못 깬 학생"으로 보이면 스테이지 선택으로 튕겨 나간다.
   */
  const [profile, setProfile] = useState<StudentProfile | null>(() => {
    const saved = savedIdentity();
    return saved ? readLocalProfile(saved.studentNo) : null;
  });
  const [config, setConfig] = useState<GlobalConfig>(DEFAULT_CONFIG);
  const [uid, setUid] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => subscribeConfig(setConfig), []);
  useEffect(() => onPendingChange(setPending), []);
  useEffect(() => startQueueWatcher(), []);

  /** 서버와 한 번 맞춰 본 학번. 같은 학번으로 중복 동기화하지 않는다. */
  const syncedFor = useRef<string | null>(null);

  // 저장된 학번이 있으면 조용히 다시 로그인한다 (PRD 5.2 자동 입력).
  useEffect(() => {
    if (!identity) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === identity.studentNo) return;
    syncedFor.current = identity.studentNo;

    let cancelled = false;
    void (async () => {
      const authUid = await ensureAnonymousAuth();
      if (cancelled) return;
      setUid(authUid);
      const next = await ensureStudent({
        studentNo: identity.studentNo,
        name: identity.name,
        classId: classIdOf(identity.studentNo),
        uid: authUid,
      });
      if (!cancelled) setProfile(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const signIn = useCallback(async (studentNo: string, name: string) => {
    setSigningIn(true);
    try {
      const trimmed = name.trim();
      // 로컬 기록이 있으면 먼저 반영해 입장이 네트워크에 막히지 않게 한다.
      const local = readLocalProfile(studentNo);
      if (local) setProfile({ ...local, name: trimmed });
      writeJson(STORAGE_KEYS.identity, { studentNo, name: trimmed });
      // 여기서 직접 동기화하므로 자동 로그인 이펙트가 다시 돌지 않게 표시해 둔다.
      syncedFor.current = studentNo;
      setIdentity({ studentNo, name: trimmed });

      const authUid = await ensureAnonymousAuth();
      setUid(authUid);
      const next = await ensureStudent({
        studentNo,
        name: trimmed,
        classId: classIdOf(studentNo),
        uid: authUid,
      });
      setProfile(next);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    removeKey(STORAGE_KEYS.identity);
    setIdentity(null);
    setProfile(null);
  }, []);

  const submitResult = useCallback<SessionValue['submitResult']>(
    ({ stage, record, play }) => {
      const currentProfile =
        profile ??
        (identity
          ? {
              studentNo: identity.studentNo,
              name: identity.name,
              classId: classIdOf(identity.studentNo),
              totalScore: 0,
              clearedCount: 0,
              best: {},
            }
          : null);
      if (!currentProfile) return { improved: false, totalScore: 0 };

      const { profile: nextProfile, improved } = applyBest(currentProfile, stage.id, record);
      setProfile(nextProfile);
      writeLocalProfile(nextProfile);

      const log: PlayLog = {
        ...play,
        studentNo: nextProfile.studentNo,
        name: nextProfile.name,
        classId: nextProfile.classId,
        createdAt: Date.now(),
      };
      recordPlay(log, nextProfile);
      return { improved, totalScore: nextProfile.totalScore };
    },
    [identity, profile],
  );

  /** 교사가 활성 스테이지를 지정했다면 그 목록만 열린다 (PRD 5.5). */
  const isActive = useCallback(
    (stageId: string) => config.activeStages.length === 0 || config.activeStages.includes(stageId),
    [config.activeStages],
  );

  const isUnlocked = useCallback(
    (stageId: string) => {
      const stage = STAGE_BY_ID[stageId];
      if (!stage) return false;
      if (!isActive(stageId)) return false;
      if (!stage.unlockedBy) return true;
      return Boolean(profile?.best[stage.unlockedBy]);
    },
    [isActive, profile],
  );

  const value = useMemo<SessionValue>(
    () => ({
      identity,
      profile,
      config,
      uid,
      pending,
      signingIn,
      remoteEnabled: firebaseEnabled,
      signIn,
      signOut,
      submitResult,
      isUnlocked,
      isActive,
    }),
    [
      config,
      identity,
      isActive,
      isUnlocked,
      pending,
      profile,
      signIn,
      signOut,
      signingIn,
      submitResult,
      uid,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
