import type { StageNode } from '../types';

export interface EdgeGeometry {
  /** SVG path 문자열 */
  path: string;
  /** 곡선을 포함한 실제 시각적 중점 — 체크 마크를 얹는 자리 */
  midX: number;
  midY: number;
}

/**
 * 간선 하나의 SVG 경로.
 * 곡률이 0이면 직선, 아니면 중점을 진행 방향의 수직으로 밀어낸 2차 베지어를 그린다.
 * 다중 간선(쾨니히스베르크의 다리 등)을 서로 다른 곡률로 구분하기 위해 쓴다 (PRD 4.2).
 */
export function edgeGeometry(from: StageNode, to: StageNode, curve = 0): EdgeGeometry {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  if (!curve) {
    return { path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, midX, midY };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  // 2차 베지어의 t=0.5 지점은 (제어점 - 중점)의 절반만큼 벌어진다 → 제어점을 두 배로 민다.
  const controlX = midX + nx * curve * 2;
  const controlY = midY + ny * curve * 2;
  return {
    path: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`,
    midX: midX + nx * curve,
    midY: midY + ny * curve,
  };
}
