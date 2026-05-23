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
};

const CAT_BG: Record<string, string> = {
  earn:      "from-amber-400 to-orange-500",
  multiplay: "from-sky-500 to-blue-600",
  decorate:  "from-pink-400 to-rose-500",
  other:     "from-violet-500 to-purple-600",
};

const CAT_LABEL: Record<string, string> = {
  earn: "돈 버는 게임", multiplay: "멀티플레이 게임",
  decorate: "꾸미기 게임", other: "기타",
};

function CardPreview({ title, emoji, category, thumbnailUrl }: {
  title: string; emoji: string; category: string; thumbnailUrl: string | null;
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
        <p className="text-xs font-semibold text-gray-900 line-clamp-1">{title || "(제목 없음)"}</p>
        <p className="mt-0.5 text-[10px] capitalize text-zinc-400">{CAT_LABEL[category] ?? category}</p>
      </div>
    </div>
  );
}

function DetailPreviewModal({ title, description, emoji, category, tags, thumbnailUrl, ownerNickname, publishedAt, onClose }: {
  title: string; description: string; emoji: string; category: string;
  tags: string[]; thumbnailUrl: string | null; ownerNickname?: string;
  publishedAt?: string | null; onClose: () => void;
}) {
  const gradient = CAT_BG[category] ?? CAT_BG.other;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative my-8 w-full max-w-2xl rounded-2xl bg-[#f5f5f5] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* 미리보기 배너 */}
        <div className="flex items-center justify-between rounded-t-2xl bg-amber-100 px-4 py-2.5 text-xs font-medium text-amber-900">
          <span>📋 상세 페이지 미리보기</span>
          <button type="button" onClick={onClose} className="rounded-full bg-amber-200 px-2 py-0.5 hover:bg-amber-300">닫기 ✕</button>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">

            {/* 썸네일 */}
            <div className={`relative flex h-52 items-center justify-center overflow-hidden bg-gradient-to-br ${gradient}`}>
              <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-black/10" />
              {thumbnailUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
                : <span className="relative text-7xl drop-shadow-lg">{emoji || "🎮"}</span>
              }
            </div>

            {/* 정보 영역 */}
            <div className="p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  {CAT_LABEL[category] ?? "기타"}
                </span>
              </div>

              <h1 className="mb-1 text-2xl font-bold text-gray-900">{title || "(제목 없음)"}</h1>

              {ownerNickname && (
                <p className="mb-3 text-sm text-gray-500">
                  제작자: <span className="font-medium text-blue-600">{ownerNickname}</span>
                </p>
              )}

              {/* 별점 — 미리보기용 정적 표시 */}
              <div className="mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="text-lg text-gray-300">★★★★★</span>
                  <span>아직 평점이 없습니다</span>
                </div>
              </div>

              {description && (
                <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                  {description}
                </p>
              )}

              {tags.length > 0 && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">{tag}</span>
                  ))}
                </div>
              )}

              <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-400">
                {publishedAt && <span>📅 {new Date(publishedAt).toLocaleDateString("ko-KR")}</span>}
              </div>

              <div className="flex gap-3">
                <div className="rounded-xl bg-[#0170bd] px-6 py-3 text-sm font-semibold text-white opacity-70">
                  ▶ 게임 시작
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl text-gray-300">
                  ♡
                </div>
              </div>
            </div>
          </div>

          <p className="mt-3 text-center text-[10px] text-zinc-400">
            실제 게임 상세 페이지와 유사합니다. 댓글·평점은 실제 페이지에서 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

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
  // 상세 미리보기
  const [showDetailPreview, setShowDetailPreview] = useState(false);
  const [detailPreviewGame, setDetailPreviewGame] = useState<MyGame | null>(null);

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
      const data = await res.json().catch(() => ({})) as { ok?: boolean; pending?: boolean; error?: { message?: string } };
      if (data.ok) {
        setPerGameMsg((m) => ({
          ...m,
          [slugTarget]: {
            ok: true,
            text: data.pending ? "검수 신청됐습니다. 운영자 승인 후 적용됩니다." : "미디어가 업데이트됐습니다.",
          },
        }));
        setMediaEditSlug(null);
        void loadMyGames();
      } else {
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: data.error?.message || "업로드 실패" } }));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: "네트워크 오류" } }));
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
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: true, text: "미디어 검수 신청이 취소됐습니다." } }));
        void loadMyGames();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: d.error?.message || "취소 실패" } }));
      }
    } catch {
      setPerGameMsg((m) => ({ ...m, [slugTarget]: { ok: false, text: "네트워크 오류" } }));
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
          <Link href="/develop/profile" className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40">
            👤 프로필 편집
          </Link>
          <Link href="/develop/stats" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40">
            📊 통계 보기
          </Link>
          <Link href="/develop/multiplayer" className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40">
            🎮 멀티플레이 가이드
          </Link>
          <Link href="/develop/inventory" className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-900/40">
            🎒 공유 인벤토리 가이드
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

        {/* ── 미리보기 ── */}
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">📋 미리보기</p>
          <div className="flex flex-wrap items-end gap-4">
            <CardPreview title={title} emoji={emoji || "🎮"} category={category} thumbnailUrl={thumbnailPreview} />
            <button
              type="button"
              onClick={() => setShowDetailPreview(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              🖥 상세 페이지 미리보기
            </button>
          </div>
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
                              onClick={() => { setDetailPreviewGame(g); }}
                              title="게임 상세 페이지가 어떻게 보일지 미리보기"
                              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                              🖥 상세 미리보기
                            </button>
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
                  {/* 미디어 수정 버튼 + 검수 대기 뱃지 */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMediaEditSlug((prev) => prev === g.slug ? null : g.slug)}
                      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                    >
                      🖼 썸네일 · 영상 수정
                    </button>
                    {g.pendingMediaAt && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                        미디어 검수 대기 중
                      </span>
                    )}
                    {g.pendingMediaRejectReason && !g.pendingMediaAt && (
                      <span className="text-[10px] text-red-500">
                        미디어 거절: {g.pendingMediaRejectReason}
                      </span>
                    )}
                  </div>

                  {/* 미디어 수정 패널 */}
                  {mediaEditSlug === g.slug && (() => {
                    let localThumb: File | null = null;
                    let localVideo: File | null = null;
                    return (
                      <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                        {/* 현재/대기 중 카드 미리보기 */}
                        <div className="flex items-start gap-4">
                          <div>
                            <p className="mb-1 text-[10px] text-zinc-500">
                              {g.pendingThumbnailUrl ? "🔄 검수 대기 중" : "현재"}
                            </p>
                            <CardPreview
                              title={g.title}
                              emoji={g.emoji || "🎮"}
                              category={g.category || "other"}
                              thumbnailUrl={g.pendingThumbnailUrl ?? g.thumbnailUrl ?? null}
                            />
                          </div>
                        </div>

                        {/* 검수 대기 중이면 취소 버튼 표시 */}
                        {g.pendingMediaAt && (
                          <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                            <p className="font-medium">운영자 검수 대기 중입니다.</p>
                            <p className="mt-0.5 text-[10px]">승인 후 적용됩니다. 새 파일을 올리면 기존 대기 중인 파일이 교체됩니다.</p>
                            <button
                              type="button"
                              onClick={() => void onCancelMedia(g.slug)}
                              className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400"
                            >
                              검수 신청 취소
                            </button>
                          </div>
                        )}

                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            🖼 새 썸네일 (JPG/PNG/WebP · 5MB↓)
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
                            🎬 새 데모 영상 (MP4/WebM · 200MB↓)
                          </label>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            onChange={(e) => { localVideo = e.target.files?.[0] ?? null; }}
                            className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs dark:file:bg-zinc-700"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-400">파일을 올리면 운영자 검수 후 적용됩니다.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={updatingMediaSlug === g.slug}
                            onClick={() => void onUpdateMedia(g.slug, localThumb, localVideo)}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {updatingMediaSlug === g.slug ? "업로드 중…" : "검수 신청"}
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
        />
      )}
    </div>
  );
}
