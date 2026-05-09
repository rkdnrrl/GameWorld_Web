type Props = {
  /** 아이콘 픽셀 크기. 텍스트 크기는 자동 비례. */
  size?: number;
  /** 텍스트 숨김 (아이콘만 노출) */
  iconOnly?: boolean;
  className?: string;
};

export default function Logo({ size = 28, iconOnly = false, className = "" }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="ALP"
      >
        <defs>
          <linearGradient id="alp-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>

        {/* 헥사곤 본체 */}
        <path
          d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
          fill="url(#alp-grad)"
        />

        {/* 안쪽 플레이 삼각형 */}
        <path
          d="M13 11 L13 21 L22 16 Z"
          fill="white"
        />
      </svg>

      {!iconOnly && (
        <span
          className="text-xl font-extrabold tracking-tight"
          style={{ fontSize: size * 0.7 }}
        >
          ALP
        </span>
      )}
    </div>
  );
}
