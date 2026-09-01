import { useEffect } from 'react';

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
  duration = 2600,
}: {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

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
