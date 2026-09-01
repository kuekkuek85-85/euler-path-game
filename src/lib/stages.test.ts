import { describe, expect, it } from 'vitest';
import { BONUS_STAGES, MAIN_STAGES, STAGES, STATIC_STAGES } from '../data/stages';
import { eulerStatus, minStrokes, oddNodes, solve, validStartNodes, validateStage } from './graph';
import { generateCircuitStage, makeRng } from './generator';

describe('스테이지 데이터 무결성 (PRD 4.3 / AC-04)', () => {
  it('id와 order가 중복되지 않는다', () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    expect(new Set(STAGES.map((s) => s.order)).size).toBe(STAGES.length);
  });

  it('order 순으로 정렬되어 있다', () => {
    const orders = STAGES.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('unlockedBy가 앞선 스테이지를 가리킨다', () => {
    const orderById = new Map(STAGES.map((s) => [s.id, s.order]));
    for (const stage of STAGES) {
      if (!stage.unlockedBy) continue;
      expect(orderById.has(stage.unlockedBy)).toBe(true);
      expect(orderById.get(stage.unlockedBy)!).toBeLessThan(stage.order);
    }
  });

  it('본편 12스테이지 + 보너스 4스테이지로 구성된다', () => {
    expect(MAIN_STAGES).toHaveLength(12);
    // B01 판별 미션 + 고정 도전 회로 3종(B02~B04)
    expect(BONUS_STAGES).toHaveLength(4);
  });

  it('도전 회로 3종은 모두 짝수점뿐인 오일러 회로다', () => {
    for (const id of ['B02', 'B03', 'B04']) {
      const stage = STAGES.find((s) => s.id === id)!;
      expect(oddNodes(stage)).toEqual([]);
      expect(eulerStatus(stage)).toBe('circuit');
      expect(stage.edges.length).toBeGreaterThanOrEqual(12);
      expect(solve(stage)).toHaveLength(stage.edges.length);
    }
  });

  it.each(STATIC_STAGES.map((s) => [s.id, s] as const))(
    '%s — 연결성·홀수점·tier·해 존재를 모두 만족한다',
    (_id, stage) => {
      const result = validateStage(stage);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  it.each(STATIC_STAGES.filter((s) => s.type === 'DRAW').map((s) => [s.id, s] as const))(
    '%s — 허용된 모든 시작점에서 실제 해가 나온다',
    (_id, stage) => {
      const starts = validStartNodes(stage);
      expect(starts.length).toBeGreaterThan(0);
      for (const start of starts) {
        const path = solve(stage, start);
        expect(path).not.toBeNull();
        expect(path).toHaveLength(stage.edges.length);
        expect(new Set(path!).size).toBe(stage.edges.length);
      }
    },
  );

  it('S06은 짝수점 B·D에서 시작하면 해가 없다 (AC-03)', () => {
    const stage = STAGES.find((s) => s.id === 'S06')!;
    expect(oddNodes(stage)).toEqual(['A', 'C']);
    expect(solve(stage, 'B')).toBeNull();
    expect(solve(stage, 'D')).toBeNull();
    expect(solve(stage, 'A')).toHaveLength(5);
  });

  it('S08 니콜라우스의 집은 홀수점이 A·B다', () => {
    const stage = STAGES.find((s) => s.id === 'S08')!;
    expect(stage.edges).toHaveLength(8);
    expect(oddNodes(stage)).toEqual(['A', 'B']);
    expect(eulerStatus(stage)).toBe('path');
  });

  it('S11 쾨니히스베르크는 불가능하고 최소 2붓이다', () => {
    const stage = STAGES.find((s) => s.id === 'S11')!;
    expect(stage.edges).toHaveLength(7);
    expect(eulerStatus(stage)).toBe('impossible');
    expect(minStrokes(stage)).toBe(2);
    expect(stage.answer).toEqual({
      solvable: false,
      minStrokes: 2,
      oddNodes: ['N', 'I', 'S', 'E'],
    });
  });

  it('S12 육각 별은 간선 18개짜리 오일러 회로다', () => {
    const stage = STAGES.find((s) => s.id === 'S12')!;
    expect(stage.edges).toHaveLength(18);
    expect(eulerStatus(stage)).toBe('circuit');
  });

  it('B01 5개의 방 퍼즐은 홀수점 4개로 불가능하다', () => {
    const stage = STAGES.find((s) => s.id === 'B01')!;
    expect(stage.edges).toHaveLength(16);
    expect(eulerStatus(stage)).toBe('impossible');
    expect(minStrokes(stage)).toBe(2);
  });

  it('tier 1은 전부 회로, tier 2는 전부 경로다', () => {
    for (const stage of STATIC_STAGES) {
      if (stage.tier === 1) expect(eulerStatus(stage)).toBe('circuit');
      if (stage.tier === 2) expect(eulerStatus(stage)).toBe('path');
    }
  });
});

describe('B02 도전 회로 생성기', () => {
  const template = STAGES.find((s) => s.id === 'B02')!;

  it.each([1, 2, 3, 42, 1234, 98765].map((seed) => [seed] as const))(
    'seed %i — 항상 연결된 오일러 회로를 만든다',
    (seed) => {
      const stage = generateCircuitStage(template, makeRng(seed));
      expect(stage.edges.length).toBeGreaterThanOrEqual(12);
      expect(stage.edges.length).toBeLessThanOrEqual(20);
      expect(oddNodes(stage)).toEqual([]);
      expect(eulerStatus(stage)).toBe('circuit');
      expect(validateStage(stage).problems).toEqual([]);
      expect(solve(stage)).toHaveLength(stage.edges.length);
    },
  );

  it('간선 id와 노드 좌표가 유효 범위 안에 있다', () => {
    const stage = generateCircuitStage(template, makeRng(7));
    expect(new Set(stage.edges.map((e) => e.id)).size).toBe(stage.edges.length);
    for (const node of stage.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(100);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(100);
    }
  });
});
