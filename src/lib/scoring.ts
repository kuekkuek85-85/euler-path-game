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
const RESET_PENALTY = 20;

/**
 * 힌트 단계별 감점 (2026-09-07 작성자 요청).
 * 단계가 올라갈수록 시작점을 더 좁혀서 알려주므로 감점도 커진다.
 * 학생이 누르기 전에 버튼에서 다음 단계의 값을 미리 볼 수 있게 해 두었다.
 */
export const HINT_PENALTIES = [20, 40, 80] as const;

/** 힌트를 hintCount번 받았을 때의 누적 감점. 단계를 넘어가면 마지막 값이 이어진다. */
export function hintPenalty(hintCount: number): number {
  let sum = 0;
  for (let i = 0; i < Math.max(0, Math.trunc(hintCount)); i += 1) {
    sum += HINT_PENALTIES[Math.min(i, HINT_PENALTIES.length - 1)];
  }
  return sum;
}

/**
 * PRD 3.4 점수 산식.
 *   기본점수   = 300 + (간선 수 × 20)
 *   시간보너스 = max(0, 기준시간초 - 소요시간초) × 5
 *   차감       = 되돌리기×10 + 힌트(20/40/80 누적) + 재시작×20
 *   최종점수   = max(50, 기본 + 시간보너스 - 차감)
 * 별점: 차감 0 & 기준시간 내 = 3 / 차감 있고 기준시간 내 = 2 / 그 외 = 1
 *
 * "재시작"에는 붓을 떼서 실패했을 때의 자동 되돌리기도 들어간다 — 실패할 때마다
 * 20점씩 깎이는 셈이다 (Play.tsx의 broken 처리가 engine.reset을 부른다).
 */
export function calcScore(input: ScoreInput): ScoreResult {
  const elapsedSec = input.elapsedMs / 1000;
  const base = 300 + input.edgeCount * 20;
  const timeBonus = Math.max(0, Math.floor((input.parTimeSec - elapsedSec) * 5));
  const penalty =
    input.undoCount * UNDO_PENALTY +
    hintPenalty(input.hintCount) +
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
