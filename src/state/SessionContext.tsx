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

/**
 * 기록 불러오기를 이만큼 기다렸는데도 안 끝나면 학생을 들여보낸다 (2026-09-11 수업 중 사고).
 *
 * 학교 망에서 Firestore **쓰기는 되는데 읽기(getDoc)가 영영 안 끝나는** 경우가 있었다.
 * 그때 "불러오는 중" 화면으로 막아 두면 학생이 수업 내내 아무것도 못 한다.
 * 못 불러온 것보다 못 들어가는 것이 훨씬 나쁘다 — 기다리다 안 되면 열어 준다.
 */
const PROFILE_LOAD_TIMEOUT_MS = 8000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

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
  /**
   * 서버 기록을 아직 못 가져온 상태 (2026-09-11 사고).
   * 이 동안 화면을 "총점 0점 · 클리어 0개"로 그리면 학생은 기록이 날아간 줄 알고
   * 1레벨부터 다시 푼다. 실제로 그런 일이 있었다.
   */
  const [profileLoading, setProfileLoading] = useState<boolean>(() => savedIdentity() !== null);
  /** 끝내 못 불러왔다. 화면은 열어 주되 경고를 띄운다. */
  const [profileStale, setProfileStale] = useState(false);

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
    setProfileLoading(true);
    void (async () => {
      try {
        const authUid = await ensureAnonymousAuth();
        if (cancelled) return;
        setUid(authUid);
        const result = await withTimeout(
          ensureStudent({
            studentNo: identity.studentNo,
            name: identity.name,
            classId: classIdOf(identity.studentNo),
            uid: authUid,
          }),
          PROFILE_LOAD_TIMEOUT_MS,
        );
        if (cancelled) return;
        if (!result) {
          // 시간 초과. 막지 않고 들여보낸다 — 배너로 알리고 아래 재시도가 계속 붙는다.
          setProfile((current) => current ?? readLocalProfile(identity.studentNo));
          setProfileLoading(false);
          setProfileStale(true);
          return;
        }
        // 서버를 못 읽었는데 로컬 기록도 없다면, 0점짜리 프로필을 들이밀지 않는다.
        if (result.fromServer || result.profile.clearedCount > 0) setProfile(result.profile);
        setProfileLoading(false);
        setProfileStale(!result.fromServer);
      } catch (error) {
        console.warn('[session] 기록을 불러오지 못했습니다.', error);
        if (cancelled) return;
        setProfile((current) => current ?? readLocalProfile(identity.studentNo));
        setProfileLoading(false);
        setProfileStale(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  /**
   * 기록을 못 불러왔으면 계속 다시 시도한다. 교실 와이파이가 돌아오는 순간 이어진다.
   * 학생을 "다시 로그인해 보라"는 안내에 맡기지 않는다.
   */
  useEffect(() => {
    if (!identity || (!profileLoading && !profileStale)) return;
    const timer = window.setInterval(() => {
      syncedFor.current = null;
      setIdentity((current) => (current ? { ...current } : current));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [identity, profileLoading, profileStale]);

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

      setProfileLoading(true);
      setProfileStale(false);
      const authUid = await ensureAnonymousAuth();
      setUid(authUid);
      const result = await withTimeout(
        ensureStudent({
          studentNo,
          name: trimmed,
          classId: classIdOf(studentNo),
          uid: authUid,
        }),
        PROFILE_LOAD_TIMEOUT_MS,
      );
      if (!result) {
        setProfile((current) => current ?? readLocalProfile(studentNo));
        setProfileLoading(false);
        setProfileStale(true);
        return;
      }
      if (result.fromServer || result.profile.clearedCount > 0) setProfile(result.profile);
      setProfileLoading(false);
      setProfileStale(!result.fromServer);
    } catch (error) {
      console.warn('[session] 로그인 중 기록을 불러오지 못했습니다.', error);
      setProfile((current) => current ?? readLocalProfile(studentNo));
      setProfileLoading(false);
      setProfileStale(true);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    removeKey(STORAGE_KEYS.identity);
    setIdentity(null);
    setProfile(null);
    setProfileLoading(false);
    setProfileStale(false);
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
      profileLoading,
      profileStale,
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
      profileLoading,
      profileStale,
      signIn,
      signOut,
      signingIn,
      submitResult,
      uid,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
