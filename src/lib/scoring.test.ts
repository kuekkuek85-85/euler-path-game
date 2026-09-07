import { describe, expect, it } from 'vitest';
import {
  HINT_PENALTIES,
  MAX_SCORE,
  MIN_SCORE,
  calcJudgeScore,
  calcScore,
  hintPenalty,
} from './scoring';

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
    expect(result.penalty).toBe(3 * 10 + (20 + 40) + 1 * 20);
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

describe('힌트 감점 (2026-09-07 3단계 힌트)', () => {
  it('단계가 올라갈수록 감점이 커진다', () => {
    expect([...HINT_PENALTIES]).toEqual([20, 40, 80]);
    expect(HINT_PENALTIES[0]).toBeLessThan(HINT_PENALTIES[1]);
    expect(HINT_PENALTIES[1]).toBeLessThan(HINT_PENALTIES[2]);
  });

  it('누적 감점은 받은 단계까지의 합이다', () => {
    expect(hintPenalty(0)).toBe(0);
    expect(hintPenalty(1)).toBe(20);
    expect(hintPenalty(2)).toBe(60);
    expect(hintPenalty(3)).toBe(140);
  });

  it('한 번도 안 받으면 별 3개를 지킬 수 있다', () => {
    expect(calcScore({ ...clean, hintCount: 0 }).stars).toBe(3);
    expect(calcScore({ ...clean, hintCount: 1 }).stars).toBe(2);
  });

  it('음수나 소수가 들어와도 깨지지 않는다', () => {
    expect(hintPenalty(-1)).toBe(0);
    expect(hintPenalty(1.9)).toBe(20);
  });

  it('3단계를 넘겨도 마지막 값으로 이어 계산한다', () => {
    expect(hintPenalty(4)).toBe(140 + 80);
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
