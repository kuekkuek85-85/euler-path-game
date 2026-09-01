import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BONUS_STAGES, MAIN_STAGES } from '../data/stages';
import { StageCard } from '../components/StageCard';
import { ConceptCard } from '../components/ConceptCard';
import { useSession } from '../state/sessionStore';
import { classIdOf } from '../lib/format';

const tierHeadings: Record<number, { title: string; hint: string }> = {
  1: { title: '1단계 · 어디서 시작해도 된다', hint: '홀수점이 하나도 없는 도형들' },
  2: { title: '2단계 · 시작점을 골라야 한다', hint: '홀수점이 둘인 도형들' },
  3: { title: '3단계 · 규칙을 적용한다', hint: '복잡한 도형과 판별 미션' },
};

/** F2 · 스테이지 선택 — 잠금·별점·최고 기록을 한눈에 (PRD 5.1). */
export function StageSelect() {
  const { identity, profile, config, isUnlocked, signOut, pending } = useSession();
  const [conceptOpen, setConceptOpen] = useState(false);

  if (!identity) return <Navigate to="/" replace />;

  const tiers = [1, 2, 3] as const;

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

      {tiers.map((tier) => {
        const stages = MAIN_STAGES.filter((stage) => stage.tier === tier);
        if (stages.length === 0) return null;
        return (
          <section key={tier} className="mt-7">
            <h2 className="text-sm font-bold text-slate-800">{tierHeadings[tier].title}</h2>
            <p className="text-xs text-slate-500">{tierHeadings[tier].hint}</p>
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

      <section className="mt-8">
        <h2 className="text-sm font-bold text-slate-800">보너스</h2>
        <p className="text-xs text-slate-500">S12를 깨면 열립니다</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {BONUS_STAGES.map((stage, index) => (
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

      {conceptOpen && <ConceptCard onClose={() => setConceptOpen(false)} />}
    </main>
  );
}
