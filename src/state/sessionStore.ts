import { createContext, useContext } from 'react';
import type { GlobalConfig, PlayLog, Stage, StageRecord, StudentProfile } from '../types';

export interface Identity {
  studentNo: string;
  name: string;
}

export interface SessionValue {
  identity: Identity | null;
  profile: StudentProfile | null;
  config: GlobalConfig;
  uid: string | null;
  /** 저장 대기 중인 기록 수. 0보다 크면 "기록 저장 대기 중" 배지를 띄운다. */
  pending: number;
  signingIn: boolean;
  /**
   * 서버에서 기록을 아직 못 가져온 상태.
   * 이때 화면이 "총점 0점 · 클리어 0개"로 보이면 학생은 기록이 날아간 줄 안다.
   * 대신 "기록 불러오는 중"을 보여준다 (2026-09-11 사고).
   */
  profileLoading: boolean;
  /**
   * 기록을 끝내 못 불러온 채로 들어온 상태.
   * 화면을 막지는 않되(수업이 멈추면 안 된다) 총점이 실제와 다를 수 있음을 알린다.
   */
  profileStale: boolean;
  remoteEnabled: boolean;
  signIn: (studentNo: string, name: string) => Promise<void>;
  signOut: () => void;
  submitResult: (input: {
    stage: Stage;
    record: StageRecord;
    play: Omit<PlayLog, 'studentNo' | 'name' | 'classId' | 'createdAt'>;
  }) => { improved: boolean; totalScore: number };
  isUnlocked: (stageId: string) => boolean;
  isActive: (stageId: string) => boolean;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession은 SessionProvider 안에서만 쓸 수 있습니다.');
  return value;
}
