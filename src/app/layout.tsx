import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BackendConnectionBanner from "@/components/BackendConnectionBanner";
import Header from "@/components/Header";

/** 로컬에서 백엔드 상태 표시. 프로덕션 빌드를 로컬에서 검증하려면 NEXT_PUBLIC_BACKEND_STATUS=1 */
const showBackendConnectionBanner =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_BACKEND_STATUS === "1";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ALP",
  description: "다양한 멀티플레이 게임을 즐길 수 있는 플랫폼",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Header />
        <BackendConnectionBanner enabled={showBackendConnectionBanner} />
        <main className="flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
