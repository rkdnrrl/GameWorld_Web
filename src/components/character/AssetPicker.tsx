'use client';
/**
 * 모델 에셋 picker — character page 에서 사용.
 *
 * 소스 2개:
 *   - 공식 캐릭터 (/api/characters/official) — 운영자가 등록한 검증된 캐릭터
 *   - 내 에셋 (/api/assets/my, kind=model) — 본인이 업로드/import 한 모델
 *
 * 썸네일이 없는 경우 modelThumb 헬퍼가 오프스크린 렌더러로 3D 미리보기 PNG 를 1회 생성·캐시.
 */
import { useEffect, useRef, useState } from 'react';
import { session } from '@/lib/api';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

type Source = 'official' | 'asset';
interface PickerItem {
  id: string;
  name: string;
  modelUrl: string;
  thumbnail?: string;
  source: Source;
}

interface RawAsset { id: string; name: string; modelUrl?: string; thumbnail?: string; thumbnailUrl?: string }
interface RawCharacter { id: string; name: string; appearance?: { modelUrl?: string; thumbnailUrl?: string } }

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
  const [items, setItems] = useState<PickerItem[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | Source>('all');

  useEffect(() => {
    const token = session.getToken();
    Promise.all([
      fetch(`${API}/api/characters/official`)
        .then((r) => r.ok ? r.json() : { characters: [] })
        .catch(() => ({ characters: [] })),
      fetch(`${API}/api/assets/my`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then((r) => r.ok ? r.json() : { assets: [] })
        .catch(() => ({ assets: [] })),
    ]).then(([off, my]) => {
      const officialItems: PickerItem[] = ((off.characters || []) as RawCharacter[])
        .filter((c) => c.appearance?.modelUrl)
        .map((c) => ({
          id: `official-${c.id}`,
          name: c.name,
          modelUrl: c.appearance!.modelUrl!,
          thumbnail: c.appearance?.thumbnailUrl,
          source: 'official' as const,
        }));
      const assetItems: PickerItem[] = ((my.assets || []) as RawAsset[])
        .filter((a) => a.modelUrl)
        .map((a) => ({
          id: `asset-${a.id}`,
          name: a.name,
          modelUrl: a.modelUrl!,
          thumbnail: a.thumbnailUrl || a.thumbnail,
          source: 'asset' as const,
        }));
      // 같은 modelUrl 이 양쪽에 있으면 official 우선
      const seenUrl = new Set<string>();
      const merged = [...officialItems, ...assetItems].filter((it) => {
        if (seenUrl.has(it.modelUrl)) return false;
        seenUrl.add(it.modelUrl);
        return true;
      });
      setItems(merged);
    });
  }, []);

  // 확장자 + 검색 + 탭 필터
  const acceptedExts = (accept || '').split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  const filtered = items.filter((it) => {
    if (tab !== 'all' && it.source !== tab) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (acceptedExts.length > 0) {
      const ext = it.modelUrl.split('?')[0].split('.').pop()?.toLowerCase() || '';
      if (!acceptedExts.includes(ext)) return false;
    }
    return true;
  });

  const countOfficial = items.filter((i) => i.source === 'official').length;
  const countMine = items.filter((i) => i.source === 'asset').length;

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

        {/* 소스 탭 */}
        <div style={{ display: 'flex', gap: 6 }}>
          <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>전체 ({items.length})</TabBtn>
          <TabBtn active={tab === 'official'} onClick={() => setTab('official')}>⭐ 공식 ({countOfficial})</TabBtn>
          <TabBtn active={tab === 'asset'} onClick={() => setTab('asset')}>내 에셋 ({countMine})</TabBtn>
        </div>

        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색…"
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff' }} />
        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {filtered.map((it) => (
            <button key={it.id} onClick={() => onSelect(it.modelUrl)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', position: 'relative' }}>
              {it.source === 'official' && (
                <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(251,191,36,0.85)', color: '#1a1a1a', padding: '2px 6px', fontSize: 9, fontWeight: 700, borderRadius: 4, zIndex: 1 }}>⭐ 공식</span>
              )}
              <ThumbBox modelUrl={it.modelUrl} thumbnail={it.thumbnail} />
              <div style={{ fontSize: 11, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 30 }}>
            {tab === 'asset'
              ? '업로드한 모델이 없습니다. 에셋 페이지에서 업로드해주세요.'
              : tab === 'official'
                ? '공식 캐릭터가 없습니다.'
                : '모델이 없습니다.'}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '6px 12px',
        background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
      }}>{children}</button>
  );
}

/**
 * 썸네일 박스 — 저장된 썸네일이 있으면 그대로, 없으면 modelThumb 으로 오프스크린 렌더 (단일 GL 컨텍스트).
 * IntersectionObserver 로 보일 때만 큐에 넣어 모든 카드가 동시에 렌더되지 않도록.
 */
function ThumbBox({ modelUrl, thumbnail }: { modelUrl: string; thumbnail?: string }) {
  const [thumb, setThumb] = useState<string | null>(thumbnail || null);
  const ref = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (thumbnail) { setThumb(thumbnail); return; }
    setThumb(null);
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    visibleRef.current = false;

    const run = () => {
      if (cancelled || !visibleRef.current) return;
      import('@/lib/assets/modelThumb').then(({ requestThumb }) => {
        if (cancelled || !visibleRef.current) return;
        requestThumb(modelUrl, null, () => !cancelled && visibleRef.current)
          .then((d) => {
            if (cancelled) return;
            if (d) setThumb(d);
            else if (visibleRef.current) setTimeout(run, 80);
          })
          .catch(() => { /* 실패 시 아이콘 유지 */ });
      });
    };

    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((e) => e.isIntersecting);
      if (visibleRef.current) run();
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => { cancelled = true; visibleRef.current = false; io.disconnect(); };
  }, [modelUrl, thumbnail]);

  return (
    <div ref={ref} style={{ width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {thumb
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 32, opacity: 0.4 }}>🎲</span>}
    </div>
  );
}
