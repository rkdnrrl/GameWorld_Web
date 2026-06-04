'use client';
/**
 * 모델 에셋 picker — character page 에서 사용.
 *
 * /api/assets/my 에서 사용자 업로드 모델 + 공유 모델 목록 조회 → 사용자 선택.
 */
import { useEffect, useState } from 'react';
import { session } from '@/lib/api';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

interface AssetItem {
  id: string;
  name: string;
  modelUrl: string;
  thumbnail?: string;
  tags?: string[];
}

export function AssetPicker({
  onSelect, onClose, accept, tCommon,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
  /** 확장자 필터 — '.vrm,.glb,.gltf,.fbx' 등 */
  accept?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tCommon: any;
}) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const token = session.getToken();
    Promise.all([
      fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() : { assets: [] }),
      fetch(`${API}/api/assets/public?kind=model&limit=100`).then((r) => r.ok ? r.json() : { assets: [] }),
    ]).then(([my, pub]) => {
      const all = [...(my.assets || []), ...(pub.assets || [])];
      // 중복 제거
      const seen = new Set<string>();
      const unique = all.filter((a: AssetItem) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id); return true;
      });
      setAssets(unique);
    });
  }, []);

  // 확장자 필터
  const acceptedExts = (accept || '').split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  const filtered = assets.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (acceptedExts.length > 0) {
      const ext = a.modelUrl.split('?')[0].split('.').pop()?.toLowerCase() || '';
      if (!acceptedExts.includes(ext)) return false;
    }
    return true;
  });

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: '90vw', maxHeight: '80vh', background: '#1e1b4b', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>모델 선택</h3>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색…"
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff' }} />
        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {filtered.map((a) => (
            <button key={a.id} onClick={() => onSelect(a.modelUrl)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
              {a.thumbnail
                ? <div style={{ width: '100%', aspectRatio: '1', background: `url(${a.thumbnail}) center/cover` }} />
                : <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎲</div>}
              <div style={{ fontSize: 11, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 30 }}>
            모델이 없습니다. 에셋 페이지에서 업로드해주세요.
          </div>
        )}
      </div>
    </div>
  );
}
