"use client";

import { Link } from "@/i18n/navigation";
import { useLoggedIn } from "@/lib/useLoggedIn";
import { useTranslations } from "next-intl";

export default function HomeCtas() {
  const loggedIn = useLoggedIn();
  const t = useTranslations("Home");

  return (
    <div className="mx-auto mt-10 flex w-full max-w-md flex-col items-stretch justify-center gap-3 px-1 sm:max-w-none sm:flex-row sm:items-center sm:gap-4 sm:px-0">
      <Link
        href="/games"
        className="min-w-0 rounded-full bg-[#5865f2] px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] sm:px-8 sm:text-base"
      >
        {t("browsGames")}
      </Link>
      {!loggedIn && (
        <Link
          href="/signup"
          className="min-w-0 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:px-8 sm:text-base"
        >
          {t("signup")}
        </Link>
      )}
    </div>
  );
}
