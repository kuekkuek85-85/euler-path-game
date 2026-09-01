/** F6 · 개념 카드 — 플레이 중 언제든 열 수 있는 홀수점 규칙 요약 (PRD 5.1). */
export function ConceptCard({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="한붓그리기 규칙 요약"
      onClick={onClose}
    >
      <div
        className="animate-pop-in w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900">한붓그리기 규칙</h2>

        <dl className="mt-4 space-y-3 text-sm text-slate-700">
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="font-semibold text-slate-900">점의 차수</dt>
            <dd className="mt-1">한 점에 붙어 있는 선의 개수. 홀수면 홀수점, 짝수면 짝수점.</dd>
          </div>
          <div className="rounded-2xl bg-teal-50 p-3">
            <dt className="font-semibold text-teal-800">홀수점 0개</dt>
            <dd className="mt-1">
              어느 점에서 시작해도 성공하고, 시작한 점으로 되돌아온다. (오일러 회로)
            </dd>
          </div>
          <div className="rounded-2xl bg-orange-50 p-3">
            <dt className="font-semibold text-orange-800">홀수점 2개</dt>
            <dd className="mt-1">
              두 홀수점 중 하나에서 시작해야 하고, 나머지 홀수점에서 끝난다. (오일러 경로)
            </dd>
          </div>
          <div className="rounded-2xl bg-rose-50 p-3">
            <dt className="font-semibold text-rose-800">홀수점 4개 이상</dt>
            <dd className="mt-1">
              한 번에는 그릴 수 없다. 필요한 최소 붓 횟수는 <b>홀수점 개수 ÷ 2</b>.
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="font-semibold text-slate-900">왜 그럴까?</dt>
            <dd className="mt-1">
              지나가는 점은 들어온 선 하나와 나가는 선 하나를 짝지어 쓴다. 그래서 중간에 지나는
              점의 차수는 반드시 짝수다. 짝이 맞지 않는 홀수점은 출발점이나 도착점밖에 될 수 없고,
              한붓그리기에는 출발점과 도착점이 하나씩뿐이다.
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
