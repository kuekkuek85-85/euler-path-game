import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../state/sessionStore';
import { classIdOf, validateName, validateStudentNo } from '../lib/format';
import { STORAGE_KEYS, readJson } from '../lib/storage';

/** F1 · 입장 — 학번·성명만 받고 익명 인증으로 들어간다 (PRD 5.2). */
export function Entry() {
  const { identity, signIn, signingIn, remoteEnabled } = useSession();
  const navigate = useNavigate();

  const saved = readJson<{ studentNo: string; name: string } | null>(STORAGE_KEYS.identity, null);
  const [studentNo, setStudentNo] = useState(saved?.studentNo ?? '');
  const [name, setName] = useState(saved?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  // 이미 입장한 상태로 다시 들어오면 스테이지 선택으로 보낸다.
  useEffect(() => {
    if (identity) navigate('/stages', { replace: true });
  }, [identity, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const noError = validateStudentNo(studentNo);
    if (noError) {
      setError(noError);
      return;
    }
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    setError(null);
    await signIn(studentNo, name);
    navigate('/stages');
  };

  const classPreview = validateStudentNo(studentNo) === null ? classIdOf(studentNo) : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold text-blue-600">장평중학교 1학년 정보</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">한붓 챌린지</h1>
        <p className="mt-2 text-sm text-slate-600">
          선을 한 번씩만 지나 도형을 완성해 보세요. 왜 되는 도형과 안 되는 도형이 있을까요?
        </p>
      </header>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="studentNo" className="block text-sm font-semibold text-slate-700">
            학번 (5자리)
          </label>
          <input
            id="studentNo"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            value={studentNo}
            onChange={(event) => setStudentNo(event.target.value.replace(/\D/g, ''))}
            placeholder="예: 10307"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg tracking-widest focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            학년 1자리 + 반 2자리 + 번호 2자리{classPreview ? ` · ${classPreview}반으로 입장` : ''}
          </p>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-slate-700">
            이름
          </label>
          <input
            id="name"
            autoComplete="off"
            maxLength={5}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 홍길동"
            className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={signingIn}
          className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white disabled:opacity-60"
        >
          {signingIn ? '들어가는 중…' : '시작하기'}
        </button>
      </form>

      <p className="mt-6 rounded-2xl bg-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-600">
        학번과 이름은 수업 활동 기록 확인 용도로만 사용하며, 학기 종료 후 삭제합니다. 그 밖의
        정보는 수집하지 않습니다.
      </p>

      {!remoteEnabled && (
        <p className="mt-3 text-center text-xs text-amber-700">
          기록 서버가 설정되지 않아 이 기기에만 기록이 저장됩니다.
        </p>
      )}
    </main>
  );
}
