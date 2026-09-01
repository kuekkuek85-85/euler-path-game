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
            <dt className="font-semibold text-slate-900">왜 홀수점 ÷ 2 일까?</dt>
            <dd className="mt-1">
              붓 <b>한 획</b>에서 홀수점이 될 수 있는 자리는 <b>시작점과 끝점 둘뿐</b>이다.
              중간에 지나가는 점은 들어온 선 하나와 나간 선 하나를 늘 짝지어 쓰니 짝수가 된다.
              그래서 한 획이 감당할 수 있는 홀수점은 최대 2개이고, 홀수점이 4개면 획이 최소 2번
              필요하다. 홀수점 하나하나가 어느 획의 시작점이나 끝점을 맡는 셈이다.
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <dt className="font-semibold text-slate-900">홀수점은 항상 짝수 개</dt>
            <dd className="mt-1">
              선 하나는 양 끝 점의 차수를 1씩 올린다. 그래서 모든 차수를 더하면 언제나 선 개수의
              두 배, 곧 짝수다. 홀수점이 홀수 개일 수는 없고, 그래서 ÷ 2가 늘 딱 떨어진다.
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
