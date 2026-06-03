/**
 * Hero 섹션 배경 비디오 — YouTube 또는 MP4 파일.
 *
 * 데이터 우선순위 (서버 컴포넌트, SSR 시점에 결정):
 *   1. 백엔드 `GET /api/site-config/hero-video` 의 youtubeId — **운영자가 ALP-Desktop 에서 변경**
 *   2. 환경변수 NEXT_PUBLIC_HERO_YOUTUBE_ID — 폴백
 *   3. `/public/hero-bg.mp4` 파일 — 마지막 폴백
 *
 * 운영자가 변경하면 ~30초 (Cache-Control max-age=30) 안에 랜딩 반영.
 */

async function getYouTubeIdFromBackend(): Promise<string | null> {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/site-config/hero-video`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.youtubeId || null;
  } catch {
    return null;
  }
}

export default async function HeroVideoBackground() {
  const dbYoutubeId = await getYouTubeIdFromBackend();
  const envYoutubeId = process.env.NEXT_PUBLIC_HERO_YOUTUBE_ID?.trim() || null;
  const youtubeId = dbYoutubeId || envYoutubeId;

  if (youtubeId) {
    // YouTube nocookie + 모든 UI 숨김 + 루프 (playlist 트릭).
    const src =
      `https://www.youtube-nocookie.com/embed/${youtubeId}` +
      `?autoplay=1&mute=1&loop=1&playlist=${youtubeId}` +
      `&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3` +
      `&playsinline=1&disablekb=1&fs=0`;
    return (
      <div className="absolute inset-0 overflow-hidden">
        <iframe
          src={src}
          title="background"
          allow="autoplay; encrypted-media"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "max(100vw, 177.78vh)",
            height: "max(56.25vw, 100vh)",
          }}
        />
      </div>
    );
  }

  // MP4 — public/hero-bg.mp4 + (선택) hero-bg.jpg poster
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/hero-bg.jpg"
    >
      <source src="/hero-bg.mp4" type="video/mp4" />
    </video>
  );
}
