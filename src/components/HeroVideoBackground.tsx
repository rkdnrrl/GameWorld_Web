/**
 * Hero 섹션 배경 비디오 — YouTube 또는 MP4 파일.
 *
 * - `youtubeId` 가 주어지면 YouTube iframe (광고차단기에 막힐 수 있음)
 * - 없으면 /public/hero-bg.mp4 사용 (권장)
 *
 * 환경변수 NEXT_PUBLIC_HERO_YOUTUBE_ID 가 설정돼 있으면 자동으로 YouTube 사용.
 */
export default function HeroVideoBackground() {
  const youtubeId = process.env.NEXT_PUBLIC_HERO_YOUTUBE_ID?.trim();

  if (youtubeId) {
    // YouTube nocookie + 모든 UI 숨김 + 루프 (playlist 트릭).
    const src =
      `https://www.youtube-nocookie.com/embed/${youtubeId}` +
      `?autoplay=1&mute=1&loop=1&playlist=${youtubeId}` +
      `&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3` +
      `&playsinline=1&disablekb=1&fs=0`;
    return (
      <div className="absolute inset-0 overflow-hidden">
        {/* 16:9 비율 유지하면서 부모 컨테이너를 cover. YouTube UI 가 잘려 안 보이게 부풀림. */}
        <iframe
          src={src}
          title="background"
          allow="autoplay; encrypted-media"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "max(100vw, 177.78vh)",   // 16:9
            height: "max(56.25vw, 100vh)",   // 16:9
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
