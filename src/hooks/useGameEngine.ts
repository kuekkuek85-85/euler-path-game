import { useCallback, useMemo, useRef, useState } from 'react';
import type { GameStatus, Stage } from '../types';
import { adjacency, availableEdges, hintEdges, validStartNodes } from '../lib/graph';

/**
 * 'resume' — 손을 뗐다가 현재 점을 다시 누른 경우. 잘못한 것이 아니므로
 *            'rejected'와 달리 흔들림·진동 피드백을 주지 않는다.
 */
export type MoveResult = 'start' | 'moved' | 'cleared' | 'rejected' | 'resume';

export interface GameEngine {
  stage: Stage;
  currentNode: string | null;
  usedEdges: string[];
  usedEdgeSet: Set<string>;
  status: GameStatus;
  undoCount: number;
  hintCount: number;
  resetCount: number;
  remainingEdges: number;
  totalEdges: number;
  startedAt: number | null;
  elapsedMs: () => number;
  /** 힌트로 반짝일 노드 id. hint()를 부르면 채워지고, clearHint()로 지운다. */
  hintNodes: string[];
  /** 시작 전 안내용 — 이 스테이지에서 출발할 수 있는 점들. */
  startCandidates: string[];
  beginTimer: () => void;
  selectNode: (nodeId: string) => MoveResult;
  undo: () => void;
  reset: () => void;
  hint: () => void;
  clearHint: () => void;
  canReach: (nodeId: string) => boolean;
}

const MAX_HINTS = 3;

/**
 * 한 스테이지의 진행 상태. PRD 8.2의 GameState를 그대로 담고
 * 진행·되돌리기·막힘·클리어 판정을 맡는다.
 */
export function useGameEngine(stage: Stage): GameEngine {
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [usedEdges, setUsedEdges] = useState<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [hintCount, setHintCount] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  const [hintNodes, setHintNodes] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** 방문 노드 이력. undo에서 이전 노드로 정확히 되돌리기 위해 따로 쌓는다. */
  const nodeHistory = useRef<string[]>([]);

  const adj = useMemo(() => adjacency(stage), [stage]);
  const usedEdgeSet = useMemo(() => new Set(usedEdges), [usedEdges]);
  const totalEdges = stage.edges.length;
  const remainingEdges = totalEdges - usedEdges.length;
  const startCandidates = useMemo(() => validStartNodes(stage), [stage]);

  const status: GameStatus = useMemo(() => {
    if (usedEdges.length === totalEdges && totalEdges > 0) return 'cleared';
    if (currentNode === null) return 'ready';
    const open = (adj.get(currentNode) ?? []).some((i) => !usedEdgeSet.has(i.edgeId));
    return open ? 'playing' : 'stuck';
  }, [adj, currentNode, totalEdges, usedEdgeSet, usedEdges.length]);

  const beginTimer = useCallback(() => {
    setStartedAt((previous) => previous ?? Date.now());
  }, []);

  const elapsedMs = useCallback(() => (startedAt === null ? 0 : Date.now() - startedAt), [startedAt]);

  const canReach = useCallback(
    (nodeId: string) => {
      if (currentNode === null) return true;
      return (adj.get(currentNode) ?? []).some(
        (i) => i.to === nodeId && !usedEdgeSet.has(i.edgeId),
      );
    },
    [adj, currentNode, usedEdgeSet],
  );

  /**
   * 점을 하나 고른다. 시작 전이면 시작점 선택, 진행 중이면 한 칸 이동.
   * 인접하지 않거나 이미 쓴 선이면 'rejected' — 오답이 아니라 무시다 (PRD 3.2).
   */
  const selectNode = useCallback(
    (nodeId: string): MoveResult => {
      setHintNodes([]);
      if (currentNode === null) {
        nodeHistory.current = [nodeId];
        setCurrentNode(nodeId);
        return 'start';
      }
      // 이어 그리려고 현재 점을 다시 누른 것. 오조작이 아니다.
      if (nodeId === currentNode) return 'resume';

      const option = (adj.get(currentNode) ?? []).find(
        (i) => i.to === nodeId && !usedEdgeSet.has(i.edgeId),
      );
      if (!option) return 'rejected';

      nodeHistory.current = [...nodeHistory.current, nodeId];
      setCurrentNode(nodeId);
      const next = [...usedEdges, option.edgeId];
      setUsedEdges(next);
      return next.length === totalEdges ? 'cleared' : 'moved';
    },
    [adj, currentNode, totalEdges, usedEdgeSet, usedEdges],
  );

  /** 마지막 한 선을 취소한다. 시작점만 고른 상태면 시작점 선택도 되돌린다. */
  const undo = useCallback(() => {
    setHintNodes([]);
    if (usedEdges.length === 0) {
      if (currentNode !== null) {
        nodeHistory.current = [];
        setCurrentNode(null);
        setUndoCount((c) => c + 1);
      }
      return;
    }
    const history = nodeHistory.current;
    nodeHistory.current = history.slice(0, -1);
    setCurrentNode(nodeHistory.current[nodeHistory.current.length - 1] ?? null);
    setUsedEdges((edges) => edges.slice(0, -1));
    setUndoCount((c) => c + 1);
  }, [currentNode, usedEdges.length]);

  const reset = useCallback(() => {
    nodeHistory.current = [];
    setCurrentNode(null);
    setUsedEdges([]);
    setHintNodes([]);
    setResetCount((c) => c + 1);
  }, []);

  /** 다음에 갈 수 있는 점을 반짝인다. 스테이지당 3회, 회당 50점 차감. */
  const hint = useCallback(() => {
    if (hintCount >= MAX_HINTS) return;
    if (currentNode === null) {
      const candidates = startCandidates.length > 0 ? startCandidates : stage.nodes.map((n) => n.id);
      setHintNodes(candidates);
    } else {
      const options = hintEdges(stage, currentNode, usedEdges);
      const targets = options.length > 0 ? options : availableEdges(stage, currentNode, usedEdges);
      setHintNodes([...new Set(targets.map((o) => o.to))]);
    }
    setHintCount((c) => c + 1);
  }, [currentNode, hintCount, stage, startCandidates, usedEdges]);

  const clearHint = useCallback(() => setHintNodes([]), []);

  return {
    stage,
    currentNode,
    usedEdges,
    usedEdgeSet,
    status,
    undoCount,
    hintCount,
    resetCount,
    remainingEdges,
    totalEdges,
    startedAt,
    elapsedMs,
    hintNodes,
    startCandidates,
    beginTimer,
    selectNode,
    undo,
    reset,
    hint,
    clearHint,
    canReach,
  };
}

export const HINT_LIMIT = MAX_HINTS;
