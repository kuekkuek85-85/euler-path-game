import type { ScoreResult, Stage } from '../types';

export interface ScoreInput {
  edgeCount: number;
  parTimeSec: number;
  elapsedMs: number;
  undoCount: number;
  hintCount: number;
  resetCount: number;
}

export const MIN_SCORE = 50;
/** Firestore 보안 규칙(§6.4)이 허용하는 1회 기록 상한과 맞춘다. */
export const MAX_SCORE = 2000;

const UNDO_PENALTY = 10;
const HINT_PENALTY = 50;
const RESET_PENALTY = 20;

/**
 * PRD 3.4 점수 산식.
 *   기본점수   = 300 + (간선 수 × 20)
 *   시간보너스 = max(0, 기준시간초 - 소요시간초) × 5
 *   차감       = 되돌리기×10 + 힌트×50 + 재시작×20
 *   최종점수   = max(50, 기본 + 시간보너스 - 차감)
 * 별점: 차감 0 & 기준시간 내 = 3 / 차감 있고 기준시간 내 = 2 / 그 외 = 1
 */
export function calcScore(input: ScoreInput): ScoreResult {
  const elapsedSec = input.elapsedMs / 1000;
  const base = 300 + input.edgeCount * 20;
  const timeBonus = Math.max(0, Math.floor((input.parTimeSec - elapsedSec) * 5));
  const penalty =
    input.undoCount * UNDO_PENALTY +
    input.hintCount * HINT_PENALTY +
    input.resetCount * RESET_PENALTY;

  const raw = Math.max(MIN_SCORE, base + timeBonus - penalty);
  const score = Math.min(MAX_SCORE, raw);

  const withinPar = elapsedSec <= input.parTimeSec;
  const stars: 1 | 2 | 3 = penalty === 0 && withinPar ? 3 : withinPar ? 2 : 1;

  return { base, timeBonus, penalty, score, stars };
}

export function scoreForStage(
  stage: Stage,
  edgeCount: number,
  play: { elapsedMs: number; undoCount: number; hintCount: number; resetCount: number },
): ScoreResult {
  return calcScore({
    edgeCount,
    parTimeSec: stage.parTimeSec,
    elapsedMs: play.elapsedMs,
    undoCount: play.undoCount,
    hintCount: play.hintCount,
    resetCount: play.resetCount,
  });
}

/** JUDGE 스테이지 점수. 틀린 적 없이 맞히면 300, 한 번이라도 틀렸으면 150 (PRD 3.5). */
export function calcJudgeScore(mistakes: number): ScoreResult {
  const perfect = mistakes === 0;
  const score = perfect ? 300 : 150;
  const stars: 1 | 2 | 3 = perfect ? 3 : 1;
  return { base: score, timeBonus: 0, penalty: 0, score, stars };
}
