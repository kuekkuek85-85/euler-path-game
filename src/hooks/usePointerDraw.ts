import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { StageNode } from '../types';

/** PRD 5.3: 터치 히트 영역은 최소 44×44 CSS px. */
const MIN_TOUCH_PX = 44;
const VIEWBOX = 100;

export interface PointerDraw {
  svgRef: React.RefObject<SVGSVGElement>;
  /** viewBox 단위의 히트 반지름. 투명 원 오버레이 크기로 그대로 쓴다. */
  hitRadius: number;
  /** 드래그 중 손가락이 있는 위치 (viewBox 좌표). 미리보기 선을 그릴 때 쓴다. */
  pointerAt: { x: number; y: number } | null;
  isDragging: boolean;
  handlers: {
    onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<SVGSVGElement>) => void;
  };
}

function minNodeDistance(nodes: StageNode[]): number {
  let min = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return Number.isFinite(min) ? min : VIEWBOX;
}

/**
 * 포인터(터치·마우스·펜)를 노드 선택으로 바꾼다.
 * 같은 코드 경로로 드래그와 탭을 모두 처리하므로 한 판 안에서 섞어 써도 된다 (PRD 3.2).
 */
export function usePointerDraw(
  nodes: StageNode[],
  onNodeHit: (nodeId: string) => void,
  enabled = true,
): PointerDraw {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pixelSize, setPixelSize] = useState(360);
  const [pointerAt, setPointerAt] = useState<{ x: number; y: number } | null>(null);
  const draggingId = useRef<number | null>(null);
  const lastNode = useRef<string | null>(null);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const update = () => setPixelSize(element.getBoundingClientRect().width || 360);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 44 CSS px에 해당하는 viewBox 반지름. 다만 이웃 노드 영역을 침범하지 않도록 제한한다.
  const desiredRadius = (MIN_TOUCH_PX / 2) * (VIEWBOX / pixelSize);
  const spacingLimit = minNodeDistance(nodes) * 0.48;
  const hitRadius = Math.max(4, Math.min(desiredRadius, spacingLimit));

  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const element = svgRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * VIEWBOX,
      y: ((clientY - rect.top) / rect.height) * VIEWBOX,
    };
  }, []);

  /** 히트 반지름 안에서 가장 가까운 노드. 최대 12개라 완전 탐색으로 충분하다 (PRD 7.2). */
  const nodeAt = useCallback(
    (point: { x: number; y: number }) => {
      let best: { id: string; distance: number } | null = null;
      for (const node of nodes) {
        const distance = Math.hypot(node.x - point.x, node.y - point.y);
        if (distance <= hitRadius && (!best || distance < best.distance)) {
          best = { id: node.id, distance };
        }
      }
      return best?.id ?? null;
    },
    [hitRadius, nodes],
  );

  const handlePoint = useCallback(
    (clientX: number, clientY: number) => {
      const point = toViewBox(clientX, clientY);
      if (!point) return;
      setPointerAt(point);
      const hit = nodeAt(point);
      if (hit && hit !== lastNode.current) {
        lastNode.current = hit;
        onNodeHit(hit);
      } else if (!hit) {
        // 노드 영역을 벗어나면 다음에 같은 노드를 다시 만나도 반응하도록 초기화한다.
        lastNode.current = null;
      }
    },
    [nodeAt, onNodeHit, toViewBox],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!enabled) return;
      event.preventDefault();
      draggingId.current = event.pointerId;
      lastNode.current = null;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처를 못 잡아도 pointermove는 계속 들어온다 */
      }
      handlePoint(event.clientX, event.clientY);
    },
    [enabled, handlePoint],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!enabled || draggingId.current !== event.pointerId) return;
      event.preventDefault();
      handlePoint(event.clientX, event.clientY);
    },
    [enabled, handlePoint],
  );

  const endDrag = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (draggingId.current !== event.pointerId) return;
    draggingId.current = null;
    lastNode.current = null;
    setPointerAt(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* 이미 해제된 경우 */
    }
  }, []);

  return {
    svgRef,
    hitRadius,
    pointerAt,
    isDragging: pointerAt !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
