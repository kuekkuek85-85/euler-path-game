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
