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

type MyGame = {
  slug: string;
  title: string;
  emoji: string;
  kind: string;
  status: string;
  version: number;
  updatedAt: string;
  pendingStoragePath?: string | null;
  pendingVersion?: number | null;
  pendingUploadedAt?: string | null;
  pendingRejectReason?: string | null;
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
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: d.error?.message || "취소 실패" } }));
      } else {
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: true, text: "업데이트가 취소됐습니다." } }));
        void loadMyGames();
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: "네트워크 오류" } }));
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
        setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: d.error?.message || "취소 실패" } }));
      } else {
        setMyGames((prev) => prev.filter((g) => g.slug !== slug));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slug]: { ok: false, text: "네트워크 오류" } }));
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
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: { message?: string } };
      setPerGameMsg((m) => ({
        ...m,
        [slugTarget]: {
          ok: !!data.ok,
          text: data.ok ? "미디어가 업데이트됐습니다." : (data.error?.message || "업로드 실패"),
        },
      }));
      if (data.ok) setMediaEditSlug(null);
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: "네트워크 오류" } }));
    } finally {
      setUpdatingMediaSlug(null);
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
      setSlug(""); setTitle(""); setDescription(""); setEmoji("🎮");
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
          <Link href="/develop/multiplayer" className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40">
            🎮 멀티플레이 가이드
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

        {/* ── 썸네일 이미지 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            🖼 썸네일 이미지 <span className="font-normal text-zinc-500">(선택 · JPG/PNG/WebP · 최대 5MB)</span>
          </label>
          <input
            id="thumbnail-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onThumbnailChange}
            disabled={submitting}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-60 dark:file:bg-zinc-800 dark:file:text-zinc-200"
          />
          {thumbnailPreview && (
            <img src={thumbnailPreview} alt="preview" className="mt-2 h-32 w-auto rounded-lg object-cover ring-1 ring-zinc-200" />
          )}
        </div>

        {/* ── 데모 영상 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            🎬 데모 영상 <span className="font-normal text-zinc-500">(선택 · MP4/WebM · 최대 200MB)</span>
          </label>
          <input
            id="video-input"
            type="file"
            accept="video/mp4,video/webm"
            onChange={onDemoVideoChange}
            disabled={submitting}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-60 dark:file:bg-zinc-800 dark:file:text-zinc-200"
          />
          {demoVideo && (
            <p className="mt-1 text-xs text-zinc-500">{demoVideo.name} · {(demoVideo.size / 1024 / 1024).toFixed(1)} MB</p>
          )}
        </div>

        {/* ── 스크린샷 ── */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            📸 스크린샷 <span className="font-normal text-zinc-500">(선택 · 최대 5장 · JPG/PNG/WebP · 각 5MB↓)</span>
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={submitting}
            onChange={(e) => setScreenshots(Array.from(e.target.files ?? []).slice(0, 5))}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-60 dark:file:bg-zinc-800 dark:file:text-zinc-200"
          />
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
                        const testUrl = hasPending
                          ? `https://play.airliveplay.com/_preview/${g.slug}/`
                          : `https://play.airliveplay.com/${g.slug}/`;
                        const label = hasPending ? "🔍 업데이트 미리보기" : "▶ 테스트 플레이";
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
                              onClick={() => {
                                void navigator.clipboard.writeText(testUrl).then(() => {
                                  setCopiedSlug(g.slug);
                                  setTimeout(() => setCopiedSlug(null), 2000);
                                });
                              }}
                              title="테스트 URL 복사 — 다른 사람에게 공유해 같이 테스트하세요"
                              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                              {copiedSlug === g.slug ? "✓ 복사됨" : "🔗 링크 복사"}
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
                          업데이트 취소
                        </button>
                      )}
                      {!hasPending && g.status === "pending" && (
                        <button
                          onClick={() => { setCancelConfirmSlug(g.slug); setCancelKind("submission"); }}
                          disabled={isCanceling || isUpdating}
                          className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400"
                        >
                          배포 취소
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 미디어 수정 버튼 */}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMediaEditSlug((prev) => prev === g.slug ? null : g.slug)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                    >
                      🖼 썸네일 · 영상 수정
                    </button>
                  </div>

                  {/* 미디어 수정 패널 */}
                  {mediaEditSlug === g.slug && (() => {
                    let localThumb: File | null = null;
                    let localVideo: File | null = null;
                    return (
                      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            🖼 썸네일 (JPG/PNG/WebP · 5MB↓)
                          </label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => { localThumb = e.target.files?.[0] ?? null; }}
                            className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs dark:file:bg-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            🎬 데모 영상 (MP4/WebM · 200MB↓)
                          </label>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            onChange={(e) => { localVideo = e.target.files?.[0] ?? null; }}
                            className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs dark:file:bg-zinc-700"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={updatingMediaSlug === g.slug}
                            onClick={() => void onUpdateMedia(g.slug, localThumb, localVideo)}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {updatingMediaSlug === g.slug ? "업로드 중…" : "업로드"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaEditSlug(null)}
                            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            닫기
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 취소 확인 패널 */}
                  {isConfirming && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
                      <p className="text-xs text-red-800 dark:text-red-300">
                        {cancelKind === "update"
                          ? `"${g.title}"의 검수 대기 중인 업데이트를 취소합니다. 라이브 버전은 유지됩니다.`
                          : `"${g.title}"의 배포 신청을 취소하고 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => { setCancelConfirmSlug(null); setCancelKind(null); }}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          돌아가기
                        </button>
                        <button
                          onClick={() => {
                            if (cancelKind === "update") void onCancelUpdate(g.slug);
                            else void onCancelSubmission(g.slug);
                          }}
                          disabled={isCanceling}
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {isCanceling ? "처리 중…" : cancelKind === "update" ? "업데이트 취소 확인" : "배포 취소 확인"}
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
    </div>
  );
}
