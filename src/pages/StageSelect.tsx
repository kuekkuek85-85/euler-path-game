import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LEVELS, STAGES_BY_LEVEL } from '../data/stages';
import { StageCard } from '../components/StageCard';
import { ConceptCard } from '../components/ConceptCard';
import { useSession } from '../state/sessionStore';
import { classIdOf } from '../lib/format';

const levelHeadings: Record<number, { title: string; hint: string }> = {
  1: { title: '1레벨 · 한붓그리기 첫걸음', hint: '점과 선이 적은 도형부터 차근차근' },
  2: { title: '2레벨 · 길이 많아진다', hint: '선이 많아도 규칙은 똑같아요' },
  3: { title: '3레벨 · 진짜 도전', hint: '점도 선도 많아요. 천천히 길을 그려 보세요' },
};

/** F2 · 스테이지 선택 — 잠금·별점·최고 기록을 한눈에 (PRD 5.1). */
export function StageSelect() {
  const { identity, profile, config, isUnlocked, signOut, pending } = useSession();
  const [conceptOpen, setConceptOpen] = useState(false);

  if (!identity) return <Navigate to="/" replace />;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">스테이지</h1>
          <p className="mt-1 text-sm text-slate-600">
            {classIdOf(identity.studentNo)}반 {identity.name} · 총점{' '}
            <b className="text-slate-900">{profile?.totalScore ?? 0}</b>점 · 클리어{' '}
            {profile?.clearedCount ?? 0}개
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

      {LEVELS.map((level) => {
        const stages = STAGES_BY_LEVEL[level];
        if (stages.length === 0) return null;
        const cleared = stages.filter((stage) => profile?.best[stage.id]).length;
        return (
          <section key={level} className="mt-7">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">{levelHeadings[level].title}</h2>
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                {cleared} / {stages.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">{levelHeadings[level].hint}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {stages.map((stage, index) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  index={index}
                  unlocked={isUnlocked(stage.id)}
                  record={profile?.best[stage.id]}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 아직 데이터가 없는 레벨은 위 루프에서 통째로 빠지므로, 여기서 안내만 남긴다 */}
      {STAGES_BY_LEVEL[3].length === 0 && (
        <p className="mt-8 rounded-2xl bg-white px-4 py-3 text-center text-xs text-slate-500 ring-1 ring-slate-200">
          3레벨은 준비 중이에요. 조금만 기다려 주세요!
        </p>
      )}

      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}
