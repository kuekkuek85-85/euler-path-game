import { describe, expect, it } from 'vitest';
import { MAX_SCORE, MIN_SCORE, calcJudgeScore, calcScore } from './scoring';

const clean = {
  edgeCount: 8,
  parTimeSec: 50,
  elapsedMs: 30_000,
  undoCount: 0,
  hintCount: 0,
  resetCount: 0,
};

describe('calcScore (PRD 3.4)', () => {
  it('기본점수는 300 + 간선 수 × 20', () => {
    expect(calcScore(clean).base).toBe(460);
  });

  it('시간보너스는 남은 초 × 5', () => {
    expect(calcScore(clean).timeBonus).toBe(100); // (50 - 30) * 5
  });

  it('기준시간을 넘기면 시간보너스가 0이다', () => {
    expect(calcScore({ ...clean, elapsedMs: 80_000 }).timeBonus).toBe(0);
  });

  it('차감 없이 기준시간 안에 끝내면 별 3개', () => {
    const result = calcScore(clean);
    expect(result.stars).toBe(3);
    expect(result.score).toBe(560);
  });

  it('차감이 있으면 기준시간 안이라도 별 2개', () => {
    const result = calcScore({ ...clean, undoCount: 2 });
    expect(result.penalty).toBe(20);
    expect(result.stars).toBe(2);
    expect(result.score).toBe(540);
  });

  it('기준시간을 넘기면 별 1개', () => {
    expect(calcScore({ ...clean, elapsedMs: 60_000 }).stars).toBe(1);
  });

  it('되돌리기·힌트·재시작 차감을 합산한다', () => {
    const result = calcScore({ ...clean, undoCount: 3, hintCount: 2, resetCount: 1 });
    expect(result.penalty).toBe(3 * 10 + 2 * 50 + 1 * 20);
  });

  it('점수는 50 아래로 내려가지 않는다', () => {
    const result = calcScore({
      ...clean,
      elapsedMs: 300_000,
      undoCount: 100,
      hintCount: 3,
      resetCount: 10,
    });
    expect(result.score).toBe(MIN_SCORE);
  });

  it('보안 규칙 상한(2000)을 넘지 않는다', () => {
    const result = calcScore({ ...clean, edgeCount: 20, parTimeSec: 600, elapsedMs: 1000 });
    expect(result.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it('기준시간과 정확히 같으면 아직 기준시간 안이다', () => {
    expect(calcScore({ ...clean, elapsedMs: 50_000 }).stars).toBe(3);
  });
});

describe('calcJudgeScore', () => {
  it('한 번도 틀리지 않으면 300점 별 3개', () => {
    expect(calcJudgeScore(0)).toMatchObject({ score: 300, stars: 3 });
  });

  it('한 번이라도 틀리면 150점 별 1개', () => {
    expect(calcJudgeScore(1)).toMatchObject({ score: 150, stars: 1 });
    expect(calcJudgeScore(3)).toMatchObject({ score: 150, stars: 1 });
  });
});
