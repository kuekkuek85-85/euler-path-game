import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../state/sessionStore';
import { ClassTab, RankingTab, StageTimeTab } from '../components/Dashboard/DashboardTabs';
import { classIdOf } from '../lib/format';

type TabId = 'ranking' | 'stage' | 'class';

const TABS: { id: TabId; label: string }[] = [
  { id: 'ranking', label: '전체 랭킹' },
  { id: 'stage', label: '최단 시간' },
  { id: 'class', label: '우리 반' },
];

/**
 * F5 · 대시보드.
 * onSnapshot 리스너는 이 화면에서만 살아 있고, 나가면 해제된다 (PRD 5.4 / 7.2).
 * 각 탭 컴포넌트가 마운트될 때 구독하고 언마운트될 때 해제하므로
 * 보고 있는 탭 하나만 읽기를 발생시킨다.
 *
 * PRD 5.4의 "탭 4 · 실시간 피드"는 뺐다 (2026-09-01 작성자 결정).
 * plays 컬렉션을 통째로 실시간 구독해 클리어가 나올 때마다 읽기가 쌓이는,
 * 네 탭 중 부하가 가장 큰 화면이었다.
 */
export function Dashboard() {
  const { identity, config, remoteEnabled } = useSession();
  const [tab, setTab] = useState<TabId>('ranking');

  if (!identity) return <Navigate to="/" replace />;
  // 교사가 대시보드를 끄면 학생은 볼 수 없다 (AC-08).
  if (!config.dashboardVisible) return <Navigate to="/stages" replace />;

  const masking = config.nameMasking;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <Link to="/stages" className="text-sm font-semibold text-slate-500">
          ← 목록
        </Link>
        <h1 className="text-lg font-black text-slate-900">대시보드</h1>
        <span className="w-12" />
      </header>

      {!remoteEnabled && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          기록 서버가 설정되지 않아 순위를 불러올 수 없습니다. 교사용 안내(README)를 확인해 주세요.
        </p>
      )}

      <nav className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id}
            className={`rounded-xl py-2 text-xs font-bold transition-colors ${
              tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="mt-4">
        {tab === 'ranking' && (
          <RankingTab masking={masking} myStudentNo={identity.studentNo} />
        )}
        {tab === 'stage' && <StageTimeTab masking={masking} />}
        {tab === 'class' && (
          <ClassTab masking={masking} defaultClassId={classIdOf(identity.studentNo)} />
        )}
      </section>

      {masking && (
        <p className="mt-6 text-center text-xs text-slate-400">
          이름은 가운데 글자를 가려 표시합니다.
        </p>
      )}
    </main>
  );
}
