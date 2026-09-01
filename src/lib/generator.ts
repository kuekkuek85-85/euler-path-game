import type { Stage, StageEdge, StageNode } from '../types';
import { eulerStatus, isConnected, solve } from './graph';

/** 재현 가능한 난수 (mulberry32). 테스트에서 시드를 고정해 쓴다. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN_EDGES = 12;
const MAX_EDGES = 20;
/** 둘레 사이클로 쓸 수 있는 노드 수. 위로 갈수록 점 사이가 좁아져 손가락 정확도가 떨어진다. */
const MIN_NODES = 7;
const MAX_NODES = 12;

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function ringLayout(count: number): StageNode[] {
  const radius = 40;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return {
      id: `V${i}`,
      x: Math.round((50 + radius * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + radius * Math.sin(angle)) * 10) / 10,
    };
  });
}

/**
 * 목표 간선 수를 만들 수 있는 둘레 노드 수들.
 * 둘레 사이클 N개 + 삼각형 3개씩이므로 (목표 - N)이 3의 배수여야 한다.
 * 같은 간선 수라면 노드가 많은 쪽이 선이 덜 겹쳐 보기 좋다.
 */
function nodeCountsFor(targetEdges: number): number[] {
  const options: number[] = [];
  for (let n = MIN_NODES; n <= MAX_NODES; n += 1) {
    if (targetEdges >= n && (targetEdges - n) % 3 === 0) options.push(n);
  }
  return options.reverse();
}

/**
 * 도전 회로(B02~B06) 도형을 만드는 **설계 시점 도구**.
 * 서로 다른 사이클을 간선이 겹치지 않게 합치므로 모든 차수가 짝수로 유지된다
 * → 항상 오일러 회로가 존재한다 (PRD 4.2 보너스).
 *
 * 예전에는 플레이할 때마다 새 도형을 뽑았지만, 2026-09-01 작성자 결정으로
 * 고정 미션으로 바꿨다. 지금 stages.json의 B02~B06은 이 함수를
 * (시드, 목표 간선 수) 조합으로 돌려 나온 결과를 그대로 심은 것이다.
 * 도형을 새로 뽑고 싶으면 다른 시드로 다시 돌려 stages.json에 넣으면 된다.
 */
export function generateCircuitStage(
  template: Stage,
  rng: () => number = Math.random,
  targetEdges = MIN_EDGES,
): Stage {
  const target = Math.min(MAX_EDGES, Math.max(MIN_EDGES, targetEdges));
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const stage = tryGenerate(template, rng, target);
    if (stage) return stage;
  }
  // 여기까지 오는 일은 사실상 없지만, 실패해도 플레이는 가능해야 한다.
  return fallbackStage(template);
}

function tryGenerate(template: Stage, rng: () => number, target: number): Stage | null {
  const counts = nodeCountsFor(target);
  if (counts.length === 0) return null;
  const nodeCount = counts[Math.floor(rng() * counts.length)];
  const nodes = ringLayout(nodeCount);
  const ids = nodes.map((n) => n.id);

  const used = new Set<string>();
  const pairs: [string, string][] = [];

  // 바깥 둘레 사이클 — 연결성을 보장한다.
  for (let i = 0; i < nodeCount; i += 1) {
    const a = ids[i];
    const b = ids[(i + 1) % nodeCount];
    used.add(edgeKey(a, b));
    pairs.push([a, b]);
  }

  // 삼각형 사이클을 겹치지 않게 더한다. 사이클을 더해도 모든 차수는 짝수로 남는다.
  let guard = 0;
  while (pairs.length < target && guard < 600) {
    guard += 1;
    if (pairs.length + 3 > target) break;
    const [a, b, c] = pickThree(ids, rng);
    const keys = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
    if (keys.some((k) => used.has(k))) continue;
    for (const k of keys) used.add(k);
    pairs.push([a, b], [b, c], [c, a]);
  }

  if (pairs.length !== target) return null;

  const edges: StageEdge[] = pairs.map(([from, to], i) => ({ id: `g${i + 1}`, from, to }));
  const stage: Stage = {
    ...template,
    nodes,
    edges,
    tier: 3,
    type: 'DRAW',
    // 간선 하나당 약 4.5초를 기준 시간으로 잡는다.
    parTimeSec: Math.round(edges.length * 4.5),
  };

  if (!isConnected(stage)) return null;
  if (eulerStatus(stage) !== 'circuit') return null;
  if (!solve(stage)) return null;
  return stage;
}

function pickThree(ids: string[], rng: () => number): [string, string, string] {
  const pool = [...ids];
  const picked: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked as [string, string, string];
}

/** 생성이 반복 실패했을 때 쓰는 고정 도형 (팔각형 + 지그재그 사이클, 간선 16개). */
function fallbackStage(template: Stage): Stage {
  const nodes = ringLayout(8);
  const ids = nodes.map((n) => n.id);
  const pairs: [string, string][] = [];
  for (let i = 0; i < 8; i += 1) pairs.push([ids[i], ids[(i + 1) % 8]]);
  for (let i = 0; i < 8; i += 1) pairs.push([ids[i], ids[(i + 2) % 8]]);
  const edges: StageEdge[] = pairs.map(([from, to], i) => ({ id: `g${i + 1}`, from, to }));
  return { ...template, nodes, edges, tier: 3, type: 'DRAW', parTimeSec: 72 };
}
