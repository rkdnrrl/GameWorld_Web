type AdBannerProps = {
  /** "leaderboard" = 728×90 (PC 상단), "banner" = 320×50 (모바일) */
  slot?: "leaderboard" | "banner";
  className?: string;
};

export default function AdBanner({ slot = "leaderboard", className = "" }: AdBannerProps) {
  const isLeaderboard = slot === "leaderboard";

  return (
    <div
      className={[
        "flex items-center justify-center border border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
        isLeaderboard
          ? "mx-auto hidden h-[90px] w-full max-w-[728px] sm:flex"
          : "mx-auto flex h-[50px] w-full max-w-[320px] sm:hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="광고 영역"
      data-ad-slot={slot}
    >
      <span className="text-xs">광고 영역 ({isLeaderboard ? "728×90" : "320×50"})</span>
    </div>
  );
}
