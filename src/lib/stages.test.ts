import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAIN_STAGES,
  STAGES,
  STAGES_BY_LEVEL,
  STATIC_STAGES,
  nextStage,
} from '../data/stages';
import type { Stage, StageLevel } from '../types';
import {
  eulerStatus,
  minStrokes,
  oddNodes,
  solve,
  solveInStrokes,
  validStartNodes,
  validateStage,
} from './graph';
import { generateCircuitStage, makeRng } from './generator';

/**
 * 작성자가 준 이미지(Level N-M)를 옮긴 결과의 대조표.
 *
 * 손으로 옮긴 좌표·간선이라 오타 하나면 "못 푸는 미션"이 배포된다. 그래서 도형마다
 * 점·선 개수와 홀수점 개수를 여기에 못 박아 둔다. tier(레벨)는 이제 난이도 구분일 뿐
 * 홀수점 개수와 묶이지 않으므로, 그 검사를 graph.ts 대신 이 표가 맡는다.
 */
const EXPECTED: Array<[id: string, level: StageLevel, nodes: number, edges: number, odd: number]> = [
  ['L1-01', 1, 3, 3, 0],
  ['L1-02', 1, 8, 8, 0],
  ['L1-03', 1, 5, 7, 2],
  ['L1-04', 1, 5, 7, 2],
  ['L1-05', 1, 5, 6, 0],
  ['L1-06', 1, 5, 5, 0],
  ['L1-07', 1, 5, 8, 2],
  ['L1-08', 1, 8, 12, 0],
  ['L1-09', 1, 6, 9, 2],
  ['L1-10', 1, 7, 11, 2],
  ['L2-01', 2, 7, 10, 2],
  ['L2-02', 2, 5, 6, 2],
  ['L2-03', 2, 7, 10, 2],
  ['L2-04', 2, 6, 9, 2],
  ['L2-05', 2, 7, 14, 2],
  ['L2-06', 2, 6, 10, 2],
  ['L2-07', 2, 10, 13, 2],
  ['L2-08', 2, 10, 12, 2],
  ['L2-09', 2, 7, 12, 0],
  ['L2-10', 2, 10, 17, 2],
  ['L3-01', 3, 9, 15, 2],
  ['L3-02', 3, 11, 15, 2],
  ['L3-03', 3, 11, 14, 0],
  ['L3-04', 3, 9, 15, 0],
  ['L3-05', 3, 6, 10, 2],
  ['L3-06', 3, 7, 10, 2],
  ['L3-07', 3, 9, 13, 2],
  ['L3-08', 3, 7, 10, 0],
  ['L3-09', 3, 8, 10, 0],
  ['L3-10', 3, 9, 16, 2],
  ['L4-01', 4, 12, 18, 0],
  ['L4-02', 4, 7, 10, 0],
  ['L4-03', 4, 8, 13, 2],
  ['L4-04', 4, 7, 11, 2],
  ['L4-05', 4, 10, 11, 2],
  ['L4-06', 4, 8, 14, 2],
  ['L4-07', 4, 8, 12, 2],
  ['L4-08', 4, 13, 18, 2],
  ['L4-09', 4, 16, 28, 0],
  ['L4-10', 4, 16, 25, 2],
  ['L5-01', 5, 10, 18, 0],
  ['L5-02', 5, 9, 13, 0],
  ['L5-03', 5, 8, 11, 2],
  ['L5-04', 5, 8, 14, 0],
  ['L5-05', 5, 12, 20, 0],
  ['L5-06', 5, 12, 21, 2],
  ['L5-07', 5, 12, 15, 2],
  ['L5-08', 5, 8, 14, 2],
  ['L5-09', 5, 11, 20, 2],
  ['L5-10', 5, 14, 21, 2],
  ['L6-01', 6, 10, 15, 2],
  ['L6-02', 6, 14, 15, 2],
  ['L6-03', 6, 14, 22, 2],
  ['L6-04', 6, 11, 16, 0],
  ['L6-05', 6, 7, 15, 2],
  ['L6-06', 6, 13, 24, 0],
  ['L6-07', 6, 11, 20, 2],
  ['L6-08', 6, 8, 11, 2],
  ['L6-09', 6, 12, 18, 2],
  ['L6-10', 6, 18, 20, 0],
];

describe('스테이지 데이터 무결성 (PRD 4.3 / AC-04)', () => {
  it('id와 order가 중복되지 않는다', () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    expect(new Set(STAGES.map((s) => s.order)).size).toBe(STAGES.length);
  });

  it('order 순으로 정렬되어 있다', () => {
    const orders = STAGES.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('unlockedBy가 바로 앞 스테이지를 가리킨다 — 첫 스테이지만 열려 있다', () => {
    STAGES.forEach((stage, index) => {
      if (index === 0) {
        expect(stage.unlockedBy).toBeNull();
        return;
      }
      expect(stage.unlockedBy).toBe(STAGES[index - 1].id);
    });
  });

  it('레벨별 구성이 대조표와 일치한다', () => {
    expect(STAGES).toHaveLength(EXPECTED.length);
    expect(MAIN_STAGES).toHaveLength(EXPECTED.length);
    for (const level of LEVELS) {
      expect(STAGES_BY_LEVEL[level].map((s) => s.id)).toEqual(
        EXPECTED.filter(([, lv]) => lv === level).map(([id]) => id),
      );
    }
    expect(LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('모두 DRAW 한붓 스테이지다 — 판별·두붓 미션은 뒤로 미뤘다', () => {
    for (const stage of STAGES) {
      expect(stage.type).toBe('DRAW');
      expect(stage.maxStrokes ?? 1).toBe(1);
      expect(stage.bonus ?? false).toBe(false);
    }
    expect(STAGES.filter((s) => (s.maxStrokes ?? 1) > 1)).toEqual([]);
  });

  it.each(EXPECTED)(
    '%s — 이미지대로 점 %i개 · 선 %i개 · 홀수점 %i개다',
    (id, level, nodeCount, edgeCount, oddCount) => {
      const stage = STAGES.find((s) => s.id === id) as Stage;
      expect(stage).toBeDefined();
      expect(stage.tier).toBe(level);
      expect(stage.nodes).toHaveLength(nodeCount);
      expect(stage.edges).toHaveLength(edgeCount);
      expect(oddNodes(stage)).toHaveLength(oddCount);
      expect(eulerStatus(stage)).toBe(oddCount === 0 ? 'circuit' : 'path');
      expect(minStrokes(stage)).toBe(1);
    },
  );

  it.each(STATIC_STAGES.map((s) => [s.id, s] as const))(
    '%s — 연결성·홀수점·해 존재를 모두 만족한다',
    (_id, stage) => {
      const result = validateStage(stage);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  it.each(STATIC_STAGES.map((s) => [s.id, s] as const))(
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

  it.each(EXPECTED.filter(([, , , , odd]) => odd === 2).map(([id]) => [id] as const))(
    '%s — 홀수점 2개에서만 풀리고 나머지 점에서는 반드시 막힌다',
    (id) => {
      const stage = STAGES.find((s) => s.id === id) as Stage;
      const starts = validStartNodes(stage);
      expect(starts).toEqual(oddNodes(stage));
      expect(starts).toHaveLength(2);
      for (const node of stage.nodes) {
        const path = solve(stage, node.id);
        if (starts.includes(node.id)) expect(path).toHaveLength(stage.edges.length);
        else expect(path).toBeNull();
      }
    },
  );

  it.each(EXPECTED.filter(([, , , , odd]) => odd === 0).map(([id]) => [id] as const))(
    '%s — 홀수점이 없어 어느 점에서 시작해도 풀린다',
    (id) => {
      const stage = STAGES.find((s) => s.id === id) as Stage;
      expect(validStartNodes(stage).sort()).toEqual(stage.nodes.map((n) => n.id).sort());
      for (const node of stage.nodes) {
        expect(solve(stage, node.id)).toHaveLength(stage.edges.length);
      }
    },
  );

  it('1·2레벨은 뒤로 갈수록 선이 늘어난다', () => {
    for (const level of [1, 2] as const) {
      const counts = STAGES_BY_LEVEL[level].map((s) => s.edges.length);
      expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
    }
    expect(STAGES_BY_LEVEL[2].at(-1)!.edges.length).toBeGreaterThan(
      STAGES_BY_LEVEL[1].at(-1)!.edges.length,
    );
  });

  /** 한 레벨은 미션 10개. 1~6레벨 60개가 전부이고 7레벨은 없다. */
  const LEVEL_SIZE = 10;

  it('레벨끼리 평균 선 개수가 단조 증가한다', () => {
    const avg = (list: Stage[]) =>
      list.reduce((sum, s) => sum + s.edges.length, 0) / list.length;
    // 이미지 순서를 그대로 지키므로 레벨 안에서는 들쭉날쭉하다. 레벨끼리의 평균만 본다.
    const averages = LEVELS.map((level) => avg(STAGES_BY_LEVEL[level]));
    expect(averages).toEqual([...averages].sort((a, b) => a - b));
  });

  it('여섯 레벨이 10개씩 빠짐없이 차 있다 — 이게 전부다', () => {
    expect(LEVELS.map((level) => STAGES_BY_LEVEL[level].length)).toEqual(
      LEVELS.map(() => LEVEL_SIZE),
    );
    expect(STAGES).toHaveLength(LEVELS.length * LEVEL_SIZE);
  });

  it('nextStage — 같은 학번으로 다시 들어와도 이어서 할 곳을 찾는다', () => {
    // 기록이 없으면 맨 처음
    expect(nextStage(undefined)?.id).toBe(STAGES[0].id);
    expect(nextStage({})?.id).toBe(STAGES[0].id);

    // 앞에서부터 세 개를 깼으면 네 번째
    const best: Record<string, unknown> = {};
    for (const stage of STAGES.slice(0, 3)) best[stage.id] = { score: 1, timeMs: 1, stars: 1 };
    expect(nextStage(best)?.id).toBe(STAGES[3].id);

    // 중간에 구멍이 있으면 그 구멍이 먼저다 (사슬이 끊긴 기록을 안전하게 다룬다)
    const holed: Record<string, unknown> = {};
    for (const stage of STAGES.slice(0, 5)) holed[stage.id] = { score: 1, timeMs: 1, stars: 1 };
    delete holed[STAGES[2].id];
    expect(nextStage(holed)?.id).toBe(STAGES[2].id);

    // 전부 깼으면 null
    const all: Record<string, unknown> = {};
    for (const stage of STAGES) all[stage.id] = { score: 1, timeMs: 1, stars: 1 };
    expect(nextStage(all)).toBeNull();
  });

  it('좌표가 캔버스 안에 있고, 점끼리 충분히 떨어져 있다 (PRD 5.3 히트 영역)', () => {
    for (const stage of STAGES) {
      for (const node of stage.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(5);
        expect(node.x).toBeLessThanOrEqual(95);
        expect(node.y).toBeGreaterThanOrEqual(5);
        expect(node.y).toBeLessThanOrEqual(95);
      }
      for (let i = 0; i < stage.nodes.length; i += 1) {
        for (let j = i + 1; j < stage.nodes.length; j += 1) {
          const a = stage.nodes[i];
          const b = stage.nodes[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          // 캔버스 폭 362px 기준 12 viewBox 단위 ≈ 43px. 손가락 하나가 두 점을
          // 동시에 덮지 않을 최소치다.
          expect(gap, `${stage.id} ${a.id}-${b.id}`).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  /**
   * 그림이 데이터와 다르게 보이는 사고를 잡는다.
   *
   * L4-02에서 실제로 났던 일: 긴 대각선 두 개의 교차점이 하필 어느 점의 자리라
   * 교차점이 점 안에 완전히 묻혔다. 데이터상 그 점은 V의 꼭짓점(차수 2)인데
   * 화면에서는 "네 갈래가 만나는 점"으로 보였다. 연결성·홀수점 검사로는 절대
   * 잡히지 않는 종류의 오류라서 기하로 따로 본다.
   */
  describe('그림과 데이터가 어긋나 보이지 않는다', () => {
    /** GameCanvas의 점 반지름. 이 안으로 선이 들어오면 붙은 것처럼 보인다. */
    const NODE_R = 3.2;

    const distToSegment = (
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };

    /** 두 선분이 실제로 교차하면 그 점, 아니면 null. 끝점끼리 만나는 것은 제외한다. */
    const crossing = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      c: { x: number; y: number },
      d: { x: number; y: number },
    ) => {
      const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
      if (Math.abs(den) < 1e-9) return null;
      const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
      const u = ((a.x - c.x) * (a.y - b.y) - (a.y - c.y) * (a.x - b.x)) / den;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    };

    it.each(STAGES.map((s) => [s.id, s] as const))(
      '%s — 간선이 무관한 점을 관통하지 않는다',
      (_id, stage) => {
        const pos = Object.fromEntries(stage.nodes.map((n) => [n.id, n]));
        for (const edge of stage.edges) {
          for (const node of stage.nodes) {
            if (node.id === edge.from || node.id === edge.to) continue;
            const gap = distToSegment(node, pos[edge.from], pos[edge.to]);
            expect(gap, `${stage.id} ${edge.from}-${edge.to} 이 ${node.id} 를 지난다`).toBeGreaterThan(
              NODE_R,
            );
          }
        }
      },
    );

    it.each(STAGES.map((s) => [s.id, s] as const))(
      '%s — 간선 교차점이 점 안에 묻히지 않는다',
      (_id, stage) => {
        const pos = Object.fromEntries(stage.nodes.map((n) => [n.id, n]));
        for (let i = 0; i < stage.edges.length; i += 1) {
          for (let j = i + 1; j < stage.edges.length; j += 1) {
            const e1 = stage.edges[i];
            const e2 = stage.edges[j];
            // 점을 공유하는 두 간선은 거기서 만나는 게 정상이다
            if ([e2.from, e2.to].includes(e1.from) || [e2.from, e2.to].includes(e1.to)) continue;
            const point = crossing(pos[e1.from], pos[e1.to], pos[e2.from], pos[e2.to]);
            if (!point) continue;
            for (const node of stage.nodes) {
              const gap = Math.hypot(point.x - node.x, point.y - node.y);
              expect(
                gap,
                `${stage.id} ${e1.from}-${e1.to} × ${e2.from}-${e2.to} 교차점이 ${node.id} 안에 있다`,
              ).toBeGreaterThan(NODE_R);
            }
          }
        }
      },
    );
  });

  it('간선이 같은 점을 잇거나 중복되지 않는다', () => {
    for (const stage of STAGES) {
      const nodeIds = new Set(stage.nodes.map((n) => n.id));
      const seen = new Set<string>();
      for (const edge of stage.edges) {
        expect(nodeIds.has(edge.from), `${stage.id} ${edge.id}.from`).toBe(true);
        expect(nodeIds.has(edge.to), `${stage.id} ${edge.id}.to`).toBe(true);
        expect(edge.from).not.toBe(edge.to);
        const key = [edge.from, edge.to].sort().join('-');
        // 같은 두 점을 잇는 선이 둘 이상이면 curve로 구분해야 한다 (지금은 없다)
        expect(seen.has(key), `${stage.id} 중복 간선 ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('기준 시간이 선 개수에 맞게 커진다', () => {
    for (const stage of STAGES) {
      expect(stage.parTimeSec).toBeGreaterThanOrEqual(stage.edges.length * 2);
      expect(stage.parTimeSec).toBeLessThanOrEqual(stage.edges.length * 6);
    }
  });

  it('두붓 이상 스테이지는 없지만, 있을 경우의 검사는 살아 있다', () => {
    const multi = STATIC_STAGES.filter((s) => (s.maxStrokes ?? 1) > 1);
    for (const stage of multi) {
      const strokes = solveInStrokes(stage);
      expect(strokes).toHaveLength(stage.maxStrokes!);
    }
    expect(multi).toHaveLength(0);
  });
});

describe('도형 생성기 (3레벨 도형을 뽑을 때 쓰는 설계용 도구)', () => {
  /** 생성기는 좌표·par만 참고하므로 스테이지 데이터에 기대지 않는 최소 템플릿을 쓴다. */
  const template: Stage = {
    id: 'TMPL',
    order: 0,
    tier: 3,
    name: '생성기 템플릿',
    type: 'DRAW',
    parTimeSec: 60,
    nodes: [],
    edges: [],
  };

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
