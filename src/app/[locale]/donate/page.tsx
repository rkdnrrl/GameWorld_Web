"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { session } from "@/lib/api";
import { useTranslations } from "next-intl";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
const TOSS_SCRIPT_URL = "https://js.tosspayments.com/v1/payment";
const MIN_AMOUNT = 1000;

declare global {
  interface Window {
    TossPayments: (clientKey: string) => {
      requestPayment: (
        method: string,
        options: {
          amount: number;
          orderId: string;
          orderName: string;
          customerName?: string;
          successUrl: string;
          failUrl: string;
        },
      ) => Promise<void>;
    };
  }
}

export default function DonatePage() {
  const router = useRouter();
  const t = useTranslations("Donate");
  const [sdkReady, setSdkReady] = useState(false);
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!session.getToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (scriptRef.current) return;
    const script = document.createElement("script");
    script.src = TOSS_SCRIPT_URL;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError(t("sdkLoadFailed"));
    document.head.appendChild(script);
    scriptRef.current = script;
    return () => {
      if (scriptRef.current) {
        document.head.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
    };
  }, [t]);

  async function handlePay() {
    setError(null);
    const parsed = parseInt(amount.replace(/,/g, ""), 10);
    if (!parsed || parsed < MIN_AMOUNT) {
      setError(t("minAmountError", { min: MIN_AMOUNT.toLocaleString() }));
      return;
    }
    if (!sdkReady || !window.TossPayments) {
      setError(t("sdkNotReady"));
      return;
    }
    if (!TOSS_CLIENT_KEY) {
      setError(t("configMissing"));
      return;
    }

    setPaying(true);
    try {
      const user = session.getUser();
      const orderId = `donate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      await tossPayments.requestPayment("카드", {
        amount: parsed,
        orderId,
        orderName: t("orderName"),
        customerName: user?.nickname ?? undefined,
        successUrl: `${window.location.origin}/donate/success`,
        failUrl: `${window.location.origin}/donate/fail`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("취소") && !msg.includes("cancel") && !msg.includes("CANCEL")) {
        setError(msg);
      }
    } finally {
      setPaying(false);
    }
  }

  const PRESETS = [1000, 5000, 10000, 30000, 50000, 100000];

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
        <h1 className="mt-0.5 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {t("subtitle")}{" "}
          <span className="font-medium text-yellow-600 dark:text-yellow-400">{t("conversionRate")}</span>
        </p>
      </div>

      {/* 금액 입력 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <label className="mb-2 block text-sm font-medium">{t("amountLabel")}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            placeholder="1,000"
            value={amount}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setAmount(raw ? Number(raw).toLocaleString() : "");
            }}
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-3 pl-4 pr-10 text-lg font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-800"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{t("amountUnit")}</span>
        </div>

        {/* 프리셋 버튼 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p.toLocaleString())}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500 dark:hover:bg-blue-950/30 dark:hover:text-blue-400"
            >
              {p.toLocaleString()}{t("amountUnit")}
            </button>
          ))}
        </div>

        {/* 코인 미리보기 */}
        {amount && (
          <p className="mt-4 text-sm text-zinc-500">
            {t("coinPreview")}{" "}
            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
              🪙 {parseInt(amount.replace(/,/g, ""), 10).toLocaleString()} {t("coinUnit")}
            </span>
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={paying || !sdkReady}
          className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {paying ? t("paying") : !sdkReady ? t("loadingSdk") : t("payButton")}
        </button>

        <p className="mt-3 text-center text-xs text-zinc-400">
          {t("safePayment")}
        </p>
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
