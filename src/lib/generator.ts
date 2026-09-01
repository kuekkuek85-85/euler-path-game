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
 * 도전 회로(B02~B04) 도형을 만드는 **설계 시점 도구**.
 * 서로 다른 사이클을 간선이 겹치지 않게 합치므로 모든 차수가 짝수로 유지된다
 * → 항상 오일러 회로가 존재한다 (PRD 4.2 보너스).
 *
 * 예전에는 플레이할 때마다 새 도형을 뽑았지만, 2026-09-01 작성자 결정으로
 * 고정 미션 3개로 바꿨다. 지금 stages.json의 B02·B03·B04는 각각
 * makeRng(2)·makeRng(7)·makeRng(1)로 이 함수가 만든 결과를 그대로 심은 것이다.
 * 도형을 새로 뽑고 싶으면 다른 시드로 다시 돌려 stages.json에 넣으면 된다.
 */
export function generateCircuitStage(template: Stage, rng: () => number = Math.random): Stage {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const stage = tryGenerate(template, rng);
    if (stage) return stage;
  }
  // 여기까지 오는 일은 사실상 없지만, 실패해도 플레이는 가능해야 한다.
  return fallbackStage(template);
}

function tryGenerate(template: Stage, rng: () => number): Stage | null {
  const nodeCount = 7 + Math.floor(rng() * 3); // 7~9
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
  while (pairs.length < MIN_EDGES && guard < 400) {
    guard += 1;
    if (pairs.length + 3 > MAX_EDGES) break;
    const [a, b, c] = pickThree(ids, rng);
    const keys = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
    if (keys.some((k) => used.has(k))) continue;
    for (const k of keys) used.add(k);
    pairs.push([a, b], [b, c], [c, a]);
  }

  if (pairs.length < MIN_EDGES || pairs.length > MAX_EDGES) return null;

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
