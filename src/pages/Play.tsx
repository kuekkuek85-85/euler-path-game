import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Stage } from '../types';
import { getStage } from '../data/stages';
import { oddNodes, startHintCandidates } from '../lib/graph';
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

/**
 * 붓을 뗀 뒤 오버레이가 저절로 걷히기까지의 시간.
 * 오버레이를 벗어나는 길은 판을 처음으로 되돌리는 것뿐이라, 사라진다는 것은
 * 곧 "다시 그리기"를 대신 눌러 준다는 뜻이다. 손이 미끄러졌을 때 매번
 * 버튼을 찾아 누르게 하지 않는다 (PRD 7.4).
 */
const BROKEN_AUTO_RESET_MS = 3000;

/** 힌트 단계별로 확인창에 띄우는 설명. 학생이 무엇을 사는지 알고 누르게 한다. */
const HINT_STEP_TEXT = [
  '시작점이 들어 있는 넓은 범위를 반짝여 줘요.',
  '범위를 더 좁혀서 반짝여 줘요.',
  '시작점 후보를 두 개만 콕 집어 반짝여 줘요.',
];

/** 힌트를 받은 뒤 띄우는 안내. 회로형(홀수점 0개)은 "어디서나 된다"는 것이 핵심이다. */
function hintMessage(level: number, oddCount: number, shown: number): string {
  if (oddCount === 0) {
    return level >= 3
      ? '이 도형은 홀수점이 없어서 사실 어느 점에서 시작해도 돼요. 반짝이는 두 점 중 하나로 해 볼까요?'
      : `이 도형은 홀수점이 없어서 어느 점에서 시작해도 돼요. 반짝이는 ${shown}개 중에서 골라 보세요.`;
  }
  if (level >= 3) return '반짝이는 두 점이 시작점이에요. 선이 홀수 개 모인 점이죠.';
  if (level === 2) return `범위를 좁혔어요. 반짝이는 ${shown}개 안에 시작점이 있어요.`;
  return `반짝이는 ${shown}개 안에 시작점이 있어요.`;
}

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
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const [stuckStreak, setStuckStreak] = useState(0);
  /** 힌트 확인창. 실수로 눌러서 점수를 잃지 않도록 한 번 물어본다. */
  const [hintAsk, setHintAsk] = useState(false);
  const submitted = useRef(false);
  const wasStuck = useRef(false);
  /** 같은 문구가 다시 떠도 3초를 새로 세도록 매번 다른 id를 붙인다. */
  const toastSeq = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, tone });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const oddCount = useMemo(() => oddNodes(stage).length, [stage]);

  /** 확인창에서 "받을게요"를 눌렀을 때. 여기서만 감점이 일어난다. */
  const takeHint = useCallback(() => {
    setHintAsk(false);
    if (!engine.canHint) return;
    const level = engine.hintLevel + 1;
    const shown = startHintCandidates(stage, level).length;
    engine.hint();
    navigator.vibrate?.(15);
    showToast(hintMessage(level, oddCount, shown), 'info');
  }, [engine, oddCount, showToast, stage]);

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
    if (streak >= 3 && engine.canHint) {
      showToast('막히면 아래 "시작점 힌트"를 눌러 보세요. 점수는 조금 깎여요.', 'warn');
    } else if (streak >= 3 && oddCount === 2) {
      showToast('시작점을 바꿔볼까요? 선이 홀수 개 모인 점에서 출발해 보세요.', 'warn');
    } else {
      showToast('이 길로는 다 못 지나가요. 다시 그려 볼까요?', 'warn');
    }
  }, [engine.canHint, engine.status, oddCount, showToast, stuckStreak]);

  // 붓을 뗐을 때 — 안내는 캔버스 위 오버레이가 하므로 진동만 준다.
  // 3초 뒤에는 오버레이를 스스로 걷고 판을 처음으로 되돌린다 (작성자 요청).
  useEffect(() => {
    if (engine.status !== 'broken') return;
    navigator.vibrate?.([15, 40, 15]);
    const timer = window.setTimeout(engine.reset, BROKEN_AUTO_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [engine.reset, engine.status]);

  // 두붓 스테이지에서 다음 붓으로 넘어갔을 때
  useEffect(() => {
    if (engine.strokeIndex <= 1) return;
    navigator.vibrate?.(20);
    showToast(
      `${engine.strokeIndex}번째 붓이에요. 남은 선이 있는 아무 점에서나 시작하세요.`,
      'info',
    );
  }, [engine.strokeIndex, showToast]);

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
            to={`/stages/${stage.tier}`}
            className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500"
            aria-label={`${stage.tier}레벨 미션 목록으로`}
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
              {/* 3초 뒤 저절로 다시 시작한다는 것을 눈으로도 알려 준다 */}
              <div className="w-40">
                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="countdown-bar h-full w-full rounded-full bg-blue-400" />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">잠시 뒤 저절로 다시 시작해요</p>
              </div>
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
        다시하기 버튼은 학생이 스스로 고민하도록 여전히 감춰 둔다 (2026-09-01 작성자 결정).
        붓을 뗐을 때의 "다시 그리기"는 캔버스 오버레이에 남아 있어 복구는 언제든 가능하다.
        힌트는 2026-09-07 작성자 요청으로 되살렸다 — 단계마다 감점이 있고, 누르기 전에
        얼마가 깎이는지 버튼과 확인창에서 보여 준다.
        홀수점 보기는 교사가 "홀수점 보기 열기"를 켰을 때만 나타난다 — 수업 운영표의
        "정리 1 · 홀수점 개념 설명" 시점에 여는 용도다.
      */}
      <div className="mt-3 landscape:mt-0 landscape:w-44 landscape:shrink-0">
        <div
          className={`grid gap-2 landscape:grid-cols-1 ${oddViewAllowed ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          <ControlButton
            label="시작점 힌트"
            sub={
              engine.canHint
                ? `${engine.hintLevel + 1}단계 · -${engine.nextHintPenalty}점`
                : '다 썼어요 (3/3)'
            }
            icon="💡"
            onClick={() => setHintAsk(true)}
            disabled={counting || !engine.canHint}
            highlight={engine.hintLevel > 0}
          />
          {oddViewAllowed && (
            <ControlButton
              label="홀수점 보기"
              sub={oddView ? '켜짐' : '꺼짐'}
              icon="◉"
              onClick={() => setOddView((v) => !v)}
              active={oddView}
            />
          )}
        </div>
      </div>

      {/* 힌트 확인창 — 실수로 눌러 점수를 잃는 일을 막는다. 감점은 "받을게요"에서만 일어난다. */}
      {hintAsk && engine.canHint && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hint-ask-title"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
            <p className="text-center text-3xl" aria-hidden="true">
              💡
            </p>
            <h2 id="hint-ask-title" className="mt-2 text-center text-lg font-bold text-slate-900">
              시작점 힌트 {engine.hintLevel + 1}단계
            </h2>
            <p className="mt-1 text-center text-sm leading-relaxed text-slate-600">
              {HINT_STEP_TEXT[engine.hintLevel]}
            </p>
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-700">
              점수에서 {engine.nextHintPenalty}점이 깎여요
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setHintAsk(false)}
                className="min-h-[48px] rounded-2xl bg-slate-100 text-base font-bold text-slate-700"
              >
                안 받을래요
              </button>
              <button
                type="button"
                onClick={takeHint}
                className="min-h-[48px] rounded-2xl bg-amber-500 text-base font-bold text-white"
              >
                받을게요
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        key={toast?.id ?? 'idle'}
        message={toast?.message ?? null}
        tone={toast?.tone}
        onDismiss={dismissToast}
      />
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
