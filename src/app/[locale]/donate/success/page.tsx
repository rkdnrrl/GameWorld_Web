"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { session, api, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

export default function DonateSuccessPage() {
  const router = useRouter();
  const t = useTranslations("DonateSuccess");
  const [status, setStatus] = useState<"confirming" | "done" | "error">("confirming");
  const [coins, setCoins] = useState(0);
  const [amount, setAmount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = session.getToken();
    if (!token) { router.replace("/login"); return; }

    const params = new URLSearchParams(window.location.search);
    const paymentKey = params.get("paymentKey") ?? "";
    const orderId = params.get("orderId") ?? "";
    const amountStr = params.get("amount") ?? "0";
    const amountNum = parseInt(amountStr, 10);

    if (!paymentKey || !orderId || !amountNum) {
      setErrorMsg(t("invalidPaymentInfo"));
      setStatus("error");
      return;
    }

    api.donateConfirm(token, { paymentKey, orderId, amount: amountNum })
      .then((res) => {
        setCoins(res.coins);
        setAmount(res.amount);
        setStatus("done");
        window.dispatchEvent(new Event("gameworld-session-change"));
      })
      .catch((err) => {
        setErrorMsg(err instanceof ApiError ? err.message : t("confirmError"));
        setStatus("error");
      });
  }, [router, t]);

  if (status === "confirming") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-sm text-zinc-500">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        {t("confirming")}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <p className="text-4xl">❌</p>
        <h1 className="mt-4 text-xl font-bold">{t("errorTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{errorMsg}</p>
        <Link
          href="/donate"
          className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("retry")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <p className="text-5xl">🎉</p>
      <h1 className="mt-4 text-2xl font-bold">{t("successTitle")}</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {t("successDesc", { amount: amount.toLocaleString() })}
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-yellow-50 px-6 py-4 dark:bg-yellow-900/20">
        <span className="text-3xl">🪙</span>
        <span className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
          +{coins.toLocaleString()}
        </span>
      </div>
      <p className="mt-3 text-xs text-zinc-400">{t("coinsGranted")}</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {t("home")}
        </Link>
        <Link
          href="/inventory"
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("viewInventory")}
        </Link>
      </div>
    </div>
  );
}
