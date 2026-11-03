'use client';

import { useGame } from '@/store/game';

export function Toast() {
  const toast = useGame((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <span className="toast-dot" />
      {toast.text}
    </div>
  );
}
