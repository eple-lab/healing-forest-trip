'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          background: '#16211c',
          color: '#f0e9dd',
          fontFamily: '\'Malgun Gothic\', \'Apple SD Gothic Neo\', sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 0.75rem' }}>숲을 열 수 없습니다</h1>
          <p style={{ margin: '0 0 1.25rem', color: '#c9d3c4' }}>
            일시적인 오류입니다. 다시 시도하거나 새로고침해 주세요.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '0.7rem 1.4rem',
              background: '#d8c7a0',
              color: '#16211c',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
