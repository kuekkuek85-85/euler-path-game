import { type PointerEvent as ReactPointerEvent, useMemo } from 'react';
import type { Stage, StageNode } from '../types';
import { degreeMap } from '../lib/graph';
import { edgeGeometry } from '../lib/geometry';
import { FiveRoomsDecor } from './decor/FiveRoomsDecor';
import { KonigsbergDecor } from './decor/KonigsbergDecor';

export interface GameCanvasProps {
  stage: Stage;
  usedEdges: Set<string>;
  currentNode: string | null;
  hintNodes?: string[];
  /** 홀수점 보기 토글. 차수를 숫자로도 보여준다 (색만으로 정보를 주지 않기 위함). */
  oddView?: boolean;
  /** JUDGE 해설에서 홀수점만 강조할 때. */
  emphasizeOdd?: string[];
  hitRadius?: number;
  pointerAt?: { x: number; y: number } | null;
  svgRef?: React.Ref<SVGSVGElement>;
  handlers?: {
    onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<SVGSVGElement>) => void;
  };
  className?: string;
  shake?: boolean;
}

export function GameCanvas({
  stage,
  usedEdges,
  currentNode,
  hintNodes = [],
  oddView = false,
  emphasizeOdd,
  hitRadius = 8,
  pointerAt = null,
  svgRef,
  handlers,
  className = '',
  shake = false,
}: GameCanvasProps) {
  const nodeById = useMemo(
    () => Object.fromEntries(stage.nodes.map((n) => [n.id, n])) as Record<string, StageNode>,
    [stage],
  );
  const degrees = useMemo(() => degreeMap(stage), [stage]);
  const current = currentNode ? nodeById[currentNode] : null;
  const hintSet = new Set(hintNodes);
  const emphasized = new Set(emphasizeOdd ?? []);

  const edges = stage.edges.map((edge) => {
    const from = nodeById[edge.from];
    const to = nodeById[edge.to];
    return { edge, from, to, geometry: edgeGeometry(from, to, edge.curve) };
  });

  const unused = edges.filter(({ edge }) => !usedEdges.has(edge.id));
  const used = edges.filter(({ edge }) => usedEdges.has(edge.id));

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className={`no-touch-scroll block w-full ${shake ? 'animate-shake' : ''} ${className}`}
      role="img"
      aria-label={`${stage.name} 도형. 선 ${stage.edges.length}개 중 ${usedEdges.size}개를 지났습니다.`}
      {...handlers}
    >
      {stage.decor === 'konigsberg' && <KonigsbergDecor />}
      {stage.decor === 'fiveRooms' && <FiveRoomsDecor />}

      {/* 아직 지나지 않은 선 */}
      <g fill="none" strokeLinecap="round">
        {unused.map(({ edge, geometry }) => (
          <path
            key={edge.id}
            d={geometry.path}
            stroke="var(--color-line-idle)"
            strokeWidth={2.2}
          />
        ))}
      </g>

      {/* 지나간 선 — 색 + 굵기 + 체크 마크로 세 겹 표시 (PRD 7.4) */}
      <g fill="none" strokeLinecap="round">
        {used.map(({ edge, geometry }) => (
          <g key={edge.id}>
            <path
              d={geometry.path}
              stroke="var(--color-line-used)"
              strokeWidth={4}
              pathLength={1}
              className="edge-draw"
            />
            <path
              d={`M ${geometry.midX - 1.6} ${geometry.midY} l 1.2 1.4 l 2.4 -3`}
              stroke="#ffffff"
              strokeWidth={1.1}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>

      {/* 드래그 중 손가락까지의 미리보기 선 */}
      {current && pointerAt && (
        <line
          x1={current.x}
          y1={current.y}
          x2={pointerAt.x}
          y2={pointerAt.y}
          stroke="var(--color-accent)"
          strokeWidth={1.4}
          strokeDasharray="2 2"
          opacity={0.55}
        />
      )}

      {/* 노드 */}
      <g>
        {stage.nodes.map((node) => {
          const degree = degrees.get(node.id) ?? 0;
          const odd = degree % 2 === 1;
          const isCurrent = node.id === currentNode;
          const isHint = hintSet.has(node.id);
          const isEmphasized = emphasized.has(node.id);
          const showOdd = oddView || isEmphasized;
          const fill = showOdd
            ? odd
              ? 'var(--color-node-odd)'
              : 'var(--color-node-even)'
            : 'var(--color-node)';

          return (
            <g key={node.id}>
              {isHint && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={6}
                  fill="none"
                  stroke="var(--color-warn)"
                  strokeWidth={1.6}
                  className="hint-pulse"
                />
              )}
              {isEmphasized && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={7}
                  fill="none"
                  stroke="var(--color-node-odd)"
                  strokeWidth={1.4}
                  strokeDasharray="2 2"
                />
              )}
              {isCurrent && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={6.4}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={1.8}
                />
              )}
              <circle cx={node.x} cy={node.y} r={isCurrent ? 4 : 3.2} fill={fill} />
              {/* 홀수점은 색 외에 테두리 링으로도 구분한다 */}
              {showOdd && odd && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={5}
                  fill="none"
                  stroke="var(--color-node-odd)"
                  strokeWidth={0.9}
                />
              )}
              {showOdd && (
                <text
                  x={node.x}
                  y={node.y - 7.5}
                  textAnchor="middle"
                  fontSize={5}
                  fontWeight={700}
                  fill={odd ? 'var(--color-node-odd)' : 'var(--color-node-even)'}
                >
                  {degree}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/*
        투명 히트 영역 — 최소 44×44 CSS px 확보 (PRD 5.3).
        포인터 판정은 SVG 루트에서 가장 가까운 노드를 찾는 방식이라 여기서 이벤트를
        따로 받지는 않는다. 이 원들은 히트 영역 크기를 눈으로 확인하기 위한 것이다.
      */}
      <g pointerEvents="none">
        {stage.nodes.map((node) => (
          <circle key={`hit-${node.id}`} cx={node.x} cy={node.y} r={hitRadius} fill="transparent" />
        ))}
      </g>
    </svg>
  );
}
