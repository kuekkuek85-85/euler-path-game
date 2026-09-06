import type { Stage } from '../types';
import { validateStage } from '../lib/graph';
import raw from './stages.json';

export const STAGES = raw as Stage[];

export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
);

/** 모든 스테이지가 고정 데이터다. 전부 정적 검증 대상. */
export const STATIC_STAGES = STAGES;

/** 대시보드·통계에서 쓰는 "전체 스테이지". 지금은 20개 전부가 본편이다. */
export const MAIN_STAGES = STAGES.filter((stage) => !stage.bonus);

/** 레벨별 묶음. 3레벨은 아직 비어 있고, 데이터를 추가하면 저절로 채워진다. */
export const STAGES_BY_LEVEL: Record<1 | 2 | 3, Stage[]> = {
  1: STAGES.filter((stage) => stage.tier === 1),
  2: STAGES.filter((stage) => stage.tier === 2),
  3: STAGES.filter((stage) => stage.tier === 3),
};

export const LEVELS = [1, 2, 3] as const;

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
