"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, session, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  kind: string;
  desc: string;
}

export default function ShopPage() {
  const t = useTranslations("Shop");
  const [items, setItems] = useState<ShopItem[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const tk = session.getToken();
    setLoggedIn(!!tk);
    Promise.all([
      api.getShopCatalog(),
      tk ? fetch("/api/coins", { headers: { Authorization: `Bearer ${tk}` } })
              .then((r) => r.json())
              .then((d) => ({ coins: d.coins ?? null }))
            : Promise.resolve({ coins: null }),
    ]).then(([catalog, coinData]) => {
      setItems(catalog.items);
      setCoins(coinData.coins);
    }).finally(() => setLoading(false));
  }, []);

  function getQty(id: string) {
    return qty[id] ?? 1;
  }

  function setItemQty(id: string, v: number) {
    setQty((q) => ({ ...q, [id]: Math.max(1, Math.min(99, v)) }));
  }

  async function handleBuy(item: ShopItem) {
    const tk = session.getToken();
    if (!tk) return;
    const q = getQty(item.id);
    setBuying(item.id);
    setNotice(null);
    try {
      const res = await api.shopBuy(tk, item.id, q);
      setCoins(res.remainingCoins);
      setNotice({ kind: "ok", text: t("purchaseSuccess", { emoji: item.emoji, name: item.name, qty: q, spent: res.spent.toLocaleString() }) });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof ApiError ? err.message : t("purchaseFailed"),
      });
    } finally {
      setBuying(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        {coins !== null && (
          <span className="flex items-center gap-1 rounded-full bg-yellow-50 px-3 py-1.5 text-sm font-semibold text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
            🪙 {coins.toLocaleString()}
          </span>
        )}
      </div>
      <p className="mb-8 text-sm text-zinc-500">
        {t("subtitle")}
      </p>

      {notice && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${
          notice.kind === "ok"
            ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
        }`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{item.emoji}</span>
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold tabular-nums text-yellow-600 dark:text-yellow-400">
                  🪙 {item.price.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setItemQty(item.id, getQty(item.id) - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  >−</button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={getQty(item.id)}
                    onChange={(e) => setItemQty(item.id, parseInt(e.target.value) || 1)}
                    className="h-7 w-12 rounded-md border border-zinc-300 bg-white text-center text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <button
                    onClick={() => setItemQty(item.id, getQty(item.id) + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                  >＋</button>
                </div>
                <span className="w-20 text-right text-xs text-zinc-400 tabular-nums">
                  = 🪙{(item.price * getQty(item.id)).toLocaleString()}
                </span>
                {loggedIn ? (
                  <button
                    onClick={() => handleBuy(item)}
                    disabled={buying === item.id}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {buying === item.id ? t("buying") : t("buy")}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-600"
                  >
                    {t("login")}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}
