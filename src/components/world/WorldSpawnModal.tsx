'use client';
/**
 * 월드 안에서 내 에셋을 spawn 하는 모달.
 *
 * 4탭: 모델 / 이미지 / 비디오 / 오디오
 * 각 탭은 /api/assets/my 의 해당 kind 만 표시.
 *
 * 매핑:
 *   - 모델  → kind='asset' + assetUrl
 *   - 이미지 → kind='plane' + textureAlbedo (포스터처럼 평면에 텍스처)
 *   - 비디오 → kind='plane' + videoUrl (스크린처럼 평면에 영상)
 *   - 오디오 → kind='sound' + soundUrl (보이지 않는 spatial sound)
 *
 * 세션 메모리만 — DO 인스턴스가 살아있는 한 유지, reap 되면 사라짐 (DB 저장 X).
 * 권한: 월드 안 누구나 spawn 가능.
 */
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

type AssetKind = 'model' | 'image' | 'video' | 'audio';

interface RawAsset {
  id: string;
  name: string;
  modelUrl?: string;
  kind?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
}

export interface SpawnPayload {
  /** 월드 오브젝트 kind */
  worldKind: 'asset' | 'plane' | 'sound';
  assetUrl?: string;
  textureAlbedo?: string;
  videoUrl?: string;
  soundUrl?: string;
  /** 기본 스케일 — 이미지/비디오는 화면비, 모델/사운드는 1 */
  defaultScale: [number, number, number];
}

const KIND_LABELS: Record<AssetKind, { iconKey: string; emoji: string }> = {
  model: { iconKey: 'spawnTab_model', emoji: '🎲' },
  image: { iconKey: 'spawnTab_image', emoji: '🖼' },
  video: { iconKey: 'spawnTab_video', emoji: '🎬' },
  audio: { iconKey: 'spawnTab_audio', emoji: '🔊' },
};

export function WorldSpawnModal({ open, onClose, onSpawn }: {
  open: boolean;
  onClose: () => void;
  onSpawn: (payload: SpawnPayload, name: string) => void;
}) {
  const t = useTranslations('World');
  const tCommon = useTranslations('Common');
  const [tab, setTab] = useState<AssetKind>('model');
  const [assets, setAssets] = useState<RawAsset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const token = session.getToken();
    fetch(`${API}/api/assets/my`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((d) => setAssets(Array.isArray(d.assets) ? d.assets : []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = assets.filter((a) => {
    if (!a.modelUrl) return false;
    if ((a.kind || 'model') !== tab) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSelect = (a: RawAsset) => {
    if (!a.modelUrl) return;
    let payload: SpawnPayload;
    if (tab === 'model') {
      payload = { worldKind: 'asset', assetUrl: a.modelUrl, defaultScale: [1, 1, 1] };
    } else if (tab === 'image') {
      payload = { worldKind: 'plane', textureAlbedo: a.modelUrl, defaultScale: [2, 2, 1] };
    } else if (tab === 'video') {
      payload = { worldKind: 'plane', videoUrl: a.modelUrl, defaultScale: [3.2, 1.8, 1] };
    } else {
      payload = { worldKind: 'sound', soundUrl: a.modelUrl, defaultScale: [1, 1, 1] };
    }
    onSpawn(payload, a.name);
    onClose();
  };

  const countOf = (k: AssetKind) => assets.filter((a) => (a.kind || 'model') === k && a.modelUrl).length;

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 16777100 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: '90vw', maxHeight: '80vh', background: '#1e1b4b', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t('spawnAssetTitle')}</h3>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* kind 탭 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(KIND_LABELS) as AssetKind[]).map((k) => {
            const active = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  padding: '6px 12px',
                  background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                }}>
                <span style={{ marginRight: 4 }}>{KIND_LABELS[k].emoji}</span>
                {t(KIND_LABELS[k].iconKey)} ({countOf(k)})
              </button>
            );
          })}
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchAssets')}
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff' }} />

        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, minHeight: 200 }}>
          {filtered.map((a) => (
            <button key={a.id} onClick={() => handleSelect(a)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
              <div style={{
                width: '100%', aspectRatio: '1',
                background: (a.thumbnailUrl || a.thumbnail)
                  ? `url(${a.thumbnailUrl || a.thumbnail}) center/cover`
                  : 'rgba(255,255,255,0.04)',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, opacity: (a.thumbnailUrl || a.thumbnail) ? 1 : 0.5,
              }}>
                {(a.thumbnailUrl || a.thumbnail) ? null : KIND_LABELS[tab].emoji}
              </div>
              <div style={{ fontSize: 11, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
            </button>
          ))}
        </div>

        {!loading && filtered.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20, fontSize: 13 }}>
            {t('noAssetsForKind')}
          </div>
        )}
        {loading && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20, fontSize: 13 }}>…</div>
        )}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
          {t('spawnInFrontHint')}
        </div>
      </div>
    </div>
  );
}
