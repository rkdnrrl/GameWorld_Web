"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import {
  api,
  session,
  ApiError,
  type SharedPixelArtSummary,
  type SharedPixelArtFull,
} from "@/lib/api";
import OperatorPixelImg from "@/components/OperatorPixelImg";

function formatDt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR");
}

export default function OperatorSharedPixelArtsPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<SharedPixelArtSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<SharedPixelArtFull | null>(null);
  const [editRarity, setEditRarity] = useState("");
  const [editType, setEditType] = useState("");
  const [editImageData, setEditImageData] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const t = session.getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setLoadError(null);
    setForbidden(false);
    setLoading(true);
    try {
      const res = await api.operatorListSharedPixelArts(t, {
        q: q || undefined,
        page,
        limit: 50,
        includeImageData: true,
      });
      setItems(res.items);
      setTotalPages(Math.max(1, res.totalPages));
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setLoadError(
          err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [router, page, q]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  async function openEdit(row: SharedPixelArtSummary) {
    const t = session.getToken();
    if (!t) return;
    setEditError(null);
    setEditOpen(true);
    if (row.imageData) {
      const full: SharedPixelArtFull = {
        name: row.name,
        rarity: row.rarity,
        type: row.type,
        createdAt: row.createdAt,
        imageData: row.imageData,
      };
      setEditItem(full);
      setEditRarity(full.rarity);
      setEditType(full.type);
      setEditImageData(full.imageData);
      return;
    }
    setEditItem(null);
    try {
      const { item } = await api.operatorGetSharedPixelArt(t, row.name);
      setEditItem(item);
      setEditRarity(item.rarity);
      setEditType(item.type);
      setEditImageData(item.imageData);
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "항목을 불러오지 못했습니다.",
      );
    }
  }

  function closeEdit() {
    setEditOpen(false);
    setEditItem(null);
    setEditError(null);
  }

  async function saveEdit() {
    const t = session.getToken();
    if (!t || !editItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.operatorPatchSharedPixelArt(t, editItem.name, {
        rarity: editRarity,
        type: editType,
        imageData: editImageData,
      });
      closeEdit();
      await loadList();
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "저장하지 못했습니다.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteRow(name: string) {
    if (!confirm(`삭제할까요?\n${name}`)) return;
    const t = session.getToken();
    if (!t) return;
    try {
      await api.operatorDeleteSharedPixelArt(t, name);
      if (editItem?.name === name) closeEdit();
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          운영자만 이 페이지를 볼 수 있습니다. 계정에{" "}
          <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
            isOperator
          </code>{" "}
          가 켜져 있거나, 서버 환경변수{" "}
          <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
            OPERATOR_EMAILS
          </code>
          에 본인 이메일이 포함되어야 합니다.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-blue-600 hover:underline"
        >
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            운영
          </p>
          <h1 className="text-2xl font-semibold">shared_pixel_arts</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            공유 픽셀 캐시 조회 · 수정 · 삭제 (목록에 썸네일 포함 — 응답이 클 수 있음)
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← 홈
        </Link>
      </div>

      <form
        onSubmit={onSearchSubmit}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input
          type="search"
          value={qInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setQInput(e.target.value)
          }
          placeholder="name 부분 검색…"
          className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          검색
        </button>
        <span className="text-sm text-zinc-500">
          총 {total.toLocaleString()}건
        </span>
      </form>

      {loadError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2 font-medium">name</th>
                <th className="px-3 py-2 font-medium">rarity</th>
                <th className="px-3 py-2 font-medium">type</th>
                <th className="px-3 py-2 font-medium">createdAt</th>
                <th className="px-3 py-2 font-medium">미리보기</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    항목이 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-zinc-100 dark:border-zinc-800/80"
                  >
                    <td className="max-w-[28rem] px-3 py-2 font-mono text-xs break-all">
                      {row.name}
                    </td>
                    <td className="px-3 py-2">{row.rarity}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDt(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <OperatorPixelImg
                        variant="thumb"
                        raw={row.imageData}
                        maxHeightPx={48}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void openEdit(row)}
                        className="mr-2 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRow(row.name)}
                        className="text-red-600 hover:underline dark:text-red-400"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            이전
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            다음
          </button>
        </div>
      )}

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">항목 수정</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                닫기
              </button>
            </div>
            {editError && (
              <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40">
                {editError}
              </p>
            )}
            {!editItem ? (
              <p className="text-sm text-zinc-500">불러오는 중…</p>
            ) : (
              <>
                <p className="mb-2 font-mono text-xs break-all text-zinc-600 dark:text-zinc-400">
                  {editItem.name}
                </p>
                <div className="mb-4 flex justify-center rounded-lg bg-zinc-100 p-4 dark:bg-zinc-950">
                  <OperatorPixelImg raw={editImageData} maxHeightPx={192} />
                </div>
                <label className="mb-2 block text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">rarity</span>
                  <input
                    value={editRarity}
                    onChange={(e) => setEditRarity(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
                <label className="mb-2 block text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">type</span>
                  <input
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
                <label className="mb-4 block text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    imageData (data URL)
                  </span>
                  <textarea
                    value={editImageData}
                    onChange={(e) => setEditImageData(e.target.value)}
                    rows={6}
                    className="mt-1 w-full resize-y rounded border border-zinc-300 px-2 py-1.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => void saveEdit()}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editSaving ? "저장 중…" : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRow(editItem.name)}
                    className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
