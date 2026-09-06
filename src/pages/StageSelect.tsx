import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LEVELS, STAGES_BY_LEVEL, nextStage } from '../data/stages';
import type { StageLevel } from '../types';
import { StageCard } from '../components/StageCard';
import { LevelCard, type LevelSummary } from '../components/LevelCard';
import { ConceptCard } from '../components/ConceptCard';
import { useSession } from '../state/sessionStore';
import { classIdOf } from '../lib/format';

const levelHeadings: Record<number, { title: string; hint: string }> = {
  1: { title: '첫걸음', hint: '점과 선이 적은 도형부터 차근차근' },
  2: { title: '길이 많아진다', hint: '선이 많아도 규칙은 똑같아요' },
  3: { title: '진짜 도전', hint: '점도 선도 많아요. 천천히 길을 그려 보세요' },
  4: { title: '별자리', hint: '밤하늘에서 본 듯한 도형들' },
  5: { title: '얽힌 길', hint: '선이 겹치고 지나쳐도 규칙은 그대로예요' },
  6: { title: '마지막 관문', hint: '여기까지 왔다면 이미 고수예요' },
};

/** 두 화면이 함께 쓰는 머리말 — 학생 정보와 저장 대기 배지. */
function StudentHeader({ title, back }: { title: string; back?: string }) {
  const { identity, profile, signOut, pending } = useSession();
  if (!identity) return null;
  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <Link
              to={back}
              className="-ml-1 inline-block rounded-full px-1 py-0.5 text-sm font-semibold text-slate-500"
            >
              ← 레벨 선택
            </Link>
          )}
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-1.5 text-sm text-slate-600">
            <span className="whitespace-nowrap">
              {classIdOf(identity.studentNo)}반 {identity.name}
            </span>
            <span className="whitespace-nowrap">
              · 총점 <b className="text-slate-900">{profile?.totalScore ?? 0}</b>점
            </span>
            <span className="whitespace-nowrap">· 클리어 {profile?.clearedCount ?? 0}개</span>
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          학번 변경
        </button>
      </header>

      {pending > 0 && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          기록 저장 대기 중 ({pending}건) — 인터넷이 돌아오면 자동으로 저장됩니다.
        </p>
      )}
    </>
  );
}

/**
 * F2 · 레벨 선택 (PRD 5.1).
 * 미션이 60개로 늘면서 한 화면에 다 늘어놓으면 세로 스크롤이 너무 길어졌다.
 * 첫 화면은 레벨 6개만 보여주고, 미션은 `/stages/:level`에서 고른다.
 */
export function StageSelect() {
  const { identity, profile, config, isUnlocked } = useSession();
  const [conceptOpen, setConceptOpen] = useState(false);

  if (!identity) return <Navigate to="/" replace />;

  const next = nextStage(profile?.best);
  const summaries: LevelSummary[] = LEVELS.filter(
    (level) => STAGES_BY_LEVEL[level].length > 0,
  ).map((level) => {
    const stages = STAGES_BY_LEVEL[level];
    return {
      level,
      title: levelHeadings[level].title,
      hint: levelHeadings[level].hint,
      total: stages.length,
      cleared: stages.filter((stage) => profile?.best[stage.id]).length,
      unlocked: isUnlocked(stages[0].id),
      current: next?.tier === level,
    };
  });

  /** 아직 데이터가 없는 첫 레벨. 있으면 "준비 중" 안내를 띄운다. */
  const comingLevel = LEVELS.find((level) => STAGES_BY_LEVEL[level].length === 0);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5">
      <StudentHeader title="레벨 선택" />

      <nav className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setConceptOpen(true)}
          className="flex-1 rounded-2xl bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
        >
          📘 개념 카드
        </button>
        {config.dashboardVisible && (
          <Link
            to="/dashboard"
            className="flex-1 rounded-2xl bg-white px-3 py-2.5 text-center text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
          >
            🏆 대시보드
          </Link>
        )}
      </nav>

      {next ? (
        <Link
          to={`/play/${next.id}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-sm active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-blue-100">이어서 하기</span>
            <span className="block truncate text-base font-bold">
              {next.tier}레벨 · {next.name}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-xl">
            ▶
          </span>
        </Link>
      ) : (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-800">
          🏆 모든 미션을 깼어요! 최고 기록에 도전해 볼까요?
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {summaries.map((summary, index) => (
          <LevelCard key={summary.level} summary={summary} index={index} />
        ))}
      </div>

      {comingLevel && (
        <p className="mt-6 rounded-2xl bg-white px-4 py-3 text-center text-xs text-slate-500 ring-1 ring-slate-200">
          {comingLevel}레벨은 준비 중이에요. 조금만 기다려 주세요!
        </p>
      )}

      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}

/** F2-2 · 한 레벨의 미션 10개. 뒤로 가기로 레벨 선택 화면에 돌아간다. */
export function LevelStages() {
  const { level: levelParam = '' } = useParams();
  const { identity, profile, isUnlocked } = useSession();
  const [conceptOpen, setConceptOpen] = useState(false);

  if (!identity) return <Navigate to="/" replace />;

  const level = Number(levelParam) as StageLevel;
  const stages = LEVELS.includes(level) ? STAGES_BY_LEVEL[level] : [];
  if (stages.length === 0) return <Navigate to="/stages" replace />;

  const heading = levelHeadings[level];
  const cleared = stages.filter((stage) => profile?.best[stage.id]).length;
  const next = nextStage(profile?.best);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5">
      <StudentHeader title={`${level}레벨 · ${heading.title}`} back="/stages" />

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="text-xs text-slate-500">{heading.hint}</p>
        <span className="shrink-0 text-xs font-bold text-slate-600">
          {cleared} / {stages.length}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={index}
            unlocked={isUnlocked(stage.id)}
            record={profile?.best[stage.id]}
            current={next?.id === stage.id}
          />
        ))}
      </div>

      <Link
        to="/stages"
        className="mt-6 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
      >
        ← 레벨 선택으로
      </Link>

      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}
