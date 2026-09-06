import { Link } from 'react-router-dom';
import type { StageLevel } from '../types';

export interface LevelSummary {
  level: StageLevel;
  title: string;
  hint: string;
  total: number;
  cleared: number;
  unlocked: boolean;
  /** 다음에 도전할 미션이 들어 있는 레벨. 목록에서 눈에 띄게 한다. */
  current: boolean;
}

/**
 * F2 · 레벨 카드.
 * 스테이지 60개를 한 화면에 늘어놓으면 세로 스크롤이 너무 길어져서,
 * 첫 화면은 레벨 6개만 보여주고 여기서 미션 목록으로 들어간다.
 */
export function LevelCard({ summary, index }: { summary: LevelSummary; index: number }) {
  const { level, title, hint, total, cleared, unlocked, current } = summary;
  const done = cleared === total && total > 0;
  const percent = total === 0 ? 0 : Math.round((cleared / total) * 100);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{level}레벨</p>
          <p className="mt-0.5 line-clamp-2 text-base font-bold text-slate-900">{title}</p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-lg">
          {unlocked ? (done ? '🏆' : '▶') : '🔒'}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-slate-500">
        {unlocked ? hint : '앞 레벨을 먼저 깨 주세요'}
      </p>

      <div className="mt-auto pt-3">
        <div className="flex items-baseline justify-between">
          <span
            className={`text-xs font-bold ${done ? 'text-emerald-600' : 'text-slate-600'}`}
          >
            {cleared} / {total}
          </span>
          {current && (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
              지금 여기
            </span>
          )}
        </div>
        {/* 색만으로 정보를 주지 않도록 숫자를 함께 보여준다 (PRD 7.4) */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </>
  );

  const base =
    'flex h-full flex-col rounded-2xl border p-4 text-left transition-transform active:scale-[0.98]';

  if (!unlocked) {
    return (
      <div
        className={`${base} border-slate-200 bg-slate-100 opacity-70`}
        aria-disabled="true"
        aria-label={`${level}레벨 잠김`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/stages/${level}`}
      className={`${base} bg-white shadow-sm hover:border-blue-300 ${
        current ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
      }`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {body}
    </Link>
  );
}
