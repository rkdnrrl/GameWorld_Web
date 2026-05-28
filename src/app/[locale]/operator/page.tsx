"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { session } from "@/lib/api";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_URL || "https://airliveplay.com";

export default function OperatorIndexPage() {
  const router = useRouter();
  const t = useTranslations("Operator");
  const tAnim = useTranslations("OperatorCharacterAnimations");
  const [forbidden, setForbidden] = useState(false);
  const [checking, setChecking] = useState(true);

  const MENU = [
    {
      section: t("sectionContentManagement"),
      items: [
        { href: "/operator/games/pending", emoji: "🎮", label: t("menuPendingGames"), desc: t("menuPendingGamesDesc") },
        { href: "/operator/games/manage", emoji: "🗂️", label: t("menuManageGames"), desc: t("menuManageGamesDesc") },
        { href: "/operator/character-animations", emoji: "🦴", label: tAnim("title"), desc: tAnim("subtitle") },
        { href: "/operator/asset-kinds", emoji: "📦", label: "에셋 타입 관리", desc: "에셋 카테고리(3D/이미지/오디오 등)를 추가·수정·삭제합니다." },
        { href: "/operator/asset-reports", emoji: "⚠️", label: "에셋 신고 검토", desc: "공개 에셋에 대한 신고를 검토·처리합니다." },
        { href: "/operator/home-hub", emoji: "🏠", label: "홈허브 맵 설정", desc: "유저가 /world 진입 시 처음 보이는 월드를 지정합니다." },
      ],
    },
  ];

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    fetch(`${API}/api/operator/character-animations`, {
      headers: { Authorization: `Bearer ${tk}` },
    })
      .then((r) => { if (r.status === 403) setForbidden(true); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16 text-sm text-zinc-500">
        {t("checking")}
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">{t("forbidden")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("forbiddenDesc")}
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          {t("backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* 상단 */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("console")}</p>
          <h1 className="mt-0.5 text-2xl font-bold">{t("menuTitle")}</h1>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("backHome")}
        </Link>
      </div>

      {/* 섹션 목록 */}
      <div className="space-y-10">
        {MENU.map((group) => (
          <div key={group.section}>
            <div className="mb-3 border-b border-zinc-200 pb-2 dark:border-zinc-700">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {group.section}
              </h2>
            </div>

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
