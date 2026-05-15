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
        className="min-w-0 rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 sm:px-6 sm:text-base"
      >
        {t("browsGames")}
      </Link>
      {!loggedIn && (
        <Link
          href="/signup"
          className="min-w-0 rounded-md border border-zinc-300 px-4 py-3 text-center text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-6 sm:text-base"
        >
          {t("signup")}
        </Link>
      )}
    </div>
  );
}
