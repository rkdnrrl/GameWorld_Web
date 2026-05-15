"use client";

import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
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
import { useTranslations } from "next-intl";

function formatDt(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR");
}

export default function OperatorSharedPixelArtsPage() {
  const router = useRouter();
  const t = useTranslations("SharedPixelArts");
  const tOp = useTranslations("Operator");
  const tCommon = useTranslations("Common");
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
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    setLoadError(null);
    setForbidden(false);
    setLoading(true);
    try {
      const res = await api.operatorListSharedPixelArts(tk, {
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
        setLoadError(err instanceof ApiError ? err.message : t("loadListFailed"));
      }
    } finally {
      setLoading(false);
    }
  }, [router, page, q, t]);

  useEffect(() => { void loadList(); }, [loadList]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  async function openEdit(row: SharedPixelArtSummary) {
    const tk = session.getToken();
    if (!tk) return;
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
      const { item } = await api.operatorGetSharedPixelArt(tk, row.name);
      setEditItem(item);
      setEditRarity(item.rarity);
      setEditType(item.type);
      setEditImageData(item.imageData);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : t("loadItemFailed"));
    }
  }

  function closeEdit() {
    setEditOpen(false);
    setEditItem(null);
    setEditError(null);
  }

  async function saveEdit() {
    const tk = session.getToken();
    if (!tk || !editItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.operatorPatchSharedPixelArt(tk, editItem.name, {
        rarity: editRarity,
        type: editType,
        imageData: editImageData,
      });
      closeEdit();
      await loadList();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteRow(name: string) {
    if (!confirm(t("deleteConfirm", { name }))) return;
    const tk = session.getToken();
    if (!tk) return;
    try {
      await api.operatorDeleteSharedPixelArt(tk, name);
      if (editItem?.name === name) closeEdit();
      await loadList();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("deleteFailed"));
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold">{t("forbidden")}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("forbiddenDesc", { isOperatorField: "isOperator", operatorEmailsEnv: "OPERATOR_EMAILS" })}
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          {tOp("backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {t("breadcrumb")}
          </p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/operator" className="text-blue-600 hover:underline dark:text-blue-400">{tOp("backToMenu")}</Link>
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">{tOp("home")}</Link>
        </div>
      </div>

      <form
        onSubmit={onSearchSubmit}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input
          type="search"
          value={qInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQInput(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[12rem] flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {tCommon("search")}
        </button>
        <span className="text-sm text-zinc-500">
          {t("totalCount", { count: total.toLocaleString() })}
        </span>
      </form>

      {loadError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-3 py-2 font-medium">{t("colName")}</th>
                <th className="px-3 py-2 font-medium">{t("colRarity")}</th>
                <th className="px-3 py-2 font-medium">{t("colType")}</th>
                <th className="px-3 py-2 font-medium">{t("colCreatedAt")}</th>
                <th className="px-3 py-2 font-medium">{t("colPreview")}</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    {t("noItems")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.name} className="border-b border-zinc-100 dark:border-zinc-800/80">
                    <td className="max-w-[28rem] px-3 py-2 font-mono text-xs break-all">
                      {row.name}
                    </td>
                    <td className="px-3 py-2">{row.rarity}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDt(row.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <OperatorPixelImg variant="thumb" raw={row.imageData} maxHeightPx={48} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void openEdit(row)}
                        className="mr-2 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteRow(row.name)}
                        className="text-red-600 hover:underline dark:text-red-400"
                      >
                        {t("delete")}
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
            {tCommon("prev")}
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-600"
          >
            {tCommon("next")}
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
              <h2 className="text-lg font-semibold">{t("editModalTitle")}</h2>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {t("close")}
              </button>
            </div>
            {editError && (
              <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40">
                {editError}
              </p>
            )}
            {!editItem ? (
              <p className="text-sm text-zinc-500">{t("loadingItem")}</p>
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
                  <span className="text-zinc-600 dark:text-zinc-400">imageData (data URL)</span>
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
                    {editSaving ? t("saving") : t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRow(editItem.name)}
                    className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    {t("delete")}
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
