import { useEffect, useState } from 'react';

/**
 * 스테이지 진입 시 3·2·1 카운트다운.
 * 로딩·읽기 지연이 기록에 섞이지 않도록 이 카운트가 끝난 뒤 타이머를 시작한다 (PRD 5.3).
 */
export function Countdown({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onDone();
      return;
    }
    const timer = window.setTimeout(() => setCount((c) => c - 1), 700);
    return () => window.clearTimeout(timer);
  }, [count, onDone]);

  if (count <= 0) return null;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/85 backdrop-blur-sm">
      <div key={count} className="animate-pop-in text-7xl font-black text-slate-800">
        {count}
      </div>
    </div>
  );
}
