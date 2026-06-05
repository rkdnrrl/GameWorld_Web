"use client";

import { useEffect, useRef, useState, ChangeEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";
import { useTranslations } from "next-intl";

type Profile = {
  nickname: string;
  bio: string | null;
  profileImageUrl: string | null;
  websiteUrl: string | null;
};

/* ── 프로필 카드 미리보기 ─────────────────────────────────────── */
function ProfilePreview({ profile, previewImage }: {
  profile: Profile;
  previewImage: string | null;  // 선택한 이미지의 base64 (아직 업로드 전)
}) {
  const imgSrc = previewImage ?? profile.profileImageUrl;
  const initial = profile.nickname.charAt(0).toUpperCase();

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* 아바타 */}
        <div className="shrink-0">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc} alt={profile.nickname}
              className="h-20 w-20 rounded-2xl object-cover ring-2 ring-gray-200" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl font-bold text-white shadow">
              {initial}
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-gray-900">{profile.nickname}</span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
              개발자
            </span>
          </div>
          {profile.bio && (
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600 whitespace-pre-line line-clamp-3">
              {profile.bio}
            </p>
          )}
          {profile.websiteUrl && (
            <p className="mt-2 text-xs text-blue-600">
              🔗 {profile.websiteUrl.replace(/^https?:\/\//, "")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────────────── */
export default function DevelopProfilePage() {
  const router = useRouter();
  const t = useTranslations("DevelopProfile");

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  // 현재 프로필
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 편집 상태
  const [bio,     setBio]     = useState("");
  const [website, setWebsite] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 이미지 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage,   setPreviewImage]   = useState<string | null>(null);  // base64
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg,       setPhotoMsg]       = useState<string | null>(null);

  // 세션에서 닉네임
  const [nickname, setNickname] = useState<string>("");
  useEffect(() => {
    const sync = () => setNickname(session.getUser()?.nickname ?? "");
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 프로필 로드
  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    fetch(`${apiBase}/api/auth/profile`, { headers: { Authorization: `Bearer ${tk}` } })
      .then((r) => r.json())
      .then((d: { profile: Profile }) => {
        setProfile(d.profile);
        setBio(d.profile.bio ?? "");
        setWebsite(d.profile.websiteUrl ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router, apiBase]);

  // 프로필 이미지 선택 → 미리보기 + 바로 업로드
  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 로컬 미리보기
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewImage(ev.target?.result as string ?? null);
    reader.readAsDataURL(file);

    // 업로드
    const tk = session.getToken();
    if (!tk) return;
    setUploadingPhoto(true);
    setPhotoMsg(null);
    const fd = new FormData();
    fd.append("profileImage", file);
    try {
      const res = await fetch(`${apiBase}/api/auth/profile/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
        body: fd,
      });
      const data = await res.json() as { ok?: boolean; profileImageUrl?: string; error?: { message?: string } };
      if (data.ok && data.profileImageUrl) {
        setProfile((prev) => prev ? { ...prev, profileImageUrl: data.profileImageUrl! } : prev);
        setPhotoMsg("✓ 사진이 업데이트됐습니다.");
      } else {
        setPhotoMsg(data.error?.message ?? "업로드 실패");
        setPreviewImage(null);
      }
    } catch {
      setPhotoMsg("네트워크 오류");
      setPreviewImage(null);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  // bio / website 저장
  async function onSave() {
    const tk = session.getToken();
    if (!tk || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/auth/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ bio, websiteUrl: website }),
      });
      const data = await res.json() as { profile?: Profile; error?: { message?: string } };
      if (res.ok && data.profile) {
        setProfile(data.profile);
        setSaveMsg({ ok: true, text: t("saved") });
        setTimeout(() => setSaveMsg(null), 2500);
      } else {
        setSaveMsg({ ok: false, text: data.error?.message ?? t("saveError") });
      }
    } catch {
      setSaveMsg({ ok: false, text: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-zinc-500">로딩 중…</p>
      </div>
    );
  }

  const previewProfile: Profile = {
    nickname:       profile?.nickname ?? nickname,
    bio:            bio || null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    websiteUrl:     website || null,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">

      {/* 헤더 */}
      <div className="mb-8">
        <Link href="/develop" className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400">
          {t("backToDevelop")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("subtitle")}</p>
      </div>

      {/* ── 미리보기 ── */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("previewTitle")}</p>
          <Link
            href={`/users/${encodeURIComponent(profile?.nickname ?? nickname)}`}
            className="text-xs text-blue-600 hover:underline"
          >
            {t("viewPublic")}
          </Link>
        </div>
        <ProfilePreview profile={previewProfile} previewImage={previewImage} />
        <p className="mt-1.5 text-right text-[10px] text-zinc-400">{t("previewNote")}</p>
      </div>

      {/* ── 편집 폼 ── */}
      <div className="space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">

        {/* 프로필 사진 */}
        <div>
          <p className="mb-3 text-sm font-medium">{t("photoSection")}</p>
          <div className="flex items-center gap-4">
            {/* 현재 사진 또는 이니셜 */}
            <div className="relative shrink-0">
              {(previewImage ?? profile?.profileImageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewImage ?? profile?.profileImageUrl ?? ""}
                  alt="profile"
                  className="h-16 w-16 rounded-xl object-cover ring-2 ring-zinc-200"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white">
                  {(profile?.nickname ?? nickname).charAt(0).toUpperCase()}
                </div>
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onPhotoChange}
              />
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {uploadingPhoto ? t("uploadingPhoto") : t("changePhoto")}
              </button>
              <p className="mt-1 text-xs text-zinc-400">{t("photoHint")}</p>
              {photoMsg && (
                <p className={`mt-1 text-xs ${photoMsg.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
                  {photoMsg}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 닉네임 (읽기 전용) */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t("nickname")}</label>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {profile?.nickname ?? nickname}
          </div>
          <p className="mt-1 text-xs text-zinc-400">{t("nicknameHint")}</p>
        </div>

        {/* 소개글 */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t("bio")}</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={4}
            placeholder={t("bioPlaceholder")}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p className="mt-0.5 flex justify-between text-xs text-zinc-400">
            <span>{t("bioHint")}</span>
            <span>{bio.length} / 300</span>
          </p>
        </div>

        {/* 웹사이트 */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t("website")}</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={200}
            placeholder={t("websitePlaceholder")}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* 저장 */}
        <div className="flex items-center justify-between pt-2">
          {saveMsg ? (
            <p className={`text-sm font-medium ${saveMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
              {saveMsg.text}
            </p>
          ) : <span />}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-lg bg-[#0170bd] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
