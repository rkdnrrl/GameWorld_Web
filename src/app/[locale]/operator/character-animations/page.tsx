"use client";

import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, session, type CharacterAnimationSlot } from "@/lib/api";

type Slot = CharacterAnimationSlot["slot"];
type SlotForm = Partial<Record<Slot, {
  name: string;
  assetId: string | null;
  modelUrl: string;
  enabled: boolean;
}>>;

const SLOT_ORDER: Slot[] = ["idle", "walk", "run", "jump", "crouch", "prone"];
const SLOT_LABEL_KEY: Record<Slot, string> = {
  idle: "slotIdle",
  walk: "slotWalk",
  run: "slotRun",
  jump: "slotJump",
  crouch: "slotCrouch",
  prone: "slotProne",
};

export default function OperatorCharacterAnimationsPage() {
  const t = useTranslations("OperatorCharacterAnimations");
  const [form, setForm] = useState<SlotForm>({});
  const [assets, setAssets] = useState<Array<{ id: string; name: string; modelUrl: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<Slot | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = session.getToken();
    if (!token) return;
    Promise.all([
      api.operatorGetCharacterAnimations(token),
      api.listMyAssets(token),
    ])
      .then(([slotRes, assetRes]) => {
        const next: SlotForm = {};
        for (const slot of SLOT_ORDER) {
          const value = slotRes.slots[slot];
          next[slot] = {
            name: value?.name || "",
            assetId: value?.assetId || null,
            modelUrl: value?.modelUrl || "",
            enabled: value?.enabled !== false,
          };
        }
        setForm(next);
        setAssets((assetRes.assets || [])
          .filter((asset) => /\.fbx(?:[?#].*)?$/i.test(String(asset.modelUrl || "")))
          .map((asset) => ({ id: asset.id, name: asset.name, modelUrl: asset.modelUrl })));
      })
      .finally(() => setLoading(false));
  }, []);

  const slotPayload = useMemo(() => {
    const payload: Partial<Record<Slot, Partial<CharacterAnimationSlot>>> = {};
    for (const slot of SLOT_ORDER) {
      const value = form[slot];
      if (!value) continue;
      payload[slot] = {
        name: value.name,
        assetId: value.assetId,
        modelUrl: value.modelUrl.trim(),
        enabled: value.enabled,
      };
    }
    return payload;
  }, [form]);

  function patchSlot(slot: Slot, patch: Partial<NonNullable<SlotForm[Slot]>>) {
    setForm((prev) => ({
      ...prev,
      [slot]: {
        name: "",
        assetId: null,
        modelUrl: "",
        enabled: true,
        ...(prev[slot] || {}),
        ...patch,
      },
    }));
  }

  async function save() {
    const token = session.getToken();
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      await api.operatorUpdateCharacterAnimations(token, slotPayload);
      setMessage(t("saved"));
    } catch {
      setMessage(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadAnimation(slot: Slot, file: File | null) {
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
      patchSlot(slot, {
        name: data.slot.name || file.name.replace(/\.fbx$/i, ""),
        assetId: null,
        modelUrl: data.slot.modelUrl,
        enabled: true,
      });
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        </div>
        <Link href="/operator" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("back")}
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SLOT_ORDER.map((slot) => {
          const value = form[slot] || { name: "", assetId: null, modelUrl: "", enabled: true };
          return (
            <section key={slot} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{t(SLOT_LABEL_KEY[slot])}</h2>
                <button
                  type="button"
                  onClick={() => patchSlot(slot, { enabled: !value.enabled })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${value.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300"}`}
                >
                  {value.enabled ? t("enabled") : t("disabled")}
                </button>
              </div>

              <label className="block text-xs font-medium text-zinc-500">{t("uploadFile")}</label>
              <input
                type="file"
                accept=".fbx"
                disabled={uploadingSlot === slot}
                onChange={(e) => void uploadAnimation(slot, e.target.files?.[0] || null)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              {uploadingSlot === slot && (
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{t("uploading")}</p>
              )}

              <label className="mt-4 block text-xs font-medium text-zinc-500">{t("assetSelect")}</label>
              <select
                value={value.assetId || ""}
                onChange={(e) => {
                  const picked = assets.find((asset) => asset.id === e.target.value);
                  patchSlot(slot, {
                    assetId: picked?.id || null,
                    name: picked?.name || value.name,
                    modelUrl: picked?.modelUrl || value.modelUrl,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">{t("noAssets")}</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
              </select>

              <label className="mt-4 block text-xs font-medium text-zinc-500">{t("manualUrl")}</label>
              <input
                value={value.modelUrl}
                onChange={(e) => patchSlot(slot, { modelUrl: e.target.value, assetId: null })}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="https://.../animation.fbx"
              />
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? t("saving") : t("save")}
        </button>
        {message && <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>}
      </div>
    </div>
  );
}
