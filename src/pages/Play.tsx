import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Stage } from '../types';
import { getStage } from '../data/stages';
import { oddNodes } from '../lib/graph';
import { scoreForStage } from '../lib/scoring';
import { formatClock } from '../lib/format';
import { useGameEngine } from '../hooks/useGameEngine';
import { usePointerDraw } from '../hooks/usePointerDraw';
import { GameCanvas } from '../components/GameCanvas';
import { Countdown } from '../components/Countdown';
import { ConceptCard } from '../components/ConceptCard';
import { Toast, type ToastTone } from '../components/Toast';
import { useSession } from '../state/sessionStore';
import { JudgeBoard } from './JudgeBoard';

export function Play() {
  const { stageId = '' } = useParams();
  const { identity, isUnlocked } = useSession();
  const stage = getStage(stageId);

  if (!identity) return <Navigate to="/" replace />;
  if (!stage) return <Navigate to="/stages" replace />;
  if (!isUnlocked(stage.id)) return <Navigate to="/stages" replace />;

  if (stage.type === 'JUDGE') return <JudgeBoard stage={stage} />;
  return <DrawBoard key={stage.id} stage={stage} />;
}

function DrawBoard({ stage }: { stage: Stage }) {
  const navigate = useNavigate();
  const { submitResult, config } = useSession();
  const engine = useGameEngine(stage);
  const [counting, setCounting] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [oddView, setOddView] = useState(false);
  const [conceptOpen, setConceptOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [stuckStreak, setStuckStreak] = useState(0);
  const submitted = useRef(false);
  const wasStuck = useRef(false);

  // 홀수점 보기는 기본으로 숨긴다. 교사가 "홀수점 보기 열기"를 켰을 때만 나타난다
  // (수업 운영표의 "정리 1 — 홀수점 개념 설명" 시점에 여는 용도).
  const oddViewAllowed = config.oddViewUnlocked;

  const onNodeHit = useCallback(
    (nodeId: string) => {
      if (counting) return;
      const result = engine.selectNode(nodeId);
      if (result === 'rejected') {
        // 오답이 아니라 무시. 짧은 흔들림과 진동으로만 알린다 (PRD 3.2).
        setShake(true);
        window.setTimeout(() => setShake(false), 380);
        navigator.vibrate?.(20);
      }
    },
    [counting, engine],
  );

  // 붓을 떼면 한붓그리기가 아니므로 실패로 판정한다.
  const onStrokeEnd = useCallback(() => {
    if (counting) return;
    engine.breakStroke();
  }, [counting, engine]);

  const draw = usePointerDraw(
    stage.nodes,
    onNodeHit,
    !counting && engine.status !== 'cleared' && engine.status !== 'broken',
    onStrokeEnd,
  );

  // 경과 시간 표시. 카운트다운이 끝난 뒤부터 흐른다.
  useEffect(() => {
    if (counting || engine.status === 'cleared') return;
    const timer = window.setInterval(() => setElapsed(engine.elapsedMs()), 100);
    return () => window.clearInterval(timer);
  }, [counting, engine, engine.status]);

  // 막힘 안내 (PRD 5.3)
  useEffect(() => {
    if (engine.status !== 'stuck') {
      wasStuck.current = false;
      return;
    }
    if (wasStuck.current) return;
    wasStuck.current = true;
    const streak = stuckStreak + 1;
    setStuckStreak(streak);
    navigator.vibrate?.([15, 40, 15]);
    const oddCount = oddNodes(stage).length;
    if (streak >= 3 && oddCount === 2) {
      setToast({
        message: '시작점을 바꿔볼까요? 선이 홀수 개 모인 점에서 출발해 보세요.',
        tone: 'warn',
      });
    } else {
      setToast({ message: '이 길로는 다 못 지나가요. 다시 그려 볼까요?', tone: 'warn' });
    }
  }, [engine.status, stage, stuckStreak]);

  // 붓을 뗐을 때 — 안내는 캔버스 위 오버레이가 하므로 진동만 준다.
  useEffect(() => {
    if (engine.status !== 'broken') return;
    navigator.vibrate?.([15, 40, 15]);
  }, [engine.status]);

  // 두붓 스테이지에서 다음 붓으로 넘어갔을 때
  useEffect(() => {
    if (engine.strokeIndex <= 1) return;
    navigator.vibrate?.(20);
    setToast({
      message: `${engine.strokeIndex}번째 붓이에요. 남은 선이 있는 아무 점에서나 시작하세요.`,
      tone: 'info',
    });
  }, [engine.strokeIndex]);

  // 클리어 → 결과 화면
  useEffect(() => {
    if (engine.status !== 'cleared' || submitted.current) return;
    submitted.current = true;
    const timeMs = engine.elapsedMs();
    const result = scoreForStage(stage, stage.edges.length, {
      elapsedMs: timeMs,
      undoCount: engine.undoCount,
      hintCount: engine.hintCount,
      resetCount: engine.resetCount,
    });
    const { improved, totalScore } = submitResult({
      stage,
      record: { score: result.score, timeMs, stars: result.stars },
      play: {
        stageId: stage.id,
        cleared: true,
        timeMs,
        score: result.score,
        stars: result.stars,
        undoCount: engine.undoCount,
        hintCount: engine.hintCount,
        path: engine.usedEdges,
      },
    });
    navigate('/result', {
      replace: true,
      state: {
        stageId: stage.id,
        stageName: stage.name,
        edgeCount: stage.edges.length,
        parTimeSec: stage.parTimeSec,
        timeMs,
        result,
        improved,
        totalScore,
        clearMessage: stage.clearMessage,
      },
    });
  }, [engine, navigate, stage, submitResult]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-2 pb-4 pt-3 landscape:max-w-4xl landscape:flex-row landscape:items-center landscape:gap-4">
      <div className="landscape:flex-1">
        <header className="flex items-center justify-between gap-2">
          <Link
            to="/stages"
            className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500"
            aria-label="스테이지 선택으로"
          >
            ← 목록
          </Link>
          <h1 className="truncate text-sm font-bold text-slate-900">
            {stage.id} · {stage.name}
          </h1>
          <button
            type="button"
            onClick={() => setConceptOpen(true)}
            className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500"
          >
            📘
          </button>
        </header>

        <div className="mt-2 flex items-center justify-center gap-4 text-sm font-semibold text-slate-700">
          <span>
            남은 선{' '}
            <b className="text-slate-900">
              {engine.remainingEdges} / {engine.totalEdges}
            </b>
          </span>
          {engine.maxStrokes > 1 && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                |
              </span>
              <span>
                붓{' '}
                <b className="text-violet-700">
                  {engine.strokeIndex} / {engine.maxStrokes}
                </b>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-300">
            |
          </span>
          <span>
            <span className="sr-only">경과 시간 </span>
            {formatClock(elapsed)}
            <span className="ml-1 text-xs font-normal text-slate-500">
              (기준 {stage.parTimeSec}초)
            </span>
          </span>
        </div>

        {/*
          캔버스는 정사각이라 가로 모드에서는 높이가 한계가 된다.
          세로에서는 화면 폭의 92%(최대 560px), 가로에서는 남은 세로 공간에 맞춘다 (PRD 7.1).
        */}
        <div className="relative mx-auto mt-2 w-full max-w-[560px] landscape:max-w-[min(560px,calc(100dvh-7.5rem))]">
          <div className="rounded-3xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            <GameCanvas
              stage={stage}
              usedEdges={engine.usedEdgeSet}
              currentNode={engine.currentNode}
              hintNodes={engine.hintNodes}
              oddView={oddView && oddViewAllowed}
              hitRadius={draw.hitRadius}
              pointerAt={draw.pointerAt}
              svgRef={draw.svgRef}
              handlers={draw.handlers}
              shake={shake}
            />
          </div>
          {counting && <Countdown onDone={() => {
            setCounting(false);
            engine.beginTimer();
          }} />}

          {/* 붓을 뗀 순간 — 한붓그리기 실패. 다시 그리기 외에는 길이 없다. */}
          {engine.status === 'broken' && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/90 px-6 text-center backdrop-blur-sm">
              <p className="animate-pop-in text-4xl" aria-hidden="true">
                ✏️
              </p>
              <p className="text-lg font-bold text-slate-900">
                {engine.maxStrokes > 1 ? '붓을 다 썼어요' : '붓을 뗐어요'}
              </p>
              <p className="text-sm leading-relaxed text-slate-600">
                {engine.maxStrokes > 1 ? (
                  <>
                    이 도형은 <b>{engine.maxStrokes}붓</b>까지만 쓸 수 있어요.
                    <br />
                    어디서 끊을지가 중요해요.
                  </>
                ) : (
                  <>
                    한붓그리기는 시작부터 끝까지 <b>한 번에 이어서</b> 그려야 해요.
                  </>
                )}
                <br />
                선 {engine.totalEdges - engine.remainingEdges}개까지 잘 갔어요. 다시 해볼까요?
              </p>
              <button
                type="button"
                onClick={engine.reset}
                className="mt-1 rounded-2xl bg-blue-600 px-8 py-3 text-base font-bold text-white"
              >
                다시 그리기
              </button>
            </div>
          )}
        </div>

        {engine.currentNode === null && !counting && (
          <p className="mt-2 text-center text-sm text-slate-600 landscape:text-xs">
            {engine.strokeIndex > 1 ? (
              <>
                <b className="text-violet-700">두 번째 붓</b>이에요. 남은 선이 있는{' '}
                <b className="text-slate-800">아무 점에서나</b> 다시 시작할 수 있어요.
              </>
            ) : engine.maxStrokes > 1 ? (
              <>
                이 도형은 <b className="text-violet-700">두 붓</b>으로 그립니다. 한 번은 떼도
                되지만, <b className="text-slate-800">두 번 떼면 처음부터</b>예요.
              </>
            ) : (
              <>
                시작할 점을 누른 채 이어진 점으로 끌어 보세요.
                <b className="text-slate-800"> 도중에 손을 떼면 처음부터 다시</b> 그려야 해요.
              </>
            )}
          </p>
        )}
      </div>

      {/*
        힌트·다시하기 버튼은 학생이 스스로 고민하도록 감췄다 (2026-09-01 작성자 결정).
        붓을 뗐을 때의 "다시 그리기"는 캔버스 오버레이에 남아 있어 복구는 언제든 가능하다.
        홀수점 보기는 교사가 "홀수점 보기 열기"를 켰을 때만 나타난다 — 수업 운영표의
        "정리 1 · 홀수점 개념 설명" 시점에 여는 용도다.
      */}
      {oddViewAllowed && (
        <div className="mt-3 landscape:mt-0 landscape:w-44 landscape:shrink-0">
          <ControlButton
            label="홀수점 보기"
            sub={oddView ? '켜짐' : '꺼짐'}
            icon="◉"
            onClick={() => setOddView((v) => !v)}
            active={oddView}
          />
        </div>
      )}

      <Toast message={toast?.message ?? null} tone={toast?.tone} onDismiss={() => setToast(null)} />
      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}

function ControlButton({
  label,
  sub,
  icon,
  onClick,
  disabled = false,
  highlight = false,
  active = false,
}: {
  label: string;
  sub?: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-1 py-2 text-xs font-semibold shadow-sm ring-1 transition-colors disabled:opacity-40 ${
        highlight
          ? 'bg-amber-100 text-amber-900 ring-amber-300'
          : active
            ? 'bg-teal-50 text-teal-800 ring-teal-300'
            : 'bg-white text-slate-700 ring-slate-200'
      }`}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {icon}
      </span>
      <span className="mt-1">{label}</span>
      {sub && <span className="text-[10px] font-normal text-slate-500">{sub}</span>}
    </button>
  );
}
