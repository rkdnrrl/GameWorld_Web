"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { session, api, type GameCategory } from "@/lib/api";
import { useTranslations } from "next-intl";

type UploadResult = {
  ok: true;
  game: { slug: string; status: string; storagePath: string; uploadedBytes: number };
  message: string;
};

type MyGame = {
  slug: string;
  title: string;
  description?: string | null;
  emoji: string;
  kind: string;
  status: string;
  category: string;
  tags?: unknown;
  version: number;
  updatedAt: string;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  pendingStoragePath?: string | null;
  pendingVersion?: number | null;
  pendingUploadedAt?: string | null;
  pendingRejectReason?: string | null;
  pendingThumbnailUrl?: string | null;
  pendingDemoVideoUrl?: string | null;
  pendingMediaAt?: string | null;
  pendingMediaRejectReason?: string | null;
  pendingTitle?: string | null;
  pendingDescription?: string | null;
  pendingEmoji?: string | null;
  pendingCategory?: string | null;
  pendingTags?: string[] | null;
  pendingMetaAt?: string | null;
  pendingMetaRejectReason?: string | null;
};

const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400 to-orange-500",
  multiplay: "from-sky-500 to-blue-600",
  decorate:  "from-pink-400 to-rose-500",
  other:     "from-violet-500 to-purple-600",
};

function CardPreview({ title, emoji, category, thumbnailUrl, noTitle, catLabel }: {
  title: string; emoji: string; category: string; thumbnailUrl: string | null;
  noTitle: string; catLabel: string;
}) {
  const gradient = CAT_BG[category] ?? CAT_BG.other;
  return (
    <div className="w-44 overflow-hidden rounded-xl bg-white shadow ring-1 ring-zinc-200">
      <div className={`relative flex aspect-video items-center justify-center bg-gradient-to-br ${gradient}`}>
        {thumbnailUrl
          ? <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" /> // eslint-disable-line @next/next/no-img-element
          : <span className="text-4xl drop-shadow">{emoji || "🎮"}</span>
        }
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-gray-900 line-clamp-1">{title || noTitle}</p>
        <p className="mt-0.5 text-[10px] capitalize text-zinc-400">{catLabel}</p>
      </div>
    </div>
  );
}

function DetailPreviewModal({ title, description, emoji, category, tags, thumbnailUrl, ownerNickname, publishedAt, onClose, td }: {
  title: string; description: string; emoji: string; category: string;
  tags: string[]; thumbnailUrl: string | null; ownerNickname?: string;
  publishedAt?: string | null; onClose: () => void;
  td: (k: string) => string;
}) {
  const gradient = CAT_BG[category] ?? CAT_BG.other;
  const catLabel = {
    earn: td("catLabelEarn"), multiplay: td("catLabelMultiplay"),
    decorate: td("catLabelDecorate"), other: td("catLabelOther"),
  }[category] ?? category;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative my-8 w-full max-w-2xl rounded-2xl bg-[#f5f5f5] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between rounded-t-2xl bg-amber-100 px-4 py-2.5 text-xs font-medium text-amber-900">
          <span>{td("previewBanner")}</span>
          <button type="button" onClick={onClose} className="rounded-full bg-amber-200 px-2 py-0.5 hover:bg-amber-300">{td("previewClose")}</button>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">

            <div className={`relative flex h-52 items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-black/10" />
              {thumbnailUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
                : <span className="relative text-7xl drop-shadow-lg">{emoji || "🎮"}</span>
              }
            </div>

            <div className="p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{catLabel}</span>
              </div>

              <h1 className="mb-1 text-2xl font-bold text-gray-900">{title || td("noTitle")}</h1>

              {ownerNickname && (
                <p className="mb-3 text-sm text-gray-500">
                  {td("previewMaker")} <span className="font-medium text-blue-600">{ownerNickname}</span>
                </p>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="text-lg text-gray-300">★★★★★</span>
                  <span>{td("noRating")}</span>
                </div>
              </div>

              {description && (
                <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-gray-600">{description}</p>
              )}

              {tags.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">{tag}</span>
                  ))}
                </div>
              )}

              <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-400">
                {publishedAt && <span>📅 {new Date(publishedAt).toLocaleDateString()}</span>}
              </div>

              <div className="flex gap-3">
                <div className="rounded-xl bg-[#0170bd] px-6 py-3 text-sm font-semibold text-white opacity-70">
                  {td("playButton")}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl text-gray-300">♡</div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-center text-[10px] text-zinc-400">{td("previewNote")}</p>
        </div>
      </div>
    </div>
  );
}

/** 네이티브 file input을 숨기고 커스텀 버튼을 표시하는 래퍼 */
function FileInput({ id, accept, multiple, disabled, onChange, fileName, chooseLabel, noFileLabel, variant = "primary" }: {
  id: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileName?: string | null;
  chooseLabel: string;
  noFileLabel: string;
  variant?: "primary" | "secondary";
}) {
  const btnCls = variant === "primary"
    ? "rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
    : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 cursor-pointer dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200";
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className={btnCls} style={disabled ? { pointerEvents: "none", opacity: 0.6 } : {}}>
        {chooseLabel}
      </label>
      <input id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={onChange} className="sr-only" />
      <span className="text-sm text-zinc-500 dark:text-zinc-400 truncate max-w-xs">
        {fileName || noFileLabel}
      </span>
    </div>
  );
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
type Category = string;
const LANGS = ["ko", "en", "ja", "zh"] as const;
type Lang = typeof LANGS[number];
const LANG_LABEL: Record<Lang, string> = { ko: "🇰🇷 한국어", en: "🇺🇸 English", ja: "🇯🇵 日本語", zh: "🇨🇳 中文" };

export default function DevelopPage() {
  const router = useRouter();
  const t = useTranslations("Develop");

  const [slug, setSlug] = useState("");
  const [titleLang, setTitleLang] = useState<Lang>("ko");
  const [i18nTitles, setI18nTitles] = useState<Record<Lang, string>>({ ko: "", en: "", ja: "", zh: "" });
  const [i18nDescs,  setI18nDescs]  = useState<Record<Lang, string>>({ ko: "", en: "", ja: "", zh: "" });
  // 기존 title/description — i18nTitles.ko와 동기
  const title = i18nTitles.ko || i18nTitles.en || i18nTitles.ja || i18nTitles.zh;
  const description = i18nDescs[titleLang];
  const [emoji, setEmoji] = useState("🎮");
  const [category, setCategory] = useState<Category>("other");
  const [genre, setGenre] = useState<string>("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [demoVideo, setDemoVideo] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 내 게임 목록 + 재업로드 상태
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [myGamesLoading, setMyGamesLoading] = useState(false);
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [perGameMsg, setPerGameMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [cancelConfirmSlug, setCancelConfirmSlug] = useState<string | null>(null);
  const [cancelKind, setCancelKind] = useState<"submission" | "update" | null>(null);
  const [cancelingSlug, setCancelingSlug] = useState<string | null>(null);
  // 미디어 단독 수정
  const [mediaEditSlug,    setMediaEditSlug]    = useState<string | null>(null);
  const [updatingMediaSlug, setUpdatingMediaSlug] = useState<string | null>(null);
  // 상세 미리보기
  const [showDetailPreview, setShowDetailPreview] = useState(false);
  const [detailPreviewGame, setDetailPreviewGame] = useState<MyGame | null>(null);
  const [myToken, setMyToken] = useState<string | null>(null);
  const [categories, setCategories] = useState<GameCategory[]>([]);
  const [genreList, setGenreList] = useState<import("@/lib/api").GameGenre[]>([]);

  // 메타 수정 모달
  const [metaEditGame, setMetaEditGame] = useState<MyGame | null>(null);
  const [metaForm, setMetaForm] = useState({ emoji: "", category: "", genre: "", tagsRaw: "" });
  const [metaLang, setMetaLang] = useState<Lang>("ko");
  const [metaI18nTitles, setMetaI18nTitles] = useState<Record<Lang, string>>({ ko: "", en: "", ja: "", zh: "" });
  const [metaI18nDescs,  setMetaI18nDescs]  = useState<Record<Lang, string>>({ ko: "", en: "", ja: "", zh: "" });
  const [metaThumb, setMetaThumb] = useState<File | null>(null);
  const [metaVideo, setMetaVideo] = useState<File | null>(null);
  const [metaSubmitting, setMetaSubmitting] = useState(false);
  const [metaCancelConfirm, setMetaCancelConfirm] = useState<string | null>(null);

  useEffect(() => { setMyToken(session.getToken()); }, []);
  useEffect(() => { void api.getCategories().then((r) => setCategories(r.categories)).catch(() => {}); }, []);
  useEffect(() => { void api.getGenres().then((r) => setGenreList(r.genres)).catch(() => {}); }, []);

  useEffect(() => {
    if (!session.getToken()) router.replace("/login");
  }, [router]);

  async function loadMyGames() {
    const tk = session.getToken();
    if (!tk) return;
    setMyGamesLoading(true);
    try {
      const res = await fetch("/api/games/mine", {
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { games?: MyGame[] };
      setMyGames(data.games ?? []);
    } catch {
      /* ignore */
    } finally {
      setMyGamesLoading(false);
    }
  }

  useEffect(() => {
    void loadMyGames();
  }, []);

  function openMetaEdit(g: MyGame) {
    const gi = g as MyGame & { titlesI18n?: Record<string,string>; descriptionsI18n?: Record<string,string> };
    setMetaForm({
      emoji: g.emoji,
      category: g.category,
      genre: g.genre ?? "",
      tagsRaw: Array.isArray(g.tags) ? (g.tags as string[]).join(", ") : "",
    });
    setMetaI18nTitles({ ko: gi.titlesI18n?.ko ?? g.title, en: gi.titlesI18n?.en ?? "", ja: gi.titlesI18n?.ja ?? "", zh: gi.titlesI18n?.zh ?? "" });
    setMetaI18nDescs({ ko: gi.descriptionsI18n?.ko ?? g.description ?? "", en: gi.descriptionsI18n?.en ?? "", ja: gi.descriptionsI18n?.ja ?? "", zh: gi.descriptionsI18n?.zh ?? "" });
    setMetaLang("ko");
    setMetaThumb(null);
    setMetaVideo(null);
    setMetaEditGame(g);
  }

  async function onSubmitMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!metaEditGame) return;
    const tk = session.getToken();
    if (!tk) return;
    setMetaSubmitting(true);
    try {
      const tags = metaForm.tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const primaryTitle = metaI18nTitles.ko || metaI18nTitles.en || metaI18nTitles.ja || metaI18nTitles.zh;
      await import("@/lib/api").then(({ api }) =>
        api.submitPendingMeta(tk, metaEditGame.slug, {
          title: primaryTitle,
          description: metaI18nDescs.ko || metaI18nDescs.en || "",
          emoji: metaForm.emoji,
          category: metaForm.category,
          genre: metaForm.genre || undefined,
          tags,
          titlesI18n: metaI18nTitles,
          descriptionsI18n: metaI18nDescs,
        })
      );
      if (metaThumb || metaVideo) {
        await onUpdateMedia(metaEditGame.slug, metaThumb, metaVideo);
      }
      await loadMyGames();
      setMetaEditGame(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setMetaSubmitting(false);
    }
  }

  async function onCancelMeta(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    await import("@/lib/api").then(({ api }) => api.cancelPendingMeta(tk, slug));
    setMetaCancelConfirm(null);
    await loadMyGames();
  }

  async function onReupload(slugTarget: string, picked: File) {
    const tk = session.getToken();
    if (!tk) {
      router.replace("/login");
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setPerGameMsg((m) => ({
        ...m,
        [slugTarget]: { ok: false, text: t("errorFileTooLarge", { mb: MAX_UPLOAD_BYTES / 1024 / 1024 }) },
      }));
      return;
    }
    const fd = new FormData();
    fd.append("gamezip", picked);
    setUpdatingSlug(slugTarget);
    setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: true, text: t("updating") } }));
    try {
      const res = await fetch(`/api/games/${slugTarget}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        game?: { version: number; uploadedBytes: number };
        error?: { message?: string };
      };
      if (!res.ok || !data.ok) {
        setPerGameMsg((m) => ({
          ...m,
          [slugTarget]: { ok: false, text: data.error?.message || t("errorGeneric", { status: res.status }) },
        }));
        return;
      }
      setPerGameMsg((m) => ({
        ...m,
        [slugTarget]: {
          ok: true,
          text: t("updateSuccess", {
            version: data.game?.version ?? "?",
            kb: ((data.game?.uploadedBytes ?? 0) / 1024).toFixed(1),
          }),
        },
      }));
      void loadMyGames();
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: t("errorNetwork") } }));
    } finally {
      setUpdatingSlug(null);
    }
  }

  async function onCancelUpdate(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setCancelingSlug(slug);
    try {
      const res = await fetch(`/api/games/${slug}/pending-update`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: d.error?.message || t("cancelFail") } }));
      } else {
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: true, text: t("cancelUpdateSuccess") } }));
        void loadMyGames();
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: t("errorNetwork") } }));
    } finally {
      setCancelingSlug(null);
      setCancelConfirmSlug(null);
      setCancelKind(null);
    }
  }

  async function onCancelSubmission(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setCancelingSlug(slug);
    try {
      const res = await fetch(`/api/games/${slug}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: d.error?.message || t("cancelFail") } }));
      } else {
        setMyGames((prev) => prev.filter((g) => g.slug !== slug));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: t("errorNetwork") } }));
    } finally {
      setCancelingSlug(null);
      setCancelConfirmSlug(null);
      setCancelKind(null);
    }
  }

  async function onUpdateMedia(slugTarget: string, thumb: File | null, video: File | null) {
    const tk = session.getToken();
    if (!tk || (!thumb && !video)) return;
    setUpdatingMediaSlug(slugTarget);
    const fd = new FormData();
    if (thumb) fd.append("thumbnail", thumb);
    if (video) fd.append("demoVideo",  video);
    try {
      const res = await fetch(`/api/games/${slugTarget}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; pending?: boolean; error?: { message?: string } };
      if (data.ok) {
        setPerGameMsg((m) => ({
          ...m,
          [slugTarget]: {
            ok: true,
            text: data.pending ? t("mediaPending") : t("mediaApplied"),
          },
        }));
        setMediaEditSlug(null);
        void loadMyGames();
      } else {
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: data.error?.message || t("mediaUploadFail") } }));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: t("errorNetwork") } }));
    } finally {
      setUpdatingMediaSlug(null);
    }
  }

  async function onCancelMedia(slugTarget: string) {
    const tk = session.getToken();
    if (!tk) return;
    try {
      const res = await fetch(`/api/games/${slugTarget}/pending-media`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tk}` },
      });
      if (res.ok) {
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: true, text: t("mediaCancelSuccess") } }));
        void loadMyGames();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: d.error?.message || t("cancelFail") } }));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: t("errorNetwork") } }));
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setErrorMsg(t("errorFileTooLarge", { mb: MAX_UPLOAD_BYTES / 1024 / 1024 }));
    } else {
      setErrorMsg(null);
    }
  }

  function onThumbnailChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setThumbnail(f);
    setThumbnailPreview(null);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setThumbnailPreview(ev.target?.result as string ?? null);
      reader.readAsDataURL(f);
    }
  }

  function onDemoVideoChange(e: ChangeEvent<HTMLInputElement>) {
    setDemoVideo(e.target.files?.[0] ?? null);
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
    const primaryTitle = title.trim();
    if (!slug.trim() || !primaryTitle) {
      setErrorMsg(t("errorMissingMeta"));
      return;
    }

    const fd = new FormData();
    fd.append("gamezip", file);
    fd.append("slug", slug.trim().toLowerCase());
    fd.append("title", primaryTitle);
    fd.append("description", (i18nDescs.ko || i18nDescs.en || i18nDescs.ja || i18nDescs.zh).trim());
    fd.append("titlesI18n", JSON.stringify(i18nTitles));
    fd.append("descriptionsI18n", JSON.stringify(i18nDescs));
    fd.append("emoji", emoji.trim() || "🎮");
    fd.append("category", category);
    if (genre) fd.append("genre", genre);
    const tagList = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagList.length > 0) fd.append("tags", JSON.stringify(tagList));
    if (thumbnail)  fd.append("thumbnail", thumbnail);
    if (demoVideo)  fd.append("demoVideo",  demoVideo);
    screenshots.forEach((f) => fd.append("screenshots", f));

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
      setSlug(""); setI18nTitles({ko:"",en:"",ja:"",zh:""}); setI18nDescs({ko:"",en:"",ja:"",zh:""}); setEmoji("🎮");
      setCategory("other"); setTagsRaw(""); setFile(null);
      setThumbnail(null); setThumbnailPreview(null); setDemoVideo(null);
      (document.getElementById("gamezip-input") as HTMLInputElement | null)?.value && ((document.getElementById("gamezip-input") as HTMLInputElement).value = "");
      (document.getElementById("thumbnail-input") as HTMLInputElement | null)?.value && ((document.getElementById("thumbnail-input") as HTMLInputElement).value = "");
      (document.getElementById("video-input") as HTMLInputElement | null)?.value && ((document.getElementById("video-input") as HTMLInputElement).value = "");
    } catch {
      setErrorMsg(t("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("breadcrumb")}</p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/develop/profile" className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40">
            {t("navProfile")}
          </Link>
          <Link href="/develop/stats" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
            {t("navStats")}
          </Link>
          <Link href="/develop/multiplayer" className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40">
            {t("navMultiplayer")}
          </Link>
          <Link href="/develop/inventory" className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
            {t("navInventory")}
          </Link>
          <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            {t("backHome")}
          </Link>
        </div>
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
          <FileInput
            id="gamezip-input"
            accept=".zip,application/zip"
            onChange={onFileChange}
            disabled={submitting}
            fileName={file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : null}
            chooseLabel={t("chooseFile")}
            noFileLabel={t("noFileSelected")}
            variant="primary"
          />
        </div>

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

        {/* 제목 / 설명 — 언어별 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">{t("fieldTitle")} / {t("fieldDescription")}</label>
            <select value={titleLang} onChange={(e) => setTitleLang(e.target.value as Lang)}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900">
              {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
            </select>
          </div>
          <input
            type="text"
            placeholder={`${t("titlePlaceholder")} (${LANG_LABEL[titleLang]})`}
            value={i18nTitles[titleLang]}
            onChange={(e) => setI18nTitles((p) => ({ ...p, [titleLang]: e.target.value }))}
            maxLength={120}
            disabled={submitting}
            className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <textarea
            placeholder={`${t("descPlaceholder")} (${LANG_LABEL[titleLang]})`}
            value={i18nDescs[titleLang]}
            onChange={(e) => setI18nDescs((p) => ({ ...p, [titleLang]: e.target.value }))}
            maxLength={2000}
            rows={3}
            disabled={submitting}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <p className="mt-1 text-right text-xs text-zinc-500">{i18nDescs[titleLang].length} / 2000</p>
        </div>

        {/* ── 썸네일 이미지 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("fieldThumbnail")} <span className="font-normal text-zinc-500">{t("thumbnailHint")}</span>
          </label>
          <FileInput
            id="thumbnail-input"
            accept="image/jpeg,image/png,image/webp"
            onChange={onThumbnailChange}
            disabled={submitting}
            fileName={thumbnail?.name ?? null}
            chooseLabel={t("chooseFile")}
            noFileLabel={t("noFileSelected")}
            variant="secondary"
          />
          {thumbnailPreview && (
            <img src={thumbnailPreview} alt="preview" className="mt-2 h-32 w-auto rounded-lg object-cover ring-1 ring-zinc-200" />
          )}
        </div>

        {/* ── 미리보기 ── */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">{t("previewCard")}</p>
          <div className="flex flex-wrap items-end gap-4">
            <CardPreview title={title} emoji={emoji || "🎮"} category={category} thumbnailUrl={thumbnailPreview}
              noTitle={t("noTitle")} catLabel={({ earn: t("catLabelEarn"), multiplay: t("catLabelMultiplay"), decorate: t("catLabelDecorate"), other: t("catLabelOther") }[category] ?? category)} />
            <button
              type="button"
              onClick={() => setShowDetailPreview(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {t("previewDetailBtn")}
            </button>
          </div>
        </div>

        {/* ── 데모 영상 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("fieldDemoVideo")} <span className="font-normal text-zinc-500">{t("demoVideoHint")}</span>
          </label>
          <FileInput
            id="video-input"
            accept="video/mp4,video/webm"
            onChange={onDemoVideoChange}
            disabled={submitting}
            fileName={demoVideo ? `${demoVideo.name} · ${(demoVideo.size / 1024 / 1024).toFixed(1)} MB` : null}
            chooseLabel={t("chooseFile")}
            noFileLabel={t("noFileSelected")}
            variant="secondary"
          />
        </div>

        {/* ── 스크린샷 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("fieldScreenshots")} <span className="font-normal text-zinc-500">{t("screenshotsHint")}</span>
          </label>
          <FileInput
            id="screenshots-input"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={submitting}
            onChange={(e) => setScreenshots(Array.from(e.target.files ?? []).slice(0, 5))}
            fileName={screenshots.length > 0 ? t("filesSelected", { n: screenshots.length }) : null}
            chooseLabel={t("chooseFile")}
            noFileLabel={t("noFileSelected")}
            variant="secondary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldCategory")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.emoji} {c.labelKo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("fieldGenre")}</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              <option value="">{t("fieldGenreNone")}</option>
              {genreList.map((g) => (
                <option key={g.slug} value={g.slug}>{g.emoji} {g.labelKo}</option>
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

      {/* ── 내 게임: 재업로드 ── */}
      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{t("mineSection")}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("mineSubtitle")}</p>

        {myGamesLoading && (
          <p className="mt-4 text-sm text-zinc-500">{t("mineLoading")}</p>
        )}

        {!myGamesLoading && myGames.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">{t("mineEmpty")}</p>
        )}

        {!myGamesLoading && myGames.length > 0 && (
          <ul className="mt-4 space-y-3">
            {myGames.map((g) => {
              const msg = perGameMsg[g.slug];
              const isUpdating = updatingSlug === g.slug;
              const isCanceling = cancelingSlug === g.slug;
              const hasPending = !!g.pendingStoragePath;
              const isConfirming = cancelConfirmSlug === g.slug;
              return (
                <li
                  key={g.slug}
                  className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl" aria-hidden>{g.emoji || "🎮"}</span>
                      <div>
                        <p className="font-medium">
                          {g.title}
                          {hasPending && (
                            <span className="ml-2 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                              {t("pendingBadge")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500">
                          <code>{g.slug}</code> · {g.kind} · {g.status} · v{g.version}
                          {hasPending && g.pendingVersion && ` → v${g.pendingVersion}`}
                        </p>
                        {g.pendingRejectReason && !hasPending && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            {t("lastUpdateRejected", { reason: g.pendingRejectReason })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 테스트 플레이 버튼 */}
                      {(() => {
                        // hasPending: 업데이트 파일이 staging에 있음 → /_preview/
                        // 그 외(첫 업로드 pending 포함): 파일이 games/{slug}/에 있음 → 라이브 URL
                        const baseUrl = hasPending
                          ? `https://play.airliveplay.com/_preview/${g.slug}/`
                          : `https://play.airliveplay.com/${g.slug}/`;
                        const testUrl = myToken ? `${baseUrl}?token=${myToken}` : baseUrl;
                        const label = hasPending ? t("previewUpdate") : t("testPlay");
                        return (
                          <>
                            <a
                              href={testUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                            >
                              {label}
                            </a>
                            <button
                              onClick={() => { setDetailPreviewGame(g); }}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                              {t("detailPreview")}
                            </button>
                            <button
                              onClick={() => {
                                void navigator.clipboard.writeText(testUrl).then(() => {
                                  setCopiedSlug(g.slug);
                                  setTimeout(() => setCopiedSlug(null), 2000);
                                });
                              }}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                              {copiedSlug === g.slug ? t("linkCopied") : t("copyLink")}
                            </button>
                          </>
                        );
                      })()}
                      <input
                        id={`reupload-${g.slug}`}
                        type="file"
                        accept=".zip,application/zip"
                        disabled={isUpdating}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void onReupload(g.slug, f);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <label
                        htmlFor={`reupload-${g.slug}`}
                        className={`cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-white ${
                          isUpdating ? "bg-zinc-400" : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {isUpdating ? t("updating") : t("updateButton")}
                      </label>

                      {/* 취소 버튼 */}
                      {hasPending && (
                        <button
                          onClick={() => { setCancelConfirmSlug(g.slug); setCancelKind("update"); }}
                          disabled={isCanceling || isUpdating}
                          className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400"
                        >
                          {t("cancelUpdate")}
                        </button>
                      )}
                      {!hasPending && g.status === "pending" && (
                        <button
                          onClick={() => { setCancelConfirmSlug(g.slug); setCancelKind("submission"); }}
                          disabled={isCanceling || isUpdating}
                          className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400"
                        >
                          {t("cancelSubmission")}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 수정 버튼 + 검수 대기 뱃지 */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openMetaEdit(g)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                    >
                      {t("editMeta")}
                    </button>
                    {(g.pendingMetaAt || g.pendingMediaAt) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {t("pendingReview")}
                        <button onClick={() => setMetaCancelConfirm(g.slug)} className="ml-1 opacity-60 hover:opacity-100">✕</button>
                      </span>
                    )}
                    {g.pendingMetaRejectReason && !g.pendingMetaAt && (
                      <span className="text-[10px] text-red-500">{t("metaRejectPrefix")} {g.pendingMetaRejectReason}</span>
                    )}
                    {g.pendingMediaRejectReason && !g.pendingMediaAt && (
                      <span className="text-[10px] text-red-500">{t("mediaRejectPrefix")} {g.pendingMediaRejectReason}</span>
                    )}
                  </div>


                  {/* 취소 확인 패널 */}
                  {isConfirming && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
                      <p className="text-xs text-red-800 dark:text-red-300">
                        {cancelKind === "update"
                          ? t("cancelUpdateConfirm", { title: g.title })
                          : t("cancelSubmissionConfirm", { title: g.title })}
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => { setCancelConfirmSlug(null); setCancelKind(null); }}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          {t("goBack")}
                        </button>
                        <button
                          onClick={() => {
                            if (cancelKind === "update") void onCancelUpdate(g.slug);
                            else void onCancelSubmission(g.slug);
                          }}
                          disabled={isCanceling}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {isCanceling ? t("processing") : cancelKind === "update" ? t("confirmCancelUpdate") : t("confirmCancelSubmission")}
                        </button>
                      </div>
                    </div>
                  )}

                  {msg && (
                    <div
                      className={`mt-3 rounded-md p-2 text-xs ${
                        msg.ok
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 새 게임 폼: 상세 페이지 미리보기 모달 ── */}
      {showDetailPreview && (
        <DetailPreviewModal
          title={title}
          description={description}
          emoji={emoji || "🎮"}
          category={category}
          tags={tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)}
          thumbnailUrl={thumbnailPreview}
          onClose={() => setShowDetailPreview(false)}
          td={t}
        />
      )}

      {/* ── 기존 게임: 상세 페이지 미리보기 모달 ── */}
      {detailPreviewGame && (
        <DetailPreviewModal
          title={detailPreviewGame.title}
          description={detailPreviewGame.description ?? ""}
          emoji={detailPreviewGame.emoji || "🎮"}
          category={detailPreviewGame.category}
          tags={Array.isArray(detailPreviewGame.tags) ? (detailPreviewGame.tags as string[]) : []}
          thumbnailUrl={detailPreviewGame.pendingThumbnailUrl ?? detailPreviewGame.thumbnailUrl ?? null}
          publishedAt={detailPreviewGame.publishedAt}
          onClose={() => setDetailPreviewGame(null)}
          td={t}
        />
      )}

      {/* ── 메타 수정 모달 ── */}
      {metaEditGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setMetaEditGame(null)}>
          <form
            onSubmit={(e) => void onSubmitMeta(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
          >
            <h3 className="mb-4 text-base font-bold text-zinc-900 dark:text-white">{t("metaEditTitle")} — {metaEditGame.slug}</h3>
            <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {t("metaEditNotice")}
            </p>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="mb-1 block text-xs text-zinc-500">{t("metaFieldEmoji")}</label>
                  <input value={metaForm.emoji} onChange={(e) => setMetaForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-center text-lg dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-zinc-500">{t("metaFieldTitleDesc")}</label>
                    <select value={metaLang} onChange={(e) => setMetaLang(e.target.value as Lang)}
                      className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] dark:border-zinc-600 dark:bg-zinc-800 dark:text-white">
                      {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
                    </select>
                  </div>
                  <input value={metaI18nTitles[metaLang]} onChange={(e) => setMetaI18nTitles((p) => ({ ...p, [metaLang]: e.target.value }))}
                    placeholder={`${t("titlePlaceholder")} (${LANG_LABEL[metaLang]})`}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
              </div>
              <div>
                <textarea rows={3} value={metaI18nDescs[metaLang]} onChange={(e) => setMetaI18nDescs((p) => ({ ...p, [metaLang]: e.target.value }))}
                  placeholder={`${t("descPlaceholder")} (${LANG_LABEL[metaLang]})`}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">{t("metaFieldCategory")}</label>
                  <select value={metaForm.category} onChange={(e) => setMetaForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white">
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.emoji} {c.labelKo}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">{t("metaFieldGenre")}</label>
                  <select value={metaForm.genre} onChange={(e) => setMetaForm((f) => ({ ...f, genre: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white">
                    <option value="">{t("fieldGenreNone")}</option>
                    {genreList.map((g) => (
                      <option key={g.slug} value={g.slug}>{g.emoji} {g.labelKo}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">{t("metaFieldTags")}</label>
                  <input value={metaForm.tagsRaw} onChange={(e) => setMetaForm((f) => ({ ...f, tagsRaw: e.target.value }))}
                    placeholder={t("metaTagsPlaceholder")}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
              </div>

              {/* 썸네일 / 영상 */}
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <p className="mb-2 text-xs font-medium text-zinc-500">{t("metaMediaSection")}</p>
                {metaEditGame && (metaEditGame.pendingThumbnailUrl || metaEditGame.thumbnailUrl) && (
                  <div className="mb-2">
                    <p className="mb-1 text-[10px] text-zinc-400">{metaEditGame.pendingThumbnailUrl ? t("metaThumbPending") : t("metaThumbCurrent")}</p>
                    <CardPreview
                      title={metaEditGame.title}
                      emoji={metaEditGame.emoji || "🎮"}
                      category={metaEditGame.category || "other"}
                      thumbnailUrl={metaEditGame.pendingThumbnailUrl ?? metaEditGame.thumbnailUrl ?? null}
                      noTitle={t("noTitle")}
                      catLabel={({ earn: t("catLabelEarn"), multiplay: t("catLabelMultiplay"), decorate: t("catLabelDecorate"), other: t("catLabelOther") }[metaEditGame.category] ?? metaEditGame.category)}
                    />
                  </div>
                )}
                {metaEditGame?.pendingMediaAt && (
                  <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                    {t("metaMediaPending")} —{" "}
                    <button type="button" onClick={() => void onCancelMedia(metaEditGame.slug).then(() => void loadMyGames())}
                      className="underline hover:no-underline">{t("metaMediaCancelLink")}</button>
                  </div>
                )}
                <div className="space-y-2">
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">{t("metaNewThumb")}</p>
                    <FileInput id="meta-thumb-input" accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setMetaThumb(e.target.files?.[0] ?? null)}
                      fileName={metaThumb?.name ?? null}
                      chooseLabel={t("chooseFile")} noFileLabel={t("noFileSelected")} variant="secondary" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">{t("metaNewVideo")}</p>
                    <FileInput id="meta-video-input" accept="video/mp4,video/webm"
                      onChange={(e) => setMetaVideo(e.target.files?.[0] ?? null)}
                      fileName={metaVideo?.name ?? null}
                      chooseLabel={t("chooseFile")} noFileLabel={t("noFileSelected")} variant="secondary" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMetaEditGame(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">
                {t("metaCancel")}
              </button>
              <button type="submit" disabled={metaSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {metaSubmitting ? t("metaSubmitting") : t("metaSubmit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── 메타 취소 확인 ── */}
      {metaCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setMetaCancelConfirm(null)}>
          <div className="rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">{t("metaCancelConfirmMsg")}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMetaCancelConfirm(null)} className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">{t("metaCancelClose")}</button>
              <button onClick={() => void onCancelMeta(metaCancelConfirm)} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">{t("metaCancelConfirmBtn")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
