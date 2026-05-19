"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";
import { Link } from "@/i18n/navigation";

export default function SubscribePage() {
  const t = useTranslations("Subscribe");
  const [subscribed, setSubscribed] = useState(false);
  const [until, setUntil] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const u = session.getUser();
      setSubscribed(!!u?.isSubscribed);
      setUntil(u?.subscriptionUntil ?? null);
    };
    check();
    window.addEventListener(SESSION_CHANGE_EVENT, check);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, check);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      <p className="mb-6 text-zinc-600 dark:text-zinc-300">{t("subtitle")}</p>

      <ul className="mb-8 space-y-2 rounded-lg border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <li>• {t("benefitNoAds")}</li>
        <li>• {t("benefitBonus")}</li>
        <li>• {t("benefitPriority")}</li>
      </ul>

      {subscribed ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {t("activeNotice")}
          {until && (
            <div className="mt-1 text-xs opacity-80">
              {t("until", { date: new Date(until).toLocaleDateString() })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
            {t("comingSoon")}
          </p>
          <Link
            href="/donate"
            className="inline-block rounded bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {t("donateInstead")}
          </Link>
        </div>
      )}
    </main>
  );
}
