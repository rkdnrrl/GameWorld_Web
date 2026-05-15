"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { session, api, ApiError } from "@/lib/api";

const MENU = [
  {
    section: "유저 관리",
    items: [
      { href: "/operator/activity-logs", emoji: "📋", label: "활동 로그", desc: "낚시·용광로·제련 이벤트 실시간 확인" },
      { href: "/operator/smelt-stock",   emoji: "⚗️",  label: "기초 재료 지급", desc: "유저에게 용광로 기초 재료 지급" },
    ],
  },
  {
    section: "콘텐츠 관리",
    items: [
      { href: "/operator/shared-pixel-arts", emoji: "🖼️", label: "공유 픽셀 아트", desc: "AI 생성 스프라이트 캐시 조회·수정·삭제" },
      { href: "/operator/fishing-items",     emoji: "🎣", label: "낚시 아이템 관리", desc: "미생성 아이템 확인 및 PixelLab 이미지 일괄 생성" },
    ],
  },
];

export default function OperatorIndexPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [checking, setChecking]   = useState(true);

  useEffect(() => {
    const t = session.getToken();
    if (!t) { router.replace("/login"); return; }
    // 운영자 권한 확인 — activity-logs에 HEAD 대신 빠른 1건 조회로 체크
    api.operatorActivityLogs(t, { limit: 1 })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16 text-sm text-zinc-500">
        확인 중…
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          운영자만 이 페이지를 볼 수 있습니다.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* 상단 */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">운영 콘솔</p>
          <h1 className="mt-0.5 text-2xl font-bold">관리 메뉴</h1>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 홈
        </Link>
      </div>

      {/* 섹션 목록 */}
      <div className="space-y-10">
        {MENU.map((group) => (
          <div key={group.section}>
            {/* 섹션 헤더 */}
            <div className="mb-3 border-b border-zinc-200 pb-2 dark:border-zinc-700">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {group.section}
              </h2>
            </div>

            {/* 카드 그리드 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
                >
                  <span className="mt-0.5 text-2xl leading-none">{item.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 group-hover:text-blue-700 dark:text-zinc-100 dark:group-hover:text-blue-400">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      {item.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
