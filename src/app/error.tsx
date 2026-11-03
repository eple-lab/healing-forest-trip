'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[forest error]', error);
  }, [error]);

  return (
    <main className="error-screen" role="alert">
      <p className="error-eyebrow">숲이 잠시 가라앉았습니다</p>
      <h1>화면을 불러오지 못했습니다</h1>
      <p className="error-detail">
        일시적인 그래픽/네트워크 문제일 수 있습니다. 다시 시도하거나 새로고침해 주세요.
      </p>
      <div className="error-actions">
        <button type="button" className="btn-primary compact" onClick={() => reset()}>
          다시 시도
        </button>
        <button
          type="button"
          className="btn-primary compact"
          onClick={() => window.location.assign('/')}
        >
          처음으로
        </button>
      </div>
    </main>
  );
}
