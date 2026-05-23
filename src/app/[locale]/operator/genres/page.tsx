"use client";

import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { api, session, ApiError, type GameGenre } from "@/lib/api";

export default function OperatorGenresPage() {
  const router = useRouter();

  const [genres, setGenres] = useState<GameGenre[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const [addForm, setAddForm] = useState({ slug: "", labelKo: "", labelEn: "", emoji: "🎮", sortOrder: 0 });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const [editGenre, setEditGenre] = useState<GameGenre | null>(null);
  const [editForm, setEditForm] = useState({ labelKo: "", labelEn: "", emoji: "", sortOrder: 0 });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.getGenres()
      .then((res) => setGenres(res.genres))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setErr(e instanceof ApiError ? e.message : "로드 실패");
      });
  }, [router]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const tk = session.getToken();
    if (!tk) return;
    setAdding(true); setAddErr(null);
    try {
      const res = await api.operatorCreateGenre(tk, {
        slug: addForm.slug.trim(),
        labelKo: addForm.labelKo.trim(),
        labelEn: addForm.labelEn.trim(),
        emoji: addForm.emoji.trim() || "🎮",
        sortOrder: addForm.sortOrder,
      });
      setGenres((prev) => [...(prev ?? []), res.genre].sort((a, b) => a.sortOrder - b.sortOrder));
      setAddForm({ slug: "", labelKo: "", labelEn: "", emoji: "🎮", sortOrder: 0 });
    } catch (e) {
      setAddErr(e instanceof ApiError ? e.message : "추가 실패");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(g: GameGenre) {
    setEditGenre(g);
    setEditForm({ labelKo: g.labelKo, labelEn: g.labelEn, emoji: g.emoji, sortOrder: g.sortOrder });
  }

  async function onEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editGenre) return;
    const tk = session.getToken();
    if (!tk) return;
    setEditSubmitting(true);
    try {
      const res = await api.operatorUpdateGenre(tk, editGenre.slug, editForm);
      setGenres((prev) => prev?.map((g) => g.slug === editGenre.slug ? res.genre : g).sort((a, b) => a.sortOrder - b.sortOrder) ?? null);
      setEditGenre(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "수정 실패");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function onDelete(slug: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActing(slug);
    try {
      await api.operatorDeleteGenre(tk, slug);
      setGenres((prev) => prev?.filter((g) => g.slug !== slug) ?? null);
      setDeleteConfirm(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "삭제 실패");
    } finally {
      setActing(null);
    }
  }

  if (forbidden) return <div className="p-8 text-red-500">접근 권한이 없습니다.</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">🗂 게임 카테고리 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">게임 카테고리(장르)를 추가·수정·삭제합니다. 삭제 시 해당 카테고리를 사용 중인 게임이 없어야 합니다.</p>
      </div>

      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{err}</p>}

      {/* 목록 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">현재 게임 카테고리</h2>
        {genres === null ? (
          <p className="text-sm text-zinc-400">로딩 중…</p>
        ) : genres.length === 0 ? (
          <p className="text-sm text-zinc-400">게임 카테고리가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            {genres.map((g) => (
              <li key={g.slug} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl w-8 text-center">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-white">
                    {g.labelKo} <span className="text-zinc-400 text-xs">/ {g.labelEn}</span>
                  </p>
                  <p className="text-xs text-zinc-400">slug: <code className="font-mono">{g.slug}</code> · 순서: {g.sortOrder}</p>
                </div>
                <button onClick={() => openEdit(g)}
                  className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  수정
                </button>
                <button onClick={() => setDeleteConfirm(g.slug)} disabled={acting === g.slug}
                  className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-800 dark:text-red-400">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 추가 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">새 게임 카테고리 추가</h2>
        <form onSubmit={(e) => void onAdd(e)} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">slug <span className="text-red-400">*</span></label>
              <input required value={addForm.slug}
                onChange={(e) => setAddForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }))}
                placeholder="action"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
              <p className="mt-0.5 text-[10px] text-zinc-400">소문자·숫자·-·_ 만 허용</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">이모지</label>
              <input value={addForm.emoji}
                onChange={(e) => setAddForm((f) => ({ ...f, emoji: e.target.value }))}
                placeholder="🎮"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">한국어 이름 <span className="text-red-400">*</span></label>
              <input required value={addForm.labelKo}
                onChange={(e) => setAddForm((f) => ({ ...f, labelKo: e.target.value }))}
                placeholder="액션"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">영어 이름 <span className="text-red-400">*</span></label>
              <input required value={addForm.labelEn}
                onChange={(e) => setAddForm((f) => ({ ...f, labelEn: e.target.value }))}
                placeholder="Action"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">표시 순서</label>
              <input type="number" value={addForm.sortOrder}
                onChange={(e) => setAddForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          </div>
          {addErr && <p className="text-xs text-red-500">{addErr}</p>}
          <button type="submit" disabled={adding}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {adding ? "추가 중…" : "+ 게임 카테고리 추가"}
          </button>
        </form>
      </section>

      {/* 수정 모달 */}
      {editGenre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditGenre(null)}>
          <form onSubmit={(e) => void onEdit(e)} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-4 text-base font-bold text-zinc-900 dark:text-white">
              게임 카테고리 수정 — <code className="font-mono text-sm">{editGenre.slug}</code>
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">이모지</label>
                  <input value={editForm.emoji} onChange={(e) => setEditForm((f) => ({ ...f, emoji: e.target.value }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">표시 순서</label>
                  <input type="number" value={editForm.sortOrder}
                    onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">한국어 이름</label>
                <input required value={editForm.labelKo} onChange={(e) => setEditForm((f) => ({ ...f, labelKo: e.target.value }))}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">영어 이름</label>
                <input required value={editForm.labelEn} onChange={(e) => setEditForm((f) => ({ ...f, labelEn: e.target.value }))}
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditGenre(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">취소</button>
              <button type="submit" disabled={editSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {editSubmitting ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 삭제 확인 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 font-semibold text-zinc-800 dark:text-white">게임 카테고리 삭제</p>
            <p className="mb-4 text-sm text-zinc-500">
              <code className="font-mono">{deleteConfirm}</code> 을 삭제합니다. 이 카테고리를 사용 중인 게임이 있으면 삭제할 수 없습니다.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">취소</button>
              <button onClick={() => void onDelete(deleteConfirm)} disabled={acting === deleteConfirm}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                {acting === deleteConfirm ? "삭제 중…" : "삭제 확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
