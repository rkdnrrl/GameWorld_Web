"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { session } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://airliveplay.com";

type SlotValue = {
  name: string;
  assetId: string | null;
  modelUrl: string;
  enabled: boolean;
};
type SlotForm = Record<string, SlotValue>;

type FbxAsset = { id: string; name: string; modelUrl: string; tags?: string[] };

const CORE_SLOTS = ["idle", "walk", "run", "jump", "fall", "crouch", "crouch_walk", "prone", "prone_move"];

function emptySlot(): SlotValue {
  return { name: "", assetId: null, modelUrl: "", enabled: true };
}

/* ── 에셋 피커 모달 ── */
function AssetPickerModal({ onSelect, onClose }: {
  onSelect: (a: FbxAsset) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<FbxAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`${API}/api/assets/my`, {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        const list: FbxAsset[] = (d.assets || []).filter((a: FbxAsset) =>
          /\.fbx(\?|$)/i.test(a.modelUrl)
        );
        setAssets(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? assets.filter(a => a.name.toLowerCase().includes(query)) : assets;
  }, [assets, q]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "min(600px,96vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden" }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>내 에셋에서 FBX 선택</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="검색..."
            autoFocus
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff", fontSize: 13, padding: "7px 12px", outline: "none" }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: 8 }}>불러오는 중...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: 8 }}>
              {assets.length === 0 ? "내 에셋에 FBX 파일이 없습니다." : "검색 결과가 없습니다."}
            </div>
          )}
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => onSelect(a)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "#fff", cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            >
              <span style={{ fontSize: 20 }}>🎞</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.modelUrl}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OperatorCharacterAnimationsPage() {
  const t = useTranslations("OperatorCharacterAnimations");
  const [form, setForm] = useState<SlotForm>({});
  const [slotOrder, setSlotOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newSlotName, setNewSlotName] = useState("");
  const [deletedSlots, setDeletedSlots] = useState<string[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    fetch("/api/operator/character-animations", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((slotRes) => {
        const slots: Record<string, { name?: string; assetId?: string; modelUrl?: string; enabled?: boolean }> = slotRes.slots || {};
        const serverOrder: string[] = slotRes.order || [];
        setSlotOrder(serverOrder);

        const next: SlotForm = {};
        for (const slot of serverOrder) {
          const v = slots[slot];
          next[slot] = {
            name: v?.name || "",
            assetId: v?.assetId || null,
            modelUrl: v?.modelUrl || "",
            enabled: v?.enabled !== false,
          };
        }
        setForm(next);
      })
      .finally(() => setLoading(false));
  }, []);

  function patchSlot(slot: string, patch: Partial<SlotValue>) {
    setForm(prev => ({
      ...prev,
      [slot]: { ...emptySlot(), ...(prev[slot] || {}), ...patch },
    }));
  }

  function addSlot() {
    const name = newSlotName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!name || slotOrder.includes(name)) return;
    setSlotOrder(prev => [...prev, name]);
    setForm(prev => ({ ...prev, [name]: emptySlot() }));
    setNewSlotName("");
  }

  function removeSlot(slot: string) {
    setSlotOrder(prev => prev.filter(s => s !== slot));
    setForm(prev => { const n = { ...prev }; delete n[slot]; return n; });
    setDeletedSlots(prev => prev.includes(slot) ? prev : [...prev, slot]);
  }

  async function save() {
    const token = session.getToken();
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, Partial<SlotValue>> = {};
      for (const slot of slotOrder) {
        const v = form[slot];
        if (!v) continue;
        payload[slot] = { name: v.name, assetId: v.assetId, modelUrl: v.modelUrl.trim(), enabled: v.enabled && Boolean(v.modelUrl.trim()) };
      }
      const res = await fetch("/api/operator/character-animations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slots: payload }),
      });
      if (!res.ok) throw new Error();
      await Promise.all(
        deletedSlots.map(slot =>
          fetch(`/api/operator/character-animations/${encodeURIComponent(slot)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      setDeletedSlots([]);
      setMessage(t("saved"));
    } catch {
      setMessage(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-zinc-500">{t("loading")}</div>;
  }

  function SlotCard({ slot }: { slot: string }) {
    const value = form[slot] || emptySlot();
    const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const [holdProgress, setHoldProgress] = useState(0);
    const HOLD_MS = 1500;
    const TICK_MS = 30;

    function startHold() {
      let elapsed = 0;
      holdTimer.current = setInterval(() => {
        elapsed += TICK_MS;
        const pct = Math.min(100, Math.round((elapsed / HOLD_MS) * 100));
        setHoldProgress(pct);
        if (elapsed >= HOLD_MS) { cancelHold(); removeSlot(slot); }
      }, TICK_MS);
    }
    function cancelHold() {
      if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
      setHoldProgress(0);
    }

    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-50 capitalize">{slot}</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => patchSlot(slot, { enabled: !value.enabled })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${value.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300"}`}>
              {value.enabled ? t("enabled") : t("disabled")}
            </button>
            <button
              type="button"
              title={t("holdToDelete")}
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              className="relative overflow-hidden rounded px-2 py-1 text-xs text-red-400 hover:text-red-600 select-none"
              style={{ minWidth: 28 }}
            >
              <span className="relative z-10">✕</span>
              {holdProgress > 0 && (
                <span className="absolute inset-0 bg-red-100 dark:bg-red-900 transition-none" style={{ width: `${holdProgress}%` }} />
              )}
            </button>
          </div>
        </div>

        {/* 에셋 선택 */}
        <label className="block text-xs font-medium text-zinc-500 mb-1">내 에셋에서 선택</label>
        {value.modelUrl ? (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/40">
            <span className="text-base">🎞</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{value.name || "애니메이션"}</div>
              <div className="truncate text-xs text-zinc-400">{value.modelUrl}</div>
            </div>
            <button
              type="button"
              onClick={() => patchSlot(slot, { modelUrl: "", assetId: null, name: "" })}
              className="shrink-0 rounded px-2 py-1 text-xs text-red-400 hover:text-red-600"
            >✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerFor(slot)}
            className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-sm text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            📂 내 에셋에서 FBX 선택
          </button>
        )}

        {/* 직접 URL 입력 (보조 수단) */}
        <label className="mt-3 block text-xs font-medium text-zinc-500">{t("manualUrl")}</label>
        <input value={value.modelUrl}
          onChange={(e) => patchSlot(slot, { modelUrl: e.target.value, assetId: null, name: e.target.value ? value.name : "" })}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          placeholder="https://.../animation.fbx" />
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {pickerFor !== null && (
        <AssetPickerModal
          onSelect={(asset) => {
            patchSlot(pickerFor, { modelUrl: asset.modelUrl, assetId: asset.id, name: asset.name, enabled: true });
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
        <Link href="/operator" className="text-sm text-blue-600 hover:underline dark:text-blue-400">{t("back")}</Link>
      </div>

      {/* 전체 슬롯 */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {slotOrder.map(slot => <SlotCard key={slot} slot={slot} />)}
      </div>

      {/* 코어 슬롯 빠른 추가 */}
      {CORE_SLOTS.filter(s => !slotOrder.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {CORE_SLOTS.filter(s => !slotOrder.includes(s)).map(s => (
            <button key={s} type="button"
              onClick={() => { setSlotOrder(prev => [...prev, s]); setForm(prev => ({ ...prev, [s]: emptySlot() })); }}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900">
              + {s}
            </button>
          ))}
        </div>
      )}

      {/* 새 슬롯 추가 */}
      <div className="flex gap-2 mb-8">
        <input
          value={newSlotName}
          onChange={e => setNewSlotName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          onKeyDown={e => { if (e.key === "Enter") addSlot(); }}
          placeholder={t("newSlotPlaceholder")}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button type="button" onClick={addSlot}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
          {t("addSlot")}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? t("saving") : t("save")}
        </button>
        {message && <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>}
      </div>
    </div>
  );
}
