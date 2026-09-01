export type StageType = 'DRAW' | 'JUDGE';

/** 스테이지 뒤에 깔리는 장식 레이어 식별자 (PRD 4.2 S11 / B01). */
export type StageDecor = 'konigsberg' | 'fiveRooms';

export interface StageNode {
  id: string;
  /** viewBox "0 0 100 100" 기준 좌표. */
  x: number;
  y: number;
  /** 판별 미션 해설 등에 쓰는 표시용 이름. */
  label?: string;
}

export interface StageEdge {
  id: string;
  from: string;
  to: string;
  /**
   * 다중 간선 렌더링용 곡률. 0이면 직선.
   * 간선의 중점을 기준으로 진행 방향의 수직으로 밀어낸 거리(viewBox 단위).
   */
  curve?: number;
}

export interface JudgeAnswer {
  solvable: boolean;
  minStrokes: number;
  oddNodes: string[];
}

export interface Stage {
  id: string;
  order: number;
  /** 1 = 홀수점 0개, 2 = 홀수점 2개, 3 = 복합·판별 */
  tier: 1 | 2 | 3;
  name: string;
  type: StageType;
  parTimeSec: number;
  nodes: StageNode[];
  edges: StageEdge[];
  hintText?: string;
  clearMessage?: string;
  /** 이 스테이지를 여는 선행 스테이지 id. 없으면 처음부터 열려 있다. */
  unlockedBy?: string | null;
  /** true면 스테이지 선택 화면의 보너스 구역에 배치한다. */
  bonus?: boolean;
  decor?: StageDecor;
  /** JUDGE 타입 전용. */
  answer?: JudgeAnswer;
  /** JUDGE 정답 후 보여주는 해설. */
  explanation?: string;
  /** B02처럼 매번 새로 생성되는 스테이지. */
  generated?: boolean;
}

export interface StageRecord {
  score: number;
  timeMs: number;
  stars: number;
}

export interface StudentProfile {
  studentNo: string;
  name: string;
  classId: string;
  uid?: string;
  totalScore: number;
  clearedCount: number;
  best: Record<string, StageRecord>;
  createdAt?: number;
  lastPlayedAt?: number;
}

export interface PlayLog {
  studentNo: string;
  name: string;
  classId: string;
  stageId: string;
  cleared: boolean;
  timeMs: number;
  score: number;
  stars: number;
  undoCount: number;
  hintCount: number;
  /** 통과한 edge id 순서 — 검증·재생용 */
  path: string[];
  createdAt: number;
}

export interface GlobalConfig {
  dashboardVisible: boolean;
  nameMasking: boolean;
  /** 비어 있으면 "전부 활성"으로 해석한다. */
  activeStages: string[];
  /**
   * 홀수점 보기 토글을 1·2단계에서도 열어 줄지 (PRD 3.3).
   * 수업 흐름상 "정리 1 — 홀수점 개념 설명" 직후 교사가 켠다.
   * PRD 6.1 스키마에 없던 필드라 기본값 false로 두고 하위 호환을 지킨다.
   */
  oddViewUnlocked: boolean;
  updatedAt?: number;
}

export type GameStatus = 'ready' | 'playing' | 'stuck' | 'cleared';

export interface GameState {
  stageId: string;
  currentNode: string | null;
  /** 통과 순서대로 쌓이는 edge id */
  usedEdges: string[];
  startedAt: number;
  undoCount: number;
  hintCount: number;
  resetCount: number;
  status: GameStatus;
}

export interface ScoreResult {
  base: number;
  timeBonus: number;
  penalty: number;
  score: number;
  stars: 1 | 2 | 3;
}
