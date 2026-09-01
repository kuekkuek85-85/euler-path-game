import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GlobalConfig, StudentProfile } from '../types';
import { STAGES } from '../data/stages';
import {
  deleteStudent,
  ensureConfigDoc,
  listAllStudents,
  readLocalConfig,
  saveConfig,
  subscribeConfig,
} from '../lib/repository';
import { type CheckResult, runConnectionCheck } from '../lib/diagnostics';
import { classIdOf, displayName, toCsv } from '../lib/format';
import { STORAGE_KEYS, readJson, writeJson } from '../lib/storage';
import { ClassTab, RankingTab } from '../components/Dashboard/DashboardTabs';
import { useSession } from '../state/sessionStore';

const TEACHER_PIN = import.meta.env.VITE_TEACHER_PIN ?? '';

/** F7 · 교사 모드. PIN은 환경변수로만 주입한다 (PRD 5.5 — 코드에 하드코딩 금지). */
export function Teacher() {
  const [unlocked, setUnlocked] = useState(() =>
    readJson<boolean>(STORAGE_KEYS.teacherUnlocked, false),
  );

  if (!TEACHER_PIN) {
    return (
      <Shell>
        <p className="rounded-2xl bg-rose-50 px-4 py-4 text-sm leading-relaxed text-rose-800">
          교사 모드 PIN이 설정되지 않았습니다. 배포 환경변수 <code>VITE_TEACHER_PIN</code>에 6자리
          숫자를 넣고 다시 배포해 주세요.
        </p>
      </Shell>
    );
  }

  if (!unlocked) {
    return (
      <Shell>
        <PinGate
          onUnlock={() => {
            writeJson(STORAGE_KEYS.teacherUnlocked, true);
            setUnlocked(true);
          }}
        />
      </Shell>
    );
  }

  return <TeacherConsole />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-black text-slate-900">교사 모드</h1>
        <p className="mt-1 text-sm text-slate-600">한붓 챌린지 수업 운영 도구</p>
      </header>
      <div className="mt-6">{children}</div>
      <Link to="/" className="mt-6 text-center text-sm font-semibold text-slate-500">
        학생 화면으로
      </Link>
    </main>
  );
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pin === TEACHER_PIN) {
      onUnlock();
      return;
    }
    setError('PIN이 맞지 않습니다.');
    setPin('');
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="pin" className="block text-sm font-semibold text-slate-700">
        PIN 6자리
      </label>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em]"
      />
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <button type="submit" className="w-full rounded-2xl bg-slate-900 py-3.5 font-bold text-white">
        확인
      </button>
    </form>
  );
}

function TeacherConsole() {
  const { config: liveConfig, remoteEnabled } = useSession();
  const [config, setConfig] = useState<GlobalConfig>(() => readLocalConfig());
  const [status, setStatus] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [students, setStudents] = useState<StudentProfile[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeConfig(setConfig), []);

  // 설정 문서가 없으면 여기서 만든다. 선생님이 콘솔에서 손으로 만들 필요가 없다.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const outcome = await ensureConfigDoc();
      if (cancelled) return;
      if (outcome.status === 'created') setStatus('교사 설정 문서를 새로 만들었습니다.');
      else if (outcome.status === 'failed' && outcome.error) {
        setStatus(`교사 설정 문서를 만들지 못했습니다: ${outcome.error}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<GlobalConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    const outcome = await saveConfig(next);
    setStatus(outcome.ok ? '설정을 저장했습니다.' : (outcome.error ?? '저장에 실패했습니다.'));
  };

  const toggleStage = (stageId: string) => {
    const active =
      config.activeStages.length === 0 ? STAGES.map((s) => s.id) : [...config.activeStages];
    const next = active.includes(stageId)
      ? active.filter((id) => id !== stageId)
      : [...active, stageId];
    void update({ activeStages: next });
  };

  const isStageActive = (stageId: string) =>
    config.activeStages.length === 0 || config.activeStages.includes(stageId);

  const loadStudents = async () => {
    setLoading(true);
    try {
      setStudents(await listAllStudents());
    } catch (error) {
      setStatus(`기록을 불러오지 못했습니다: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  /** 전체 기록 CSV 내보내기 (PRD 5.5). */
  const exportCsv = async () => {
    const rows = students ?? (await listAllStudents());
    setStudents(rows);
    const header = [
      '학번',
      '이름',
      '학급',
      '총점',
      '클리어수',
      ...STAGES.flatMap((s) => [`${s.id}_클리어`, `${s.id}_점수`, `${s.id}_시간ms`, `${s.id}_별`]),
    ];
    const body = rows.map((student) => [
      student.studentNo,
      student.name,
      student.classId || classIdOf(student.studentNo),
      student.totalScore,
      student.clearedCount,
      ...STAGES.flatMap((stage) => {
        const record = student.best[stage.id];
        return record
          ? ['O', record.score, record.timeMs, record.stars]
          : ['X', '', '', ''];
      }),
    ]);
    // Excel이 UTF-8로 열도록 BOM(U+FEFF)을 붙인다.
    const csv = '\uFEFF' + toCsv([header, ...body]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `한붓챌린지_기록_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const removeStudent = async (studentNo: string) => {
    if (!window.confirm(`${studentNo} 기록을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const outcome = await deleteStudent(studentNo);
    if (outcome.ok) {
      setStudents((rows) => rows?.filter((r) => r.studentNo !== studentNo) ?? null);
      setStatus(`${studentNo} 기록을 삭제했습니다.`);
    } else {
      setStatus(`삭제하지 못했습니다: ${outcome.error}`);
    }
  };

  if (presentation) {
    return (
      <main className="min-h-full bg-slate-900 px-8 py-6 text-white">
        <div className="mx-auto max-w-5xl">
          <header className="flex items-center justify-between">
            <h1 className="text-4xl font-black">한붓 챌린지 · 현황</h1>
            <button
              type="button"
              onClick={() => setPresentation(false)}
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold"
            >
              닫기
            </button>
          </header>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl bg-slate-100 p-4 text-slate-900">
              <h2 className="text-2xl font-black">상위 10명</h2>
              <RankingTab masking={liveConfig.nameMasking} presentation />
            </section>
            <section className="rounded-3xl bg-slate-100 p-4 text-slate-900">
              <h2 className="text-2xl font-black">학급 진행률</h2>
              <ClassTab masking={liveConfig.nameMasking} presentation />
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4">
      <header className="flex items-center justify-between">
        <Link to="/stages" className="text-sm font-semibold text-slate-500">
          ← 학생 화면
        </Link>
        <h1 className="text-lg font-black text-slate-900">교사 모드</h1>
        <span className="w-16" />
      </header>

      {!remoteEnabled && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Firebase가 설정되지 않아 설정은 이 기기에만 저장되고, 기록 조회·삭제는 쓸 수 없습니다.
        </p>
      )}

      <button
        type="button"
        onClick={() => setPresentation(true)}
        className="mt-4 w-full rounded-2xl bg-slate-900 py-4 text-lg font-bold text-white"
      >
        📺 프레젠테이션 뷰 열기
      </button>

      <ConnectionCheck />

      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-bold text-slate-900">수업 설정</h2>
        <div className="mt-3 space-y-2">
          <SettingToggle
            label="학생에게 대시보드 공개"
            description="끄면 학생 화면에서 대시보드 메뉴가 사라집니다."
            checked={config.dashboardVisible}
            onChange={(value) => void update({ dashboardVisible: value })}
          />
          <SettingToggle
            label="이름 마스킹"
            description="김민수 → 김O수 로 표시합니다."
            checked={config.nameMasking}
            onChange={(value) => void update({ nameMasking: value })}
          />
          <SettingToggle
            label="홀수점 보기 조기 해금"
            description="1·2단계에서도 홀수점 보기 토글을 열어 줍니다. (기본은 3단계부터)"
            checked={config.oddViewUnlocked}
            onChange={(value) => void update({ oddViewUnlocked: value })}
          />
        </div>
      </section>

      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-bold text-slate-900">스테이지 활성화</h2>
        <p className="mt-1 text-xs text-slate-500">
          끈 스테이지는 학생 화면에서 잠깁니다. 진도에 맞춰 3단계를 잠가 둘 수 있어요.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STAGES.map((stage) => (
            <button
              key={stage.id}
              type="button"
              onClick={() => toggleStage(stage.id)}
              className={`rounded-2xl px-3 py-2.5 text-left text-xs font-semibold ring-1 ${
                isStageActive(stage.id)
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-slate-100 text-slate-400 ring-slate-200'
              }`}
            >
              <span className="block">{stage.id}</span>
              <span className="block truncate font-normal">{stage.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-base font-bold text-slate-900">기록 관리</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void loadStudents()}
            disabled={!remoteEnabled || loading}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-800 disabled:opacity-50"
          >
            {loading ? '불러오는 중…' : '기록 불러오기'}
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={!remoteEnabled}
            className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            CSV 내보내기
          </button>
        </div>

        {students && (
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
            {students.map((student) => (
              <li
                key={student.studentNo}
                className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {student.studentNo} {displayName(student.name, config.nameMasking)} ·{' '}
                  {student.totalScore}점 · {student.clearedCount}개
                </span>
                <button
                  type="button"
                  onClick={() => void removeStudent(student.studentNo)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600"
                >
                  삭제
                </button>
              </li>
            ))}
            {students.length === 0 && (
              <li className="py-4 text-center text-sm text-slate-500">기록이 없습니다.</li>
            )}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-3xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
        <h2 className="text-sm font-bold text-slate-800">개인정보 처리 안내</h2>
        <p className="mt-1">
          수집 항목은 학번·성명·게임 기록뿐이며 익명 인증만 사용합니다. 학기 종료 후에는 Firebase
          콘솔에서 <code>students</code>와 <code>plays</code> 컬렉션을 삭제해 주세요. 삭제 절차는
          README의 &ldquo;학기 종료 후 데이터 삭제&rdquo; 항목에 정리되어 있습니다.
        </p>
      </section>

      {status && (
        <p role="status" className="mt-4 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-white">
          {status}
        </p>
      )}
    </main>
  );
}

/**
 * 연결 상태 점검 — "기록이 저장되지 않아요"의 원인이
 * 설정 누락인지 네트워크인지 한 번에 가른다.
 */
function ConnectionCheck() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResults(await runConnectionCheck());
    } finally {
      setRunning(false);
    }
  };

  const icon: Record<CheckResult['status'], string> = { ok: '✅', fail: '❌', skip: '⏭️' };

  return (
    <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">연결 상태 점검</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            기록이 저장되지 않을 때 원인을 알려 줍니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="shrink-0 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          {running ? '확인 중…' : '점검하기'}
        </button>
      </div>

      {results && (
        <ul className="mt-3 space-y-2">
          {results.map((result) => (
            <li key={result.name} className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-semibold text-slate-900">
                <span aria-hidden="true">{icon[result.status]}</span> {result.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">{result.detail}</p>
              {result.action && (
                <p className="mt-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                  → {result.action}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}
