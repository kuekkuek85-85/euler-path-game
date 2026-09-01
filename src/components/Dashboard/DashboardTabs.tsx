import { useEffect, useMemo, useState } from 'react';
import type { StageRecord } from '../../types';
import {
  type FeedRow,
  type RankingRow,
  type StageTimeRow,
  subscribeClass,
  subscribeClassBest,
  subscribeFeed,
  subscribeRanking,
  subscribeStageTimes,
} from '../../lib/repository';
import { MAIN_STAGES, STAGE_BY_ID, STAGES } from '../../data/stages';
import { displayName, formatDuration, formatRelativeTime, shortNo } from '../../lib/format';
import { Stars } from '../StageCard';

const EMPTY_HINT = '아직 기록이 없어요. 먼저 도전해 보세요!';

function RowShell({ children }: { children: React.ReactNode }) {
  return <ol className="mt-3 space-y-1.5">{children}</ol>;
}

function Empty() {
  return <p className="mt-6 text-center text-sm text-slate-500">{EMPTY_HINT}</p>;
}

function rankColor(index: number): string {
  if (index === 0) return 'bg-amber-100 text-amber-800';
  if (index === 1) return 'bg-slate-200 text-slate-700';
  if (index === 2) return 'bg-orange-100 text-orange-800';
  return 'bg-slate-100 text-slate-600';
}

/** 탭 1 · 전체 랭킹 — 총점 상위 20명. 하위 순위는 공개하지 않는다 (PRD 7.4). */
export function RankingTab({
  masking,
  myStudentNo,
  presentation = false,
}: {
  masking: boolean;
  myStudentNo?: string;
  presentation?: boolean;
}) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const count = presentation ? 10 : 20;

  useEffect(() => subscribeRanking(count, setRows), [count]);

  const myRank = myStudentNo ? rows.findIndex((r) => r.studentNo === myStudentNo) : -1;

  if (rows.length === 0) return <Empty />;

  return (
    <div>
      <RowShell>
        {rows.map((row, index) => (
          <li
            key={row.studentNo}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
              row.studentNo === myStudentNo ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-white'
            } ${presentation ? 'text-lg' : 'text-sm'}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankColor(index)}`}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
              {row.classId}반 {shortNo(row.studentNo)}번 {displayName(row.name, masking)}
            </span>
            <span className="shrink-0 text-xs text-slate-500">{row.clearedCount}개</span>
            <span className="shrink-0 font-bold text-slate-900">{row.totalScore}</span>
          </li>
        ))}
      </RowShell>
      {myStudentNo && myRank < 0 && (
        <p className="mt-3 text-center text-xs text-slate-500">
          내 순위는 상위 {count}명 밖이에요. 스테이지를 더 깨 볼까요?
        </p>
      )}
    </div>
  );
}

/** 탭 2 · 스테이지별 최단 시간 — 스테이지를 고르고 상위 10명. */
export function StageTimeTab({ masking }: { masking: boolean }) {
  const drawStages = useMemo(() => STAGES.filter((s) => s.type === 'DRAW' && !s.generated), []);
  const [stageId, setStageId] = useState(drawStages[0]?.id ?? 'S01');
  const [rows, setRows] = useState<StageTimeRow[]>([]);

  useEffect(() => subscribeStageTimes(stageId, 10, setRows), [stageId]);

  return (
    <div>
      <label htmlFor="stagePick" className="sr-only">
        스테이지 선택
      </label>
      <select
        id="stagePick"
        value={stageId}
        onChange={(event) => setStageId(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"
      >
        {drawStages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.id} · {stage.name}
          </option>
        ))}
      </select>

      {rows.length === 0 ? (
        <Empty />
      ) : (
        <RowShell>
          {rows.map((row, index) => (
            <li
              key={`${row.studentNo}-${index}`}
              className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-sm"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankColor(index)}`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                {row.classId}반 {shortNo(row.studentNo)}번 {displayName(row.name, masking)}
              </span>
              <Stars count={row.stars} size="text-xs" />
              <span className="shrink-0 font-bold text-slate-900">{formatDuration(row.timeMs)}</span>
            </li>
          ))}
        </RowShell>
      )}
    </div>
  );
}

const CLASS_IDS = Array.from({ length: 12 }, (_, i) => `1-${i + 1}`);

/** 탭 3 · 우리 반 — 학급 평균 클리어 수와 스테이지별 클리어 인원. */
export function ClassTab({
  masking,
  defaultClassId,
  presentation = false,
}: {
  masking: boolean;
  defaultClassId?: string;
  presentation?: boolean;
}) {
  const [classId, setClassId] = useState(defaultClassId ?? CLASS_IDS[0]);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [bests, setBests] = useState<{ studentNo: string; best: Record<string, StageRecord> }[]>([]);

  useEffect(() => subscribeClass(classId, setRows), [classId]);
  useEffect(() => subscribeClassBest(classId, setBests), [classId]);

  const averageCleared =
    rows.length === 0 ? 0 : rows.reduce((sum, r) => sum + r.clearedCount, 0) / rows.length;

  const clearedByStage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stage of MAIN_STAGES) counts.set(stage.id, 0);
    for (const entry of bests) {
      for (const stageId of Object.keys(entry.best)) {
        if (counts.has(stageId)) counts.set(stageId, (counts.get(stageId) ?? 0) + 1);
      }
    }
    return counts;
  }, [bests]);

  const maxCount = Math.max(1, ...clearedByStage.values());

  return (
    <div>
      <label htmlFor="classPick" className="sr-only">
        학급 선택
      </label>
      <select
        id="classPick"
        value={classId}
        onChange={(event) => setClassId(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"
      >
        {CLASS_IDS.map((id) => (
          <option key={id} value={id}>
            {id}반
          </option>
        ))}
      </select>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white px-3 py-3 text-center">
          <p className="text-xs text-slate-500">참여 학생</p>
          <p className={`font-black text-slate-900 ${presentation ? 'text-3xl' : 'text-xl'}`}>
            {rows.length}명
          </p>
        </div>
        <div className="rounded-2xl bg-white px-3 py-3 text-center">
          <p className="text-xs text-slate-500">평균 클리어</p>
          <p className={`font-black text-slate-900 ${presentation ? 'text-3xl' : 'text-xl'}`}>
            {averageCleared.toFixed(1)}개
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {MAIN_STAGES.map((stage) => {
          const count = clearedByStage.get(stage.id) ?? 0;
          return (
            <li key={stage.id} className="rounded-2xl bg-white px-3 py-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="truncate">
                  {stage.id} · {stage.name}
                </span>
                <span className="shrink-0 text-slate-900">{count}명</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {!presentation && rows.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {rows.slice(0, 10).map((row, index) => (
            <li
              key={row.studentNo}
              className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 text-sm"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${rankColor(index)}`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                {shortNo(row.studentNo)}번 {displayName(row.name, masking)}
              </span>
              <span className="shrink-0 font-bold text-slate-900">{row.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 탭 4 · 실시간 피드 — 최근 클리어 20건. */
export function FeedTab({ masking }: { masking: boolean }) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeFeed(20, setRows), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (rows.length === 0) return <Empty />;

  return (
    <RowShell>
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl bg-white px-3 py-2.5 text-sm">
          <p className="text-slate-800">
            <b>
              {row.classId}반 {displayName(row.name, masking)}
            </b>{' '}
            학생이 <b>{STAGE_BY_ID[row.stageId]?.name ?? row.stageId}</b>을(를) 깼습니다!
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{formatRelativeTime(row.createdAt, now)}</p>
        </li>
      ))}
    </RowShell>
  );
}
