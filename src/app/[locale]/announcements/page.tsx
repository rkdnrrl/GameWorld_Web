"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, session } from "@/lib/api";
import { useTranslations } from "next-intl";

interface AnnouncementItem {
  id: string;
  title: string;
  kind: string;
  pinned: boolean;
  createdAt: string;
}

interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function kindColor(kind: string) {
  return kind === "patch"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default function AnnouncementsPage() {
  const t = useTranslations("Announcements");
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnnouncementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "notice" | "patch">("all");

  // operator state
  const [isOperator, setIsOperator] = useState(false);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", kind: "notice", pinned: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const user = session.getUser();
    if (user?.isOperator) setIsOperator(true);
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = filter !== "all" ? `?kind=${filter}` : "";
    fetch(`/api/announcements${qs}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setSelected(null);
    try {
      const r = await fetch(`/api/announcements/${id}`);
      const d = await r.json();
      setSelected(d.item ?? null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    const tk = session.getToken();
    if (!tk || !form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify(form),
      });
      setComposing(false);
      setForm({ title: "", body: "", kind: "notice", pinned: false });
      // reload
      const qs = filter !== "all" ? `?kind=${filter}` : "";
      const r = await fetch(`/api/announcements${qs}`);
      const d = await r.json();
      setItems(d.items ?? []);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const tk = session.getToken();
    if (!tk) return;
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/announcements/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tk}` },
    });
    setSelected(null);
    const qs = filter !== "all" ? `?kind=${filter}` : "";
    const r = await fetch(`/api/announcements${qs}`);
    const d = await r.json();
    setItems(d.items ?? []);
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        {isOperator && !composing && (
          <button
            onClick={() => setComposing(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("compose")}
          </button>
        )}
      </div>

      {/* 필터 탭 */}
      <div className="mb-6 flex gap-2">
        {(["all", "notice", "patch"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === k
                ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {k === "all" ? t("filterAll") : k === "notice" ? t("filterNotice") : t("filterPatch")}
          </button>
        ))}
      </div>

      {/* 작성 폼 (운영자) */}
      {composing && (
        <div className="mb-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="font-semibold">{t("composingTitle")}</h2>
          <div className="flex gap-2">
            {(["notice", "patch"] as const).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={form.kind === k}
                  onChange={() => setForm((f) => ({ ...f, kind: k }))}
                />
                {k === "notice" ? t("kindNoticeLabel") : t("kindPatchLabel")}
              </label>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
              />
              {t("pinned")}
            </label>
          </div>
          <input
            type="text"
            placeholder={t("titlePlaceholder")}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="input w-full"
          />
          <textarea
            placeholder={t("bodyPlaceholder")}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={6}
            className="input w-full resize-y font-mono text-sm"
          />
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? t("saving") : t("save")}
            </button>
            <button
              onClick={() => setComposing(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => openDetail(item.id)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                <div className="flex items-start gap-2">
                  {item.pinned && <span className="mt-0.5 text-sm">📌</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(item.createdAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${kindColor(item.kind)}`}>
                    {item.kind === "patch" ? t("kindPatch") : t("kindNotice")}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 상세 모달 */}
      {(selected || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setSelected(null); }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-6 dark:bg-zinc-900 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <p className="text-sm text-zinc-500">{t("loading")}</p>
            ) : selected ? (
              <>
                <div className="mb-4 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${kindColor(selected.kind)} mb-2`}>
                      {selected.kind === "patch" ? t("kindPatch") : t("kindNotice")}
                    </span>
                    <h2 className="text-xl font-bold">{selected.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(selected.createdAt)}</p>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {selected.body}
                </pre>
                <div className="mt-5 flex gap-2">
                  {isOperator && (
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {t("delete")}
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                  >
                    {t("close")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        <Link href="/" className="text-blue-600 hover:underline">{t("backHome")}</Link>
      </p>
    </section>
  );
}
