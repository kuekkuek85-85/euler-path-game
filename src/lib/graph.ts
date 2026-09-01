import type { Stage, StageEdge, StageNode } from '../types';

/** graph 유틸이 다루는 최소 단위. Stage 전체를 넘겨도 되고 남은 간선만 넘겨도 된다. */
export interface GraphLike {
  nodes: StageNode[];
  edges: StageEdge[];
}

export interface Incidence {
  edgeId: string;
  to: string;
}

/** 노드 id → 그 노드에 붙은 (간선, 반대편 노드) 목록. 자기 자신을 잇는 루프는 두 번 들어간다. */
export function adjacency(graph: GraphLike): Map<string, Incidence[]> {
  const adj = new Map<string, Incidence[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.from)!.push({ edgeId: edge.id, to: edge.to });
    adj.get(edge.to)!.push({ edgeId: edge.id, to: edge.from });
  }
  return adj;
}

/** 노드별 차수. 루프는 차수 2로 센다. */
export function degreeMap(graph: GraphLike): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of graph.nodes) degrees.set(node.id, 0);
  for (const edge of graph.edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

/** 차수가 홀수인 노드 id 목록. 스테이지 노드 선언 순서를 유지한다. */
export function oddNodes(graph: GraphLike): string[] {
  const degrees = degreeMap(graph);
  const ordered = graph.nodes.map((n) => n.id);
  for (const id of degrees.keys()) if (!ordered.includes(id)) ordered.push(id);
  return ordered.filter((id) => (degrees.get(id) ?? 0) % 2 === 1);
}

/** 간선이 하나라도 붙어 있는 노드들이 모두 하나의 연결 요소에 있는지. */
export function isConnected(graph: GraphLike): boolean {
  if (graph.edges.length === 0) return true;
  const adj = adjacency(graph);
  const start = graph.edges[0].from;
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const { to } of adj.get(current) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  const degrees = degreeMap(graph);
  for (const [id, degree] of degrees) {
    if (degree > 0 && !seen.has(id)) return false;
  }
  return true;
}

/** 간선이 하나도 붙지 않은 노드 id 목록. 스테이지 데이터 오류 탐지용. */
export function isolatedNodes(graph: GraphLike): string[] {
  const degrees = degreeMap(graph);
  return graph.nodes.filter((n) => (degrees.get(n.id) ?? 0) === 0).map((n) => n.id);
}

export type EulerStatus = 'circuit' | 'path' | 'impossible';

/**
 * 'circuit' — 홀수점 0개. 어느 점에서 시작해도 되고 시작점으로 돌아온다.
 * 'path'    — 홀수점 2개. 두 홀수점 중 하나에서 시작해야 한다.
 * 'impossible' — 그 외(홀수점 4개 이상이거나 그래프가 끊겨 있음).
 */
export function eulerStatus(graph: GraphLike): EulerStatus {
  if (!isConnected(graph)) return 'impossible';
  const odd = oddNodes(graph).length;
  if (odd === 0) return 'circuit';
  if (odd === 2) return 'path';
  return 'impossible';
}

/**
 * 모든 간선을 k획으로 덮는 실제 해를 만든다. 못 만들면 null.
 *
 * 원리: 홀수점이 2k개일 때, 그 중 2k-2개를 짝지어 "가상의 선"으로 이어 주면
 * 홀수점이 2개만 남아 한붓그리기가 된다. 그 한붓 경로를 찾은 뒤 가상의 선 자리에서
 * 잘라내면 k개의 획이 나온다. 각 획의 양 끝이 원래 홀수점 하나씩을 맡는다.
 *
 * 반환값은 획별 edge id 배열이다. 한붓 스테이지 검증(AC-04)의 두붓 판이다.
 */
export function solveInStrokes(graph: GraphLike): string[][] | null {
  if (graph.edges.length === 0) return [];
  if (!isConnected(graph)) return null;

  const odd = oddNodes(graph);
  if (odd.length % 2 !== 0) return null; // 악수 정리상 있을 수 없다
  if (odd.length <= 2) {
    const single = solve(graph);
    return single ? [single] : null;
  }

  // odd[0]과 odd[마지막]은 전체 경로의 양 끝으로 남기고, 가운데를 짝지어 잇는다.
  const bridges: StageEdge[] = [];
  for (let i = 1; i + 1 < odd.length; i += 2) {
    bridges.push({ id: `__bridge${i}`, from: odd[i], to: odd[i + 1] });
  }
  const augmented: GraphLike = { nodes: graph.nodes, edges: [...graph.edges, ...bridges] };
  const path = solve(augmented, odd[0]);
  if (!path) return null;

  const bridgeIds = new Set(bridges.map((b) => b.id));
  const strokes: string[][] = [];
  let current: string[] = [];
  for (const edgeId of path) {
    if (bridgeIds.has(edgeId)) {
      strokes.push(current);
      current = [];
    } else {
      current.push(edgeId);
    }
  }
  strokes.push(current);

  const covered = strokes.flat();
  if (covered.length !== graph.edges.length) return null;
  if (new Set(covered).size !== graph.edges.length) return null;
  if (strokes.some((stroke) => stroke.length === 0)) return null;
  return strokes;
}

/** 모든 간선을 덮는 데 필요한 최소 붓 횟수 (PRD 8.3: max(1, 홀수점 ÷ 2)). */
export function minStrokes(graph: GraphLike): number {
  return Math.max(1, oddNodes(graph).length / 2);
}

/** 시작해도 되는 노드 목록. 회로면 차수가 있는 모든 노드, 경로면 두 홀수점. */
export function validStartNodes(graph: GraphLike): string[] {
  const status = eulerStatus(graph);
  if (status === 'path') return oddNodes(graph);
  if (status === 'circuit') {
    const degrees = degreeMap(graph);
    return graph.nodes.filter((n) => (degrees.get(n.id) ?? 0) > 0).map((n) => n.id);
  }
  return [];
}

/**
 * Hierholzer 알고리즘. 모든 간선을 한 번씩 지나는 순서를 edge id 배열로 돌려준다.
 * 해가 없거나 startNode에서 출발할 수 없으면 null.
 */
export function solve(graph: GraphLike, startNode?: string): string[] | null {
  if (graph.edges.length === 0) return [];
  if (!isConnected(graph)) return null;

  const odd = oddNodes(graph);
  if (odd.length !== 0 && odd.length !== 2) return null;

  const start = startNode ?? (odd.length === 2 ? odd[0] : graph.edges[0].from);
  if (odd.length === 2 && !odd.includes(start)) return null;

  const degrees = degreeMap(graph);
  if ((degrees.get(start) ?? 0) === 0) return null;

  const adj = adjacency(graph);
  // 노드마다 아직 살펴보지 않은 인접 항목의 위치. 전체 O(간선 수)로 유지한다.
  const cursor = new Map<string, number>();
  for (const id of adj.keys()) cursor.set(id, 0);
  const usedEdge = new Set<string>();

  const nodeStack: string[] = [start];
  const edgeStack: (string | null)[] = [null];
  const circuit: string[] = [];

  while (nodeStack.length > 0) {
    const node = nodeStack[nodeStack.length - 1];
    const incidents = adj.get(node) ?? [];
    let index = cursor.get(node) ?? 0;
    while (index < incidents.length && usedEdge.has(incidents[index].edgeId)) index += 1;
    cursor.set(node, index);

    if (index === incidents.length) {
      nodeStack.pop();
      const edgeId = edgeStack.pop();
      if (edgeId) circuit.push(edgeId);
    } else {
      const { edgeId, to } = incidents[index];
      usedEdge.add(edgeId);
      cursor.set(node, index + 1);
      nodeStack.push(to);
      edgeStack.push(edgeId);
    }
  }

  if (circuit.length !== graph.edges.length) return null;
  return circuit.reverse();
}

/** 아직 지나지 않은 간선만 남긴 부분 그래프. */
export function remainingGraph(graph: GraphLike, usedEdges: Iterable<string>): GraphLike {
  const used = usedEdges instanceof Set ? usedEdges : new Set(usedEdges);
  return { nodes: graph.nodes, edges: graph.edges.filter((e) => !used.has(e.id)) };
}

/** 현재 노드에서 아직 지날 수 있는 간선들. */
export function availableEdges(
  graph: GraphLike,
  currentNode: string,
  usedEdges: Iterable<string>,
): Incidence[] {
  const used = usedEdges instanceof Set ? usedEdges : new Set(usedEdges);
  const adj = adjacency(graph);
  return (adj.get(currentNode) ?? []).filter((i) => !used.has(i.edgeId));
}

/** start에서 출발해 남은 간선을 모두 지날 수 있는지. */
export function hasEulerTrailFrom(graph: GraphLike, start: string): boolean {
  if (graph.edges.length === 0) return true;
  if (!isConnected(graph)) return false;
  const degrees = degreeMap(graph);
  if ((degrees.get(start) ?? 0) === 0) return false;
  const odd = oddNodes(graph);
  if (odd.length === 0) return true;
  if (odd.length === 2) return odd.includes(start);
  return false;
}

/**
 * 힌트로 반짝일 간선. 아직 클리어 가능성이 남아 있는 선택지만 고른다.
 * 살아 있는 선택지가 없으면(이미 실패 상태) 갈 수 있는 모든 간선을 돌려준다.
 */
export function hintEdges(
  graph: GraphLike,
  currentNode: string,
  usedEdges: string[],
): Incidence[] {
  const options = availableEdges(graph, currentNode, usedEdges);
  const safe = options.filter((option) => {
    const rest = remainingGraph(graph, [...usedEdges, option.edgeId]);
    return hasEulerTrailFrom(rest, option.to);
  });
  return safe.length > 0 ? safe : options;
}

export interface StageValidation {
  stageId: string;
  ok: boolean;
  problems: string[];
  status: EulerStatus;
  oddCount: number;
}

/**
 * 배포 전에 스테이지 데이터가 실제로 풀 수 있는 상태인지 검사한다 (PRD 4.3).
 * 유닛테스트와 개발 모드 기동 시 함께 쓴다.
 */
export function validateStage(stage: Stage): StageValidation {
  const problems: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of stage.nodes) {
    if (nodeIds.has(node.id)) problems.push(`노드 id 중복: ${node.id}`);
    nodeIds.add(node.id);
    if (!Number.isFinite(node.x) || node.x < 0 || node.x > 100)
      problems.push(`노드 ${node.id}의 x 좌표가 0~100 밖입니다: ${node.x}`);
    if (!Number.isFinite(node.y) || node.y < 0 || node.y > 100)
      problems.push(`노드 ${node.id}의 y 좌표가 0~100 밖입니다: ${node.y}`);
  }

  const edgeIds = new Set<string>();
  for (const edge of stage.edges) {
    if (edgeIds.has(edge.id)) problems.push(`간선 id 중복: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from)) problems.push(`간선 ${edge.id}의 from 노드가 없습니다: ${edge.from}`);
    if (!nodeIds.has(edge.to)) problems.push(`간선 ${edge.id}의 to 노드가 없습니다: ${edge.to}`);
    if (edge.from === edge.to) problems.push(`간선 ${edge.id}가 같은 노드를 잇습니다.`);
  }

  if (stage.edges.length === 0) problems.push('간선이 없습니다.');
  if (!isConnected(stage)) problems.push('그래프가 하나로 이어져 있지 않습니다.');
  for (const id of isolatedNodes(stage)) problems.push(`간선이 붙지 않은 노드: ${id}`);

  const status = eulerStatus(stage);
  const odd = oddNodes(stage);

  const maxStrokes = stage.maxStrokes ?? 1;

  if (stage.type === 'DRAW' && maxStrokes === 1) {
    if (status === 'impossible') {
      problems.push(`DRAW 스테이지인데 한붓그리기가 불가능합니다 (홀수점 ${odd.length}개).`);
    } else {
      // PRD AC-04: 모든 DRAW 스테이지는 solve()로 실제 해가 존재함을 확인한다.
      for (const start of validStartNodes(stage)) {
        const path = solve(stage, start);
        if (!path || path.length !== stage.edges.length) {
          problems.push(`시작점 ${start}에서 해를 찾지 못했습니다.`);
        }
      }
    }
    // tier 1 = 홀수점 0개(회로), tier 2 = 홀수점 2개(경로)
    if (stage.tier === 1 && status !== 'circuit')
      problems.push(`tier 1은 홀수점 0개여야 하는데 ${odd.length}개입니다.`);
    if (stage.tier === 2 && status !== 'path')
      problems.push(`tier 2는 홀수점 2개여야 하는데 ${odd.length}개입니다.`);
  }

  // 두붓 이상 — 선언한 붓 수가 실제 최소 붓 수와 정확히 같아야 한다.
  // 더 적게 필요하면 문제가 시시해지고, 더 필요하면 아예 못 푼다.
  if (stage.type === 'DRAW' && maxStrokes > 1) {
    const needed = minStrokes(stage);
    if (needed !== maxStrokes) {
      problems.push(
        `maxStrokes=${maxStrokes}인데 실제로 필요한 붓 수는 ${needed}입니다 (홀수점 ${odd.length}개).`,
      );
    }
    const strokes = solveInStrokes(stage);
    if (!strokes) {
      problems.push(`${maxStrokes}획으로 덮는 실제 해를 찾지 못했습니다.`);
    } else if (strokes.length !== maxStrokes) {
      problems.push(`해가 ${strokes.length}획으로 나왔습니다 (선언은 ${maxStrokes}획).`);
    }
  }

  if (stage.type === 'JUDGE') {
    if (!stage.answer) {
      problems.push('JUDGE 스테이지에 answer가 없습니다.');
    } else {
      const expectedSolvable = status !== 'impossible';
      if (stage.answer.solvable !== expectedSolvable)
        problems.push(
          `answer.solvable=${stage.answer.solvable}이지만 실제 판정은 ${expectedSolvable}입니다.`,
        );
      const expectedStrokes = minStrokes(stage);
      if (stage.answer.minStrokes !== expectedStrokes)
        problems.push(
          `answer.minStrokes=${stage.answer.minStrokes}이지만 실제 값은 ${expectedStrokes}입니다.`,
        );
      const declared = [...stage.answer.oddNodes].sort();
      const actual = [...odd].sort();
      if (declared.join(',') !== actual.join(','))
        problems.push(
          `answer.oddNodes=[${declared.join(',')}]이지만 실제 홀수점은 [${actual.join(',')}]입니다.`,
        );
    }
  }

  return { stageId: stage.id, ok: problems.length === 0, problems, status, oddCount: odd.length };
}
