import { Link } from 'react-router-dom';
import type { Stage, StageRecord } from '../types';
import { formatDuration } from '../lib/format';

const tierLabel: Record<number, string> = {
  1: '1단계',
  2: '2단계',
  3: '3단계',
};

export function Stars({ count, size = 'text-base' }: { count: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`별 ${count}개`}>
      <span className="text-amber-400">{'★'.repeat(count)}</span>
      <span className="text-slate-300">{'★'.repeat(Math.max(0, 3 - count))}</span>
    </span>
  );
}

export function StageCard({
  stage,
  unlocked,
  record,
  index,
}: {
  stage: Stage;
  unlocked: boolean;
  record?: StageRecord;
  index: number;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">
            {tierLabel[stage.tier]} · {stage.id}
          </p>
          <p className="mt-0.5 text-base font-bold text-slate-900">{stage.name}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            stage.type === 'JUDGE'
              ? 'bg-violet-100 text-violet-700'
              : (stage.maxStrokes ?? 1) > 1
                ? 'bg-fuchsia-100 text-fuchsia-700'
                : 'bg-sky-100 text-sky-700'
          }`}
        >
          {stage.type === 'JUDGE'
            ? '판별'
            : (stage.maxStrokes ?? 1) > 1
              ? `${stage.maxStrokes}붓 · 선 ${stage.edges.length}`
              : `선 ${stage.edges.length}`}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between">
        {unlocked ? (
          record ? (
            <div>
              <Stars count={record.stars} />
              <p className="mt-1 text-xs text-slate-500">
                {record.score}점 · {stage.type === 'DRAW' ? formatDuration(record.timeMs) : '정답'}
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold text-blue-600">도전하기</p>
          )
        ) : (
          <p className="text-xs text-slate-400">앞 스테이지를 먼저 깨 주세요</p>
        )}
        <span aria-hidden="true" className="text-lg">
          {unlocked ? (record ? '✅' : '▶') : '🔒'}
        </span>
      </div>
    </>
  );

  const baseClass =
    'block rounded-2xl border p-4 text-left transition-transform active:scale-[0.98]';

  if (!unlocked) {
    return (
      <div
        className={`${baseClass} border-slate-200 bg-slate-100 opacity-70`}
        aria-disabled="true"
        aria-label={`${stage.name} 잠김`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/play/${stage.id}`}
      className={`${baseClass} border-slate-200 bg-white shadow-sm hover:border-blue-300`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      {body}
    </Link>
  );
}
