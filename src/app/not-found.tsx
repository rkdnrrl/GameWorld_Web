/**
 * 루트 404 — locale 접두사 없는 경로 (예: /random-typo) 폴백.
 * next-intl proxy 가 처리 못 하는 경로에서 표시되므로 정적으로 한국어/영어 병기.
 */
export default function RootNotFound() {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          background: "#0b1020",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 96, fontWeight: 800, color: "rgba(255,255,255,0.3)", marginBottom: 24 }}>
            404
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>
            🌌 길을 잃은 것 같아요
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "0 0 8px" }}>
            요청하신 페이지를 찾을 수 없어요.
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 32px" }}>
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#4f46e5",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 8px 16px rgba(79,70,229,0.4)",
            }}
          >
            🌍 홈으로 / Back Home
          </a>
        </div>
      </body>
    </html>
  );
}
