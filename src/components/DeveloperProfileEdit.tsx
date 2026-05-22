"use client";

import { useEffect, useState } from "react";
import { session, SESSION_CHANGE_EVENT } from "@/lib/api";

export default function DeveloperProfileEdit({
  nickname, initialBio, initialWebsiteUrl,
}: {
  nickname: string;
  initialBio: string | null;
  initialWebsiteUrl: string | null;
}) {
  const [myNickname, setMyNickname] = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);
  const [bio,     setBio]     = useState(initialBio ?? "");
  const [website, setWebsite] = useState(initialWebsiteUrl ?? "");
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");

  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    const sync = () => setMyNickname(session.getUser()?.nickname ?? null);
    sync();
    window.addEventListener(SESSION_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sync);
  }, []);

  // 내 프로필이 아니면 렌더링 안 함
  if (myNickname !== nickname) return null;

  async function handleSave() {
    const token = session.getToken();
    if (!token || saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`${apiBase}/api/auth/profile`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ bio, websiteUrl: website }),
      });
      if (res.ok) {
        setMsg("저장됐습니다!");
        setTimeout(() => { setMsg(""); setOpen(false); }, 1500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        ✏️ 프로필 편집
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-5 text-lg font-bold text-gray-900">프로필 편집</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  소개글 <span className="font-normal text-gray-400">(최대 300자)</span>
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder="나를 소개해주세요..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-0.5 text-right text-xs text-gray-400">{bio.length} / 300</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">웹사이트</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={200}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              {msg && <span className="text-sm font-medium text-emerald-600">{msg}</span>}
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-lg bg-[#0170bd] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
