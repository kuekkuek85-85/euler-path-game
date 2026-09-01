import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ScoreResult } from '../types';
import { getStage, nextStageId } from '../data/stages';
import { Stars } from '../components/StageCard';
import { formatDuration } from '../lib/format';
import { useSession } from '../state/sessionStore';

interface ResultState {
  stageId: string;
  stageName: string;
  edgeCount: number;
  parTimeSec: number;
  timeMs: number;
  result: ScoreResult;
  improved: boolean;
  totalScore: number;
  clearMessage?: string;
  judge?: boolean;
  generated?: boolean;
}

/** F4 · 결과 — 별점·점수·소요시간과 다음 행동 (PRD 5.1). */
export function Result() {
  const location = useLocation();
  const { isUnlocked, pending } = useSession();
  const state = location.state as ResultState | null;

  // 새로고침 등으로 결과 데이터가 없으면 목록으로 돌려보낸다.
  if (!state) return <Navigate to="/stages" replace />;

  const next = nextStageId(state.stageId);
  const nextStage = next ? getStage(next) : undefined;
  const nextAvailable = next ? isUnlocked(next) : false;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-8">
      <section className="animate-pop-in rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-blue-600">
          {state.stageId} · {state.stageName}
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">클리어!</h1>

        <div className="mt-3">
          <Stars count={state.result.stars} size="text-4xl" />
        </div>

        <p className="mt-3 text-4xl font-black text-slate-900">
          {state.result.score}
          <span className="ml-1 text-lg font-bold text-slate-500">점</span>
        </p>
        {state.improved ? (
          <p className="mt-1 text-sm font-semibold text-emerald-600">최고 기록을 새로 세웠어요!</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            이전 최고 기록이 더 높아 총점은 그대로예요.
          </p>
        )}

        <dl className="mt-5 space-y-1.5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm text-slate-700">
          {!state.judge && (
            <div className="flex justify-between">
              <dt>소요 시간</dt>
              <dd className="font-semibold">
                {formatDuration(state.timeMs)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  (기준 {state.parTimeSec}초)
                </span>
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>기본 점수</dt>
            <dd className="font-semibold">{state.result.base}</dd>
          </div>
          {!state.judge && (
            <>
              <div className="flex justify-between">
                <dt>시간 보너스</dt>
                <dd className="font-semibold text-emerald-700">+{state.result.timeBonus}</dd>
              </div>
              <div className="flex justify-between">
                <dt>차감</dt>
                <dd
                  className={`font-semibold ${state.result.penalty > 0 ? 'text-rose-600' : 'text-slate-500'}`}
                >
                  {state.result.penalty > 0 ? `-${state.result.penalty}` : '없음'}
                </dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1.5">
            <dt>누적 총점</dt>
            <dd className="font-bold text-slate-900">{state.totalScore}점</dd>
          </div>
        </dl>

        {state.clearMessage && (
          <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-medium leading-relaxed text-blue-900">
            {state.clearMessage}
          </p>
        )}

        {pending > 0 && (
          <p className="mt-3 text-xs font-semibold text-amber-700">
            기록 저장 대기 중 — 인터넷이 돌아오면 자동으로 저장됩니다.
          </p>
        )}
      </section>

      <div className="mt-5 space-y-2">
        {nextStage && nextAvailable ? (
          <Link
            to={`/play/${nextStage.id}`}
            className="block rounded-2xl bg-blue-600 py-4 text-center text-lg font-bold text-white"
          >
            다음 스테이지 · {nextStage.name}
          </Link>
        ) : null}
        <Link
          to={`/play/${state.stageId}`}
          className="block rounded-2xl bg-white py-3.5 text-center font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
        >
          {state.generated ? '새 도형으로 다시' : '다시 도전'}
        </Link>
        <Link
          to="/stages"
          className="block rounded-2xl py-3 text-center font-semibold text-slate-500"
        >
          스테이지 목록으로
        </Link>
      </div>
    </main>
  );
}
