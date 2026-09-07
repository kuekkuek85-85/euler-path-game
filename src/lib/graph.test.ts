import { describe, expect, it } from 'vitest';
import type { GraphLike } from './graph';
import {
  availableEdges,
  degreeMap,
  eulerStatus,
  HINT_LEVELS,
  hasEulerTrailFrom,
  hintEdges,
  isConnected,
  isolatedNodes,
  minStrokes,
  oddNodes,
  remainingGraph,
  solve,
  startHintCandidates,
  validStartNodes,
} from './graph';

function graph(nodeIds: string[], pairs: [string, string][]): GraphLike {
  return {
    nodes: nodeIds.map((id, i) => ({ id, x: i * 10, y: i * 10 })),
    edges: pairs.map(([from, to], i) => ({ id: `e${i + 1}`, from, to })),
  };
}

const triangle = graph(['A', 'B', 'C'], [
  ['A', 'B'],
  ['B', 'C'],
  ['C', 'A'],
]);

// 홀수점 2개 (A, C)
const squareWithDiagonal = graph(['A', 'B', 'C', 'D'], [
  ['A', 'B'],
  ['B', 'C'],
  ['C', 'D'],
  ['D', 'A'],
  ['A', 'C'],
]);

// 쾨니히스베르크: 홀수점 4개
const konigsberg = graph(['N', 'I', 'S', 'E'], [
  ['N', 'I'],
  ['N', 'I'],
  ['S', 'I'],
  ['S', 'I'],
  ['N', 'E'],
  ['S', 'E'],
  ['I', 'E'],
]);

describe('degreeMap', () => {
  it('각 노드의 차수를 센다', () => {
    expect(Object.fromEntries(degreeMap(triangle))).toEqual({ A: 2, B: 2, C: 2 });
  });

  it('다중 간선을 각각 센다', () => {
    expect(Object.fromEntries(degreeMap(konigsberg))).toEqual({ N: 3, I: 5, S: 3, E: 3 });
  });
});

describe('oddNodes', () => {
  it('홀수 차수 노드만 노드 선언 순서대로 돌려준다', () => {
    expect(oddNodes(triangle)).toEqual([]);
    expect(oddNodes(squareWithDiagonal)).toEqual(['A', 'C']);
    expect(oddNodes(konigsberg)).toEqual(['N', 'I', 'S', 'E']);
  });
});

describe('isConnected', () => {
  it('한 덩어리면 참', () => {
    expect(isConnected(squareWithDiagonal)).toBe(true);
  });

  it('두 덩어리로 끊겨 있으면 거짓', () => {
    const split = graph(['A', 'B', 'C', 'D'], [
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(isConnected(split)).toBe(false);
  });

  it('간선이 붙지 않은 외톨이 노드는 연결성 판단에서 제외한다', () => {
    const withIsolated = graph(['A', 'B', 'C', 'Z'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ]);
    expect(isConnected(withIsolated)).toBe(true);
    expect(isolatedNodes(withIsolated)).toEqual(['Z']);
  });

  it('간선이 없으면 참', () => {
    expect(isConnected(graph(['A'], []))).toBe(true);
  });
});

describe('eulerStatus', () => {
  it('홀수점 0개는 circuit', () => {
    expect(eulerStatus(triangle)).toBe('circuit');
  });

  it('홀수점 2개는 path', () => {
    expect(eulerStatus(squareWithDiagonal)).toBe('path');
  });

  it('홀수점 4개는 impossible', () => {
    expect(eulerStatus(konigsberg)).toBe('impossible');
  });

  it('홀수점 조건을 만족해도 끊겨 있으면 impossible', () => {
    const twoTriangles = graph(['A', 'B', 'C', 'D', 'E', 'F'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
      ['D', 'E'],
      ['E', 'F'],
      ['F', 'D'],
    ]);
    expect(oddNodes(twoTriangles)).toEqual([]);
    expect(eulerStatus(twoTriangles)).toBe('impossible');
  });
});

describe('minStrokes', () => {
  it('홀수점이 없으면 1', () => {
    expect(minStrokes(triangle)).toBe(1);
  });

  it('홀수점 2개면 1', () => {
    expect(minStrokes(squareWithDiagonal)).toBe(1);
  });

  it('홀수점 4개면 2', () => {
    expect(minStrokes(konigsberg)).toBe(2);
  });
});

describe('validStartNodes', () => {
  it('회로는 차수가 있는 모든 노드에서 시작할 수 있다', () => {
    expect(validStartNodes(triangle)).toEqual(['A', 'B', 'C']);
  });

  it('경로는 두 홀수점에서만 시작할 수 있다', () => {
    expect(validStartNodes(squareWithDiagonal)).toEqual(['A', 'C']);
  });

  it('불가능한 도형은 시작점이 없다', () => {
    expect(validStartNodes(konigsberg)).toEqual([]);
  });
});

describe('solve (Hierholzer)', () => {
  it('회로에서 모든 간선을 한 번씩 쓰는 순서를 찾는다', () => {
    const path = solve(triangle, 'A');
    expect(path).not.toBeNull();
    expect(new Set(path!)).toEqual(new Set(['e1', 'e2', 'e3']));
  });

  it('찾은 경로는 실제로 이어져 있다', () => {
    const path = solve(squareWithDiagonal, 'A')!;
    expect(path).toHaveLength(5);
    let current = 'A';
    for (const edgeId of path) {
      const edge = squareWithDiagonal.edges.find((e) => e.id === edgeId)!;
      expect([edge.from, edge.to]).toContain(current);
      current = edge.from === current ? edge.to : edge.from;
    }
    expect(current).toBe('C'); // 다른 홀수점에서 끝난다
  });

  it('경로형 도형을 짝수점에서 시작하면 해가 없다', () => {
    expect(solve(squareWithDiagonal, 'B')).toBeNull();
    expect(solve(squareWithDiagonal, 'D')).toBeNull();
  });

  it('홀수점이 4개면 해가 없다', () => {
    expect(solve(konigsberg)).toBeNull();
    expect(solve(konigsberg, 'I')).toBeNull();
  });

  it('끊어진 그래프는 해가 없다', () => {
    const split = graph(['A', 'B', 'C', 'D'], [
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(solve(split)).toBeNull();
  });

  it('다중 간선을 각각 별개로 지난다', () => {
    const doubled = graph(['A', 'B'], [
      ['A', 'B'],
      ['A', 'B'],
    ]);
    expect(solve(doubled, 'A')).toHaveLength(2);
  });

  it('간선이 없으면 빈 경로', () => {
    expect(solve(graph(['A'], []))).toEqual([]);
  });
});

describe('진행 중 상태 판정', () => {
  it('남은 간선만 남긴 부분 그래프를 만든다', () => {
    const rest = remainingGraph(squareWithDiagonal, ['e1', 'e2']);
    expect(rest.edges.map((e) => e.id)).toEqual(['e3', 'e4', 'e5']);
  });

  it('현재 점에서 아직 지날 수 있는 간선을 고른다', () => {
    expect(availableEdges(squareWithDiagonal, 'A', ['e1']).map((i) => i.edgeId)).toEqual([
      'e4',
      'e5',
    ]);
  });

  it('막힌 상태를 hasEulerTrailFrom으로 알아낸다', () => {
    // B에서 출발하면(짝수점) 남은 도형을 다 지날 수 없다
    expect(hasEulerTrailFrom(squareWithDiagonal, 'B')).toBe(false);
    expect(hasEulerTrailFrom(squareWithDiagonal, 'A')).toBe(true);
  });

  it('힌트는 클리어 가능성이 남는 간선만 고른다', () => {
    // 삼각형 둘 + 다리 하나. C에서 다리(e4)를 먼저 건너면 왼쪽 삼각형이 고립돼 실패한다.
    const dumbbell = graph(['A', 'B', 'C', 'D', 'E', 'F'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
      ['C', 'D'],
      ['D', 'E'],
      ['E', 'F'],
      ['F', 'D'],
    ]);
    expect(oddNodes(dumbbell)).toEqual(['C', 'D']);
    const hints = hintEdges(dumbbell, 'C', []);
    expect(hints.map((h) => h.edgeId).sort()).toEqual(['e2', 'e3']);
  });

  it('이미 실패한 상태에서는 갈 수 있는 간선을 모두 알려준다', () => {
    const hints = hintEdges(squareWithDiagonal, 'B', []);
    expect(hints.map((h) => h.edgeId).sort()).toEqual(['e1', 'e2']);
  });
});

describe('startHintCandidates — 3단계 시작점 힌트', () => {
  // 홀수점 2개(A, D)인 경로형. 점 4개.
  const pathGraph = graph(['A', 'B', 'C', 'D'], [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'A'],
    ['C', 'D'],
  ]);
  // 홀수점 0개인 회로형. 점 6개.
  const circuitGraph = graph(['A', 'B', 'C', 'D', 'E', 'F'], [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'E'],
    ['E', 'F'],
    ['F', 'A'],
  ]);

  it('단계가 올라갈수록 후보가 줄어든다', () => {
    const sizes = [1, 2, 3].map((lv) => startHintCandidates(circuitGraph, lv).length);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    expect(sizes[2]).toBe(2);
  });

  it('좁아질 뿐 후보가 밖으로 밀려나지 않는다 (3단계 ⊆ 2단계 ⊆ 1단계)', () => {
    for (const g of [pathGraph, circuitGraph]) {
      const [l1, l2, l3] = [1, 2, 3].map((lv) => startHintCandidates(g, lv));
      expect(l2.every((id) => l1.includes(id))).toBe(true);
      expect(l3.every((id) => l2.includes(id))).toBe(true);
    }
  });

  it('어느 단계든 진짜 시작점을 담고 있다', () => {
    for (const g of [pathGraph, circuitGraph]) {
      const valid = validStartNodes(g);
      for (let lv = 1; lv <= HINT_LEVELS; lv += 1) {
        expect(startHintCandidates(g, lv).some((id) => valid.includes(id))).toBe(true);
      }
    }
  });

  it('홀수점이 2개인 도형의 3단계는 정확히 그 두 홀수점이다', () => {
    expect(startHintCandidates(pathGraph, 3).sort()).toEqual(oddNodes(pathGraph).sort());
  });

  it('같은 스테이지·같은 단계면 언제나 같은 답이다 (무작위 없음)', () => {
    expect(startHintCandidates(pathGraph, 2)).toEqual(startHintCandidates(pathGraph, 2));
  });

  it('범위를 벗어난 단계는 1~3으로 눌러 준다', () => {
    expect(startHintCandidates(circuitGraph, 0)).toEqual(startHintCandidates(circuitGraph, 1));
    expect(startHintCandidates(circuitGraph, 9)).toEqual(startHintCandidates(circuitGraph, 3));
  });

  it('점이 세 개뿐이면 좁힐 여지가 없어 1·2단계가 같아질 수 있다', () => {
    const tiny = graph(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ]);
    expect(startHintCandidates(tiny, 1)).toEqual(startHintCandidates(tiny, 2));
    expect(startHintCandidates(tiny, 3)).toHaveLength(2);
  });
});
