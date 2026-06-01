"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("Home");

  return (
    <div className="min-h-screen bg-[#0b1020] text-white">
      <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/world" className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500">
            🎮 {t("enterHomeHub")}
          </Link>
          <Link href="/character" className="rounded-lg bg-[#1b2647] px-4 py-3 text-sm font-bold hover:bg-[#24315a]">
            {t("startNow")}
          </Link>
        </div>
      </div>
    </div>
  );
}
