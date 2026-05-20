"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { session } from "@/lib/api";
import { useTranslations } from "next-intl";

type UploadResult = {
  ok: true;
  game: { slug: string; status: string; storagePath: string; uploadedBytes: number };
  message: string;
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const CATEGORIES = ["earn", "multiplay", "decorate", "other"] as const;
type Category = (typeof CATEGORIES)[number];

export default function DevelopPage() {
  const router = useRouter();
  const t = useTranslations("Develop");

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🎮");
  const [category, setCategory] = useState<Category>("other");
  const [tagsRaw, setTagsRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session.getToken()) router.replace("/login");
  }, [router]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setErrorMsg(t("errorFileTooLarge", { mb: MAX_UPLOAD_BYTES / 1024 / 1024 }));
    } else {
      setErrorMsg(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);

    const tk = session.getToken();
    if (!tk) {
      router.replace("/login");
      return;
    }
    if (!file) {
      setErrorMsg(t("errorNoFile"));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMsg(t("errorFileTooLarge", { mb: MAX_UPLOAD_BYTES / 1024 / 1024 }));
      return;
    }
    if (!slug.trim() || !title.trim()) {
      setErrorMsg(t("errorMissingMeta"));
      return;
    }

    const fd = new FormData();
    fd.append("gamezip", file);
    fd.append("slug", slug.trim().toLowerCase());
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("emoji", emoji.trim() || "🎮");
    fd.append("category", category);
    const tagList = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagList.length > 0) fd.append("tags", JSON.stringify(tagList));

    setSubmitting(true);
    try {
      const res = await fetch("/api/games/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
        body: fd,
      });
      const text = await res.text();
      let data: unknown = {};
      if (text) {
        try { data = JSON.parse(text); } catch { data = {}; }
      }
      if (!res.ok) {
        const d = data as { error?: { message?: string } };
        setErrorMsg(d.error?.message || t("errorGeneric", { status: res.status }));
        return;
      }
      setResult(data as UploadResult);
      setSlug("");
      setTitle("");
      setDescription("");
      setEmoji("🎮");
      setCategory("other");
      setTagsRaw("");
      setFile(null);
      const inputEl = document.getElementById("gamezip-input") as HTMLInputElement | null;
      if (inputEl) inputEl.value = "";
    } catch {
      setErrorMsg(t("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-sm text-zinc-500">
        {t("checking")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("backHome")}
        </Link>
      </div>

      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">{t("noticeTitle")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t("noticeIndex")}</li>
          <li>{t("noticeNoCommon")}</li>
          <li>{t("noticeMaxSize", { mb: MAX_UPLOAD_BYTES / 1024 / 1024 })}</li>
          <li>{t("noticeModeration")}</li>
        </ul>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("fieldGamezip")}</label>
          <input
            id="gamezip-input"
            type="file"
            accept=".zip,application/zip"
            onChange={onFileChange}
            disabled={submitting}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-white hover:file:bg-blue-700 disabled:opacity-60"
          />
          {file && (
            <p className="mt-1 text-xs text-zinc-500">
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldSlug")}</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={t("slugPlaceholder")}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">{t("slugHelp")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldEmoji")}</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={8}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t("fieldTitle")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={submitting}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">{t("fieldDescription")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
            disabled={submitting}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <p className="mt-1 text-right text-xs text-zinc-500">{description.length} / 2000</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldCategory")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`category_${c}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldTags")}</label>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder={t("tagsPlaceholder")}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">{t("tagsHelp")}</p>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
            <p className="font-medium">{result.message}</p>
            <p className="mt-1">
              {t("successSlug")}: <code>{result.game.slug}</code> · {t("successStatus")}: <code>{result.game.status}</code>
            </p>
            <p className="mt-1">
              {t("successUploaded", { kb: (result.game.uploadedBytes / 1024).toFixed(1) })}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
          <Link href="/games" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            {t("viewGames")}
          </Link>
        </div>
      </form>
    </div>
  );
}
