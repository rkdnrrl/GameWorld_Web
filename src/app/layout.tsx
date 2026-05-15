import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ALP",
  description: "다양한 멀티플레이 게임을 즐길 수 있는 플랫폼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
