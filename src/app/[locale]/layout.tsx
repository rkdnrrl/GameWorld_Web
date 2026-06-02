import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "../globals.css";
import BackendConnectionBanner from "@/components/BackendConnectionBanner";
import Header from "@/components/Header";
import SentryClientInit from "@/components/SentryClientInit";
import SessionExpiredBanner from "@/components/SessionExpiredBanner";
import SessionRefresher from "@/components/SessionRefresher";

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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-w-0 flex-col overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {/* Kakao AdFit SDK — 전체 페이지에서 kakao_ad_area 자동 탐지 */}
        <Script src="//t1.daumcdn.net/kas/static/ba.min.js" strategy="afterInteractive" />
        <SentryClientInit />
        <NextIntlClientProvider messages={messages}>
          <SessionExpiredBanner />
          <SessionRefresher />
          <Header />
          <BackendConnectionBanner enabled={showBackendConnectionBanner} />
          <main className="flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
