"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { session } from "@/lib/api";

type SlotValue = {
  name: string;
  assetId: string | null;
  modelUrl: string;
  enabled: boolean;
};
type SlotForm = Record<string, SlotValue>;

const CORE_SLOTS = ["idle", "walk", "run", "jump", "crouch", "prone"];

function emptySlot(): SlotValue {
  return { name: "", assetId: null, modelUrl: "", enabled: true };
}

export default function OperatorCharacterAnimationsPage() {
  const t = useTranslations("OperatorCharacterAnimations");
  const [form, setForm] = useState<SlotForm>({});
  const [slotOrder, setSlotOrder] = useState<string[]>([]);
  const [assets, setAssets] = useState<Array<{ id: string; name: string; modelUrl: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newSlotName, setNewSlotName] = useState("");
  const [deletedSlots, setDeletedSlots] = useState<string[]>([]);

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    Promise.all([
      fetch("/api/operator/character-animations", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/assets/my", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([slotRes, assetRes]) => {
        const slots: Record<string, { name?: string; assetId?: string; modelUrl?: string; enabled?: boolean }> = slotRes.slots || {};
        // 서버가 반환한 순서만 사용 — CORE_SLOTS 강제 삽입 제거
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
        setAssets((assetRes.assets || [])
          .filter((a: { modelUrl?: string }) => /\.fbx(?:[?#].*)?$/i.test(String(a.modelUrl || "")))
          .map((a: { id: string; name: string; modelUrl: string }) => ({ id: a.id, name: a.name, modelUrl: a.modelUrl })));
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
      // 삭제된 슬롯을 서버 DB에서도 제거
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

  async function uploadAnimation(slot: string, file: File | null) {
    const token = session.getToken();
    if (!token || !file) return;
    setUploadingSlot(slot);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("animation", file);
      const res = await fetch(`/api/operator/character-animations/${slot}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.slot?.modelUrl) throw new Error("upload failed");
      patchSlot(slot, { name: data.slot.name || file.name.replace(/\.fbx$/i, ""), assetId: null, modelUrl: data.slot.modelUrl, enabled: true });
      setMessage(t("saved"));
    } catch {
      setMessage(t("uploadFailed"));
    } finally {
      setUploadingSlot(null);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-zinc-500">{t("loading")}</div>;
  }

  function SlotCard({ slot }: { slot: string }) {
    const value = form[slot] || emptySlot();
    const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const [holdProgress, setHoldProgress] = useState(0); // 0~100
    const HOLD_MS = 1500;
    const TICK_MS = 30;

    function startHold() {
      let elapsed = 0;
      holdTimer.current = setInterval(() => {
        elapsed += TICK_MS;
        const pct = Math.min(100, Math.round((elapsed / HOLD_MS) * 100));
        setHoldProgress(pct);
        if (elapsed >= HOLD_MS) {
          cancelHold();
          removeSlot(slot);
        }
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
            {/* 홀드-투-딜리트: 1.5초 꾹 눌러야 삭제 */}
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
                <span
                  className="absolute inset-0 bg-red-100 dark:bg-red-900 transition-none"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
            </button>
          </div>
        </div>

        <label className="block text-xs font-medium text-zinc-500">{t("uploadFile")}</label>
        <input type="file" accept=".fbx" disabled={uploadingSlot === slot}
          onChange={(e) => void uploadAnimation(slot, e.target.files?.[0] || null)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        {uploadingSlot === slot && <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{t("uploading")}</p>}

        <label className="mt-4 block text-xs font-medium text-zinc-500">{t("assetSelect")}</label>
        <select value={value.assetId || ""}
          onChange={(e) => {
            const picked = assets.find(a => a.id === e.target.value);
            patchSlot(slot, { assetId: picked?.id || null, name: picked?.name || value.name, modelUrl: picked?.modelUrl || value.modelUrl });
          }}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">{t("noAssets")}</option>
          {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <label className="mt-4 block text-xs font-medium text-zinc-500">{t("manualUrl")}</label>
        <input value={value.modelUrl}
          onChange={(e) => patchSlot(slot, { modelUrl: e.target.value, assetId: null })}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="https://.../animation.fbx" />
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
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
