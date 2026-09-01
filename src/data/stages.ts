import type { Stage } from '../types';
import { validateStage } from '../lib/graph';
import raw from './stages.json';

export const STAGES = raw as Stage[];

export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
);

/** 모든 스테이지가 고정 데이터다. 전부 정적 검증 대상. */
export const STATIC_STAGES = STAGES;

export const MAIN_STAGES = STAGES.filter((stage) => !stage.bonus);
const isSingleStroke = (stage: Stage) => (stage.maxStrokes ?? 1) === 1;

/** 보너스 중 한붓 회로형 (판별 미션 + 도전 회로 B01~B06). */
export const BONUS_STAGES = STAGES.filter(
  (stage) => stage.bonus && isSingleStroke(stage) && stage.tier !== 2,
);
/** 홀수점 2개 — 시작점을 찾아야 하는 도전 경로 (D01~D03). */
export const PATH_CHALLENGE_STAGES = STAGES.filter(
  (stage) => stage.bonus && isSingleStroke(stage) && stage.tier === 2,
);
/** 두붓 이상이 필요한 응용 스테이지 (C01~C04). */
export const MULTI_STROKE_STAGES = STAGES.filter((stage) => (stage.maxStrokes ?? 1) > 1);

export function getStage(id: string): Stage | undefined {
  return STAGE_BY_ID[id];
}

export function nextStageId(id: string): string | null {
  const index = STAGES.findIndex((s) => s.id === id);
  if (index < 0 || index + 1 >= STAGES.length) return null;
  return STAGES[index + 1].id;
}

/** 개발 모드에서만 스테이지 데이터를 검사해 콘솔에 알린다. 배포 빌드는 유닛테스트가 막는다. */
export function assertStageDataInDev(): void {
  if (!import.meta.env.DEV) return;
  for (const stage of STATIC_STAGES) {
    const result = validateStage(stage);
    if (!result.ok) {
      console.error(`[stages] ${stage.id} 데이터 오류:\n - ${result.problems.join('\n - ')}`);
    }
  }
}
