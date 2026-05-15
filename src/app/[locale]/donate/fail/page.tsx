"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function DonateFailPage() {
  const t = useTranslations("DonateFail");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("message") ?? params.get("msg") ?? null;
    setMessage(msg);
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <p className="text-5xl">😢</p>
      <h1 className="mt-4 text-xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {message ?? t("defaultMessage")}
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {t("home")}
        </Link>
        <Link
          href="/donate"
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("retry")}
        </Link>
      </div>
    </div>
  );
}
