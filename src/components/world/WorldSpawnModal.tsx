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
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

type AssetKind = 'model' | 'image' | 'video' | 'audio' | 'prefab';

interface RawAsset {
  id: string;
  name: string;
  modelUrl?: string;
  kind?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
}

/** /api/prefabs/my 응답 — Studio savePrefab 이 만드는 payload: { version, root, tree } */
interface PrefabRow {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  payload: { version?: number; root?: Record<string, unknown>; tree?: Record<string, unknown>[] };
}

/** 모달이 worldKind 별로 채우는 spec — 단일 오브젝트 (모델/이미지/비디오/오디오) 용 */
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

/** Prefab spawn — Studio 의 payload 형식 그대로 (version, root, tree). world page 가 각각 sendObjSpawn 호출.
 * tree[0] 은 root 와 같음. parentId 가 tree 안의 id 를 가리키면 자식. root 의 parentId 는 undefined.
 */
export interface PrefabSpawnPayload {
  tree: Record<string, unknown>[];
}

const KIND_EMOJI: Record<AssetKind, string> = {
  model: '🎲', image: '🖼', video: '🎬', audio: '🔊', prefab: '🧩',
};
const KINDS: AssetKind[] = ['prefab', 'model', 'image', 'video', 'audio'];

export function WorldSpawnModal({ open, onClose, onSpawn, onSpawnPrefab }: {
  open: boolean;
  onClose: () => void;
  onSpawn: (payload: SpawnPayload, name: string) => void;
  onSpawnPrefab: (payload: PrefabSpawnPayload, name: string) => void;
}) {
  const t = useTranslations('World');
  const tCommon = useTranslations('Common');
  const [tab, setTab] = useState<AssetKind>('prefab');
  const [assets, setAssets] = useState<RawAsset[]>([]);
  const [prefabs, setPrefabs] = useState<PrefabRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const token = session.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    Promise.all([
      fetch(`${API}/api/assets/my`, { headers })
        .then((r) => (r.ok ? r.json() : { assets: [] }))
        .catch(() => ({ assets: [] })),
      fetch(`${API}/api/prefabs/my`, { headers })
        .then((r) => (r.ok ? r.json() : { prefabs: [] }))
        .catch(() => ({ prefabs: [] })),
    ]).then(([as, pf]) => {
      setAssets(Array.isArray(as.assets) ? as.assets : []);
      setPrefabs(Array.isArray(pf.prefabs) ? pf.prefabs : []);
    }).finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  // prefab 탭은 prefabs 배열 사용. 나머지는 assets.
  const filteredAssets = assets.filter((a) => {
    if ((a.kind || 'model') !== tab) return false;
    if (!a.modelUrl) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const filteredPrefabs = prefabs.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSelectAsset = (a: RawAsset) => {
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
    // onClose 호출 X — 부모가 setSpawnModalOpen(false) 직접 호출 (배치 모드 진입 흐름).
    onSpawn(payload, a.name);
  };

  const handleSelectPrefab = (p: PrefabRow) => {
    const tree = Array.isArray(p.payload?.tree) && p.payload.tree.length > 0
      ? p.payload.tree
      : (p.payload?.root ? [p.payload.root] : []);
    if (tree.length === 0) return;
    onSpawnPrefab({ tree }, p.name);
  };

  const countOf = (k: AssetKind) => {
    if (k === 'prefab') return prefabs.length;
    return assets.filter((a) => (a.kind || 'model') === k && a.modelUrl).length;
  };

  if (typeof document === 'undefined') return null;

  return createPortal((
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483600 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: '90vw', maxHeight: '80vh', background: '#1e1b4b', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{t('spawnAssetTitle')}</h3>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* kind 탭 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {KINDS.map((k) => {
            const active = tab === k;
            const label = k === 'model' ? t('spawnTab_model')
              : k === 'image' ? t('spawnTab_image')
              : k === 'video' ? t('spawnTab_video')
              : k === 'audio' ? t('spawnTab_audio')
              : t('spawnTab_prefab');
            return (
              <button key={k} onClick={() => setTab(k)}
                style={{
                  padding: '6px 12px',
                  background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                }}>
                <span style={{ marginRight: 4 }}>{KIND_EMOJI[k]}</span>
                {label} ({countOf(k)})
              </button>
            );
          })}
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchAssets')}
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff' }} />

        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, minHeight: 200 }}>
          {tab === 'prefab'
            ? filteredPrefabs.map((p) => (
                <button key={p.id} onClick={() => handleSelectPrefab(p)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                  <div style={{
                    width: '100%', aspectRatio: '1',
                    background: p.thumbnailUrl
                      ? `url(${p.thumbnailUrl}) center/cover`
                      : 'rgba(255,255,255,0.04)',
                    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, opacity: p.thumbnailUrl ? 1 : 0.5,
                  }}>
                    {p.thumbnailUrl ? null : KIND_EMOJI.prefab}
                  </div>
                  <div style={{ fontSize: 11, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                </button>
              ))
            : filteredAssets.map((a) => (
                <button key={a.id} onClick={() => handleSelectAsset(a)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                  <div style={{
                    width: '100%', aspectRatio: '1',
                    background: (a.thumbnailUrl || a.thumbnail)
                      ? `url(${a.thumbnailUrl || a.thumbnail}) center/cover`
                      : 'rgba(255,255,255,0.04)',
                    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, opacity: (a.thumbnailUrl || a.thumbnail) ? 1 : 0.5,
                  }}>
                    {(a.thumbnailUrl || a.thumbnail) ? null : KIND_EMOJI[tab]}
                  </div>
                  <div style={{ fontSize: 11, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                </button>
              ))}
        </div>

        {(() => {
          const filteredLen = tab === 'prefab' ? filteredPrefabs.length : filteredAssets.length;
          if (loading || filteredLen > 0) return null;
          return (
            <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20, fontSize: 13 }}>
              {tab === 'prefab' ? (t('noPrefabs') ?? 'Studio 에서 오브젝트를 우클릭 → 프리팹으로 저장하세요.') : t('noAssetsForKind')}
            </div>
          );
        })()}

        {loading && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20, fontSize: 13 }}>…</div>
        )}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
          {t('spawnInFrontHint')}
        </div>
      </div>
    </div>
  ), document.body);
}
