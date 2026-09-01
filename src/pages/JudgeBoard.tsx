import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Stage } from '../types';
import { minStrokes, oddNodes } from '../lib/graph';
import { calcJudgeScore } from '../lib/scoring';
import { GameCanvas } from '../components/GameCanvas';
import { ConceptCard } from '../components/ConceptCard';
import { useSession } from '../state/sessionStore';

type Phase = 'solvable' | 'strokes' | 'explained';

const EMPTY_USED = new Set<string>();

/**
 * F3 변형 · 판별 미션 (PRD 3.5).
 * 그리는 대신 (1) 가능/불가능 (2) 최소 붓 횟수를 답한다.
 * 오답이면 1회 재시도 후 해설을 공개한다.
 */
export function JudgeBoard({ stage }: { stage: Stage }) {
  const navigate = useNavigate();
  const { submitResult } = useSession();
  const [phase, setPhase] = useState<Phase>('solvable');
  /** 문항별 오답 횟수의 합. 0이면 만점 (PRD 3.5). */
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conceptOpen, setConceptOpen] = useState(false);
  const [showOdd, setShowOdd] = useState(false);

  const answer = stage.answer;
  const odd = useMemo(() => oddNodes(stage), [stage]);
  const strokes = useMemo(() => minStrokes(stage), [stage]);
  const startedAt = useMemo(() => Date.now(), []);

  const finish = () => {
    const result = calcJudgeScore(mistakes);
    const timeMs = Date.now() - startedAt;
    const { improved, totalScore } = submitResult({
      stage,
      record: { score: result.score, timeMs, stars: result.stars },
      play: {
        stageId: stage.id,
        cleared: true,
        timeMs,
        score: result.score,
        stars: result.stars,
        undoCount: 0,
        hintCount: 0,
        path: [],
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
        judge: true,
      },
    });
  };

  /** 문항별로 오답 1회까지는 재시도, 두 번째 오답이면 해설을 공개한다 (PRD 3.5). */
  const [solvableWrong, setSolvableWrong] = useState(0);
  const [strokesWrong, setStrokesWrong] = useState(0);

  const answerSolvable = (choice: boolean) => {
    if (!answer) return;
    if (choice === answer.solvable) {
      setFeedback(null);
      setShowOdd(true);
      // 불가능한 도형이면 최소 붓 횟수까지 이어서 묻는다.
      setPhase(answer.solvable ? 'explained' : 'strokes');
      return;
    }
    setMistakes((m) => m + 1);
    const wrong = solvableWrong + 1;
    setSolvableWrong(wrong);
    if (wrong >= 2) {
      setShowOdd(true);
      setPhase('explained');
      setFeedback('괜찮아요. 아래 해설을 함께 봅시다.');
      return;
    }
    setFeedback('다시 한 번 세어 볼까요? 각 점에 붙은 선의 개수를 확인해 보세요.');
  };

  const answerStrokes = (choice: number) => {
    if (!answer) return;
    if (choice === answer.minStrokes) {
      setFeedback(null);
      setShowOdd(true);
      setPhase('explained');
      return;
    }
    setMistakes((m) => m + 1);
    const wrong = strokesWrong + 1;
    setStrokesWrong(wrong);
    if (wrong >= 2) {
      setShowOdd(true);
      setPhase('explained');
      setFeedback('홀수점 개수 ÷ 2가 최소 붓 횟수예요. 해설을 볼까요?');
      return;
    }
    setFeedback('홀수점이 몇 개인지 먼저 세어 보세요.');
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-3 pb-10 pt-3">
      <header className="flex items-center justify-between gap-2">
        <Link to="/stages" className="rounded-full px-2 py-1 text-sm font-semibold text-slate-500">
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

      <p className="mt-2 rounded-2xl bg-violet-50 px-4 py-2 text-center text-sm font-semibold text-violet-800">
        판별 미션 — 그리지 말고 판단해 보세요
      </p>

      <div className="mx-auto mt-3 w-[94%] max-w-[520px]">
        <div className="rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
          <GameCanvas
            stage={stage}
            usedEdges={EMPTY_USED}
            currentNode={null}
            oddView={showOdd}
            emphasizeOdd={showOdd ? odd : undefined}
          />
        </div>
      </div>

      {phase === 'solvable' && (
        <section className="mt-5">
          <h2 className="text-center text-base font-bold text-slate-900">
            이 도형은 한붓그리기가 가능할까요?
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => answerSolvable(true)}
              className="rounded-2xl bg-teal-600 py-4 text-lg font-bold text-white"
            >
              가능하다
            </button>
            <button
              type="button"
              onClick={() => answerSolvable(false)}
              className="rounded-2xl bg-orange-600 py-4 text-lg font-bold text-white"
            >
              불가능하다
            </button>
          </div>
        </section>
      )}

      {phase === 'strokes' && (
        <section className="mt-5">
          <h2 className="text-center text-base font-bold text-slate-900">
            그렇다면 붓을 최소 몇 번 써야 할까요?
          </h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => answerStrokes(n)}
                className="rounded-2xl bg-slate-800 py-4 text-lg font-bold text-white"
              >
                {n}번
              </button>
            ))}
          </div>
        </section>
      )}

      {feedback && (
        <p role="status" className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {feedback}
        </p>
      )}

      {phase === 'explained' && (
        <section className="animate-pop-in mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-base font-bold text-slate-900">해설</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {stage.nodes.map((node) => {
              const isOdd = odd.includes(node.id);
              return (
                <span
                  key={node.id}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isOdd ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'
                  }`}
                >
                  {node.label ?? node.id} · {isOdd ? '홀수점' : '짝수점'}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{stage.explanation}</p>
          <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
            홀수점 {odd.length}개 → {answer?.solvable ? '한붓그리기 가능' : '한붓그리기 불가능'} ·
            최소 {strokes}붓
          </p>
          <button
            type="button"
            onClick={finish}
            className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-base font-bold text-white"
          >
            확인했어요
          </button>
        </section>
      )}

      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}
