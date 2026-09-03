import { useEffect, useRef } from 'react';

export type ToastTone = 'info' | 'warn' | 'good';

const toneStyles: Record<ToastTone, string> = {
  info: 'bg-slate-800 text-white',
  warn: 'bg-amber-500 text-white',
  good: 'bg-emerald-600 text-white',
};

/** 화면 아래쪽에 잠깐 뜨는 안내. 실패를 나무라지 않는 문구만 쓴다 (PRD 7.4). */
export function Toast({
  message,
  tone = 'info',
  onDismiss,
  duration = 3000,
}: {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
  duration?: number;
}) {
  /*
    onDismiss 를 의존성에 그대로 넣으면 부모가 다시 그려질 때마다 타이머가 리셋된다.
    플레이 화면은 경과 시간을 100ms마다 갱신하므로 타이머가 영영 끝나지 않아
    안내가 사라지지 않았다. 최신 콜백은 ref로 들고, 타이머는 메시지가 바뀔 때만 건다.
  */
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4"
    >
      <div
        className={`animate-pop-in max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-lg ${toneStyles[tone]}`}
      >
        {message}
      </div>
    </div>
  );
}
