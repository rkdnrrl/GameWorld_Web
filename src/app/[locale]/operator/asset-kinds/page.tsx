"use client";

import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { api, session, ApiError, type AssetKind } from "@/lib/api";

interface EditForm {
  label: string;
  icon: string;
  extensions: string;       // 콤마 입력
  mimeTypes: string;        // 콤마 입력
  maxSizeMb: number;
  sortOrder: number;
  enabled: boolean;
}

const EMPTY_FORM: EditForm = {
  label: "", icon: "", extensions: "", mimeTypes: "",
  maxSizeMb: 50, sortOrder: 0, enabled: true,
};

function kindToForm(k: AssetKind): EditForm {
  return {
    label:      k.label,
    icon:       k.icon || "",
    extensions: k.extensions.join(", "),
    mimeTypes:  k.mimeTypes.join(", "),
    maxSizeMb:  k.maxSizeMb,
    sortOrder:  k.sortOrder,
    enabled:    k.enabled,
  };
}

function formToPayload(f: EditForm) {
  return {
    label:      f.label.trim(),
    icon:       f.icon.trim() || undefined,
    extensions: f.extensions.split(",").map(s => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean),
    mimeTypes:  f.mimeTypes.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    maxSizeMb:  Number(f.maxSizeMb),
    sortOrder:  Number(f.sortOrder),
    enabled:    f.enabled,
  };
}

export default function OperatorAssetKindsPage() {
  const router = useRouter();

  const [kinds, setKinds]         = useState<AssetKind[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [acting, setActing]       = useState<string | null>(null);

  // 추가 폼
  const [addId, setAddId]   = useState("");
  const [addForm, setAddForm] = useState<EditForm>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  // 수정 모달
  const [editKind, setEditKind] = useState<AssetKind | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // 삭제 확인
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListAssetKinds(tk)
      .then(res => setKinds(res.kinds))
      .catch(e => {
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
      const payload = formToPayload(addForm);
      const res = await api.operatorCreateAssetKind(tk, { id: addId.trim().toLowerCase(), ...payload });
      setKinds(prev => [...(prev ?? []), res.kind].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
      setAddId(""); setAddForm(EMPTY_FORM);
    } catch (e) {
      setAddErr(e instanceof ApiError ? e.message : "추가 실패");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(k: AssetKind) {
    setEditKind(k);
    setEditForm(kindToForm(k));
  }

  async function onEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editKind) return;
    const tk = session.getToken();
    if (!tk) return;
    setEditSubmitting(true);
    try {
      const res = await api.operatorUpdateAssetKind(tk, editKind.id, formToPayload(editForm));
      setKinds(prev => prev?.map(k => k.id === editKind.id ? res.kind : k).sort((a, b) => a.sortOrder - b.sortOrder) ?? null);
      setEditKind(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "수정 실패");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleEnabled(k: AssetKind) {
    const tk = session.getToken();
    if (!tk) return;
    setActing(k.id);
    try {
      const res = await api.operatorUpdateAssetKind(tk, k.id, { enabled: !k.enabled });
      setKinds(prev => prev?.map(x => x.id === k.id ? res.kind : x) ?? null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "변경 실패");
    } finally {
      setActing(null);
    }
  }

  async function onDelete(id: string) {
    const tk = session.getToken();
    if (!tk) return;
    setActing(id);
    try {
      await api.operatorDeleteAssetKind(tk, id);
      setKinds(prev => prev?.filter(k => k.id !== id) ?? null);
      setDeleteConfirm(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "삭제 실패");
    } finally {
      setActing(null);
    }
  }

  if (forbidden) return <div className="p-8 text-red-500">접근 권한이 없습니다.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">📦 에셋 타입 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          새 에셋 카테고리(예: 사운드·비디오)를 동적으로 추가. 활성화하면 모든 유저의 업로드/사이드바에 자동 반영됩니다.<br />
          <span className="text-amber-500">⚠️ 재생/편집 UI 는 코드 작업이 별도 필요</span> — DB 만으로는 다운로드 fallback 만 됩니다.
        </p>
      </div>

      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{err}</p>}

      {/* 목록 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">등록된 에셋 타입</h2>
        {kinds === null ? (
          <p className="text-sm text-zinc-400">로딩 중…</p>
        ) : kinds.length === 0 ? (
          <p className="text-sm text-zinc-400">등록된 타입이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
            {kinds.map(k => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl w-8 text-center">{k.icon || "📄"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-white">
                    {k.label}
                    <code className="ml-2 font-mono text-xs text-zinc-400">{k.id}</code>
                    {!k.enabled && <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">비활성</span>}
                  </p>
                  <p className="text-xs text-zinc-400">
                    .{k.extensions.join(" · .")} · 최대 {k.maxSizeMb}MB · 순서 {k.sortOrder}
                  </p>
                </div>
                <button
                  onClick={() => toggleEnabled(k)}
                  disabled={acting === k.id}
                  className={`rounded border px-2.5 py-1 text-xs disabled:opacity-50 ${k.enabled
                    ? "border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-800 dark:text-emerald-400"
                    : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {k.enabled ? "활성" : "비활성"}
                </button>
                <button onClick={() => openEdit(k)}
                  className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  수정
                </button>
                <button onClick={() => setDeleteConfirm(k.id)} disabled={acting === k.id}
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
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">새 에셋 타입 추가</h2>
        <form onSubmit={onAdd} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">id <span className="text-red-400">*</span></label>
              <input required value={addId}
                onChange={e => setAddId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="audio"
                className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
              <p className="mt-0.5 text-[10px] text-zinc-400">소문자로 시작·a-z/0-9/_/-</p>
            </div>
            <KindFormFields form={addForm} setForm={setAddForm} />
          </div>
          {addErr && <p className="text-xs text-red-500">{addErr}</p>}
          <button type="submit" disabled={adding}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {adding ? "추가 중…" : "+ 에셋 타입 추가"}
          </button>
        </form>
      </section>

      {/* 수정 모달 */}
      {editKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditKind(null)}>
          <form onSubmit={onEdit} onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="mb-4 text-base font-bold text-zinc-900 dark:text-white">
              에셋 타입 수정 — <code className="font-mono text-sm">{editKind.id}</code>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <KindFormFields form={editForm} setForm={setEditForm} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditKind(null)}
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
          <div className="rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={e => e.stopPropagation()}>
            <p className="mb-1 font-semibold text-zinc-800 dark:text-white">에셋 타입 삭제</p>
            <p className="mb-4 text-sm text-zinc-500">
              <code className="font-mono">{deleteConfirm}</code> 을 삭제합니다.
              사용 중인 에셋이 있으면 거부됩니다 (비활성화 권장).
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">취소</button>
              <button onClick={() => onDelete(deleteConfirm)} disabled={acting === deleteConfirm}
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

/** 추가/수정 공통 필드 */
function KindFormFields({ form, setForm }: { form: EditForm; setForm: (u: EditForm) => void }) {
  const u = <K extends keyof EditForm>(k: K, v: EditForm[K]) => setForm({ ...form, [k]: v });
  return (
    <>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">이모지/아이콘</label>
        <input value={form.icon} onChange={e => u("icon", e.target.value)} placeholder="🎵"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">라벨 <span className="text-red-400">*</span></label>
        <input required value={form.label} onChange={e => u("label", e.target.value)} placeholder="오디오"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">확장자 (콤마로 구분) <span className="text-red-400">*</span></label>
        <input required value={form.extensions} onChange={e => u("extensions", e.target.value)}
          placeholder="mp3, wav, ogg"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
        <p className="mt-0.5 text-[10px] text-zinc-400">위험 확장자(exe/sh/html/svg…)는 자동 차단</p>
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">MIME prefix (옵션, 콤마)</label>
        <input value={form.mimeTypes} onChange={e => u("mimeTypes", e.target.value)}
          placeholder="audio/"
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm font-mono dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
        <p className="mt-0.5 text-[10px] text-zinc-400">설정 시 파일 MIME 검증 (보안 강화). 비우면 검사 안함.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">최대 크기 (MB)</label>
        <input type="number" min={1} max={500} value={form.maxSizeMb}
          onChange={e => u("maxSizeMb", Number(e.target.value))}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">표시 순서</label>
        <input type="number" value={form.sortOrder}
          onChange={e => u("sortOrder", Number(e.target.value))}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white" />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <input type="checkbox" checked={form.enabled} onChange={e => u("enabled", e.target.checked)} />
        활성화 (체크 해제 시 업로드/사이드바에서 숨김)
      </label>
    </>
  );
}
