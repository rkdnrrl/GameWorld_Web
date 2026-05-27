import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "ALP",
  description: "다양한 멀티플레이 게임을 즐길 수 있는 플랫폼",
};

// 모바일에서 브라우저 핀치 뷰포트 줌 방지 (게임 내 핀치 줌은 camDist로 직접 처리)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
