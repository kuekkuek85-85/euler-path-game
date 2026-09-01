import type { Stage } from '../types';
import { validateStage } from '../lib/graph';
import raw from './stages.json';

export const STAGES = raw as Stage[];

export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
);

/** B02처럼 매번 새로 생성되는 스테이지는 정적 검증 대상이 아니다. */
export const STATIC_STAGES = STAGES.filter((stage) => !stage.generated);

export const MAIN_STAGES = STAGES.filter((stage) => !stage.bonus);
export const BONUS_STAGES = STAGES.filter((stage) => stage.bonus);

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
