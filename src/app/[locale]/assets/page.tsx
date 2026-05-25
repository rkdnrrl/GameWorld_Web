'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, session } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import type { SortMode, VisibilityFilter } from '@/lib/assets/filters';
import { filterAssets, sortAssets } from '@/lib/assets/filters';
import { getKind } from '@/lib/assets/registry';
// 사이드이펙트 import — 모든 kind 핸들러 등록
import '@/lib/assets/kinds';

import AssetSidebar       from '@/components/assets/AssetSidebar';
import AssetToolbar       from '@/components/assets/AssetToolbar';
import AssetGrid          from '@/components/assets/AssetGrid';
import AssetActiveFilters from '@/components/assets/AssetActiveFilters';
import AssetTagEditor     from '@/components/assets/AssetTagEditor';
import AssetFolderEditor  from '@/components/assets/AssetFolderEditor';
import AssetBulkBar       from '@/components/assets/AssetBulkBar';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

export default function AssetsPage() {
  const t = useTranslations('Assets');
  const router       = useRouter();
  const searchParams = useSearchParams();

  /* ── 데이터 ── */
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kinds,  setKinds]  = useState<AssetKind[]>([]);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [taggingAsset, setTaggingAsset] = useState<Asset | null>(null);
  const [foldingAsset, setFoldingAsset] = useState<Asset | null>(null);
  // 다중 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /* ── 업로드 ── */
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState('');
  const [dragOver,  setDragOver]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = () => session.getToken() || '';

  /* ── URL 쿼리스트링 상태 ── */
  const q          = searchParams.get('q') || '';
  const sort       = (searchParams.get('sort') || 'recent') as SortMode;
  const visibility = (searchParams.get('vis') || 'all')    as VisibilityFilter;
  const selectedKinds = searchParams.get('kind')
    ? searchParams.get('kind')!.split(',').filter(Boolean)
    : [];
  const selectedTags = searchParams.get('tag')
    ? searchParams.get('tag')!.split(',').filter(Boolean)
    : [];
  // 폴더: 미설정=null (필터 없음), "" = 루트만, "/캐릭터" = 그 하위 전부
  const folderParam = searchParams.get('folder');
  const selectedFolder: string | null = folderParam === null ? null : folderParam;

  const toggleTag = useCallback((tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    const sp = new URLSearchParams(searchParams.toString());
    if (next.length === 0) sp.delete('tag');
    else sp.set('tag', next.join(','));
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [selectedTags, searchParams, router]);

  const setQuery = useCallback((patch: Record<string, string | string[] | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
        sp.delete(k);
      } else {
        sp.set(k, Array.isArray(v) ? v.join(',') : v);
      }
    });
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [router, searchParams]);

  /* ── 초기 로드: kinds + assets 병렬 ── */
  useEffect(() => {
    fetch(`${API}/api/asset-kinds`)
      .then(r => r.json())
      .then(d => setKinds(d.kinds || []))
      .catch(() => {});
    fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setAssets(d.assets || []))
      .catch(() => {});
  }, []);

  /* ── 업로드 허용 확장자 (DB kinds 기반) ── */
  const acceptAttr = useMemo(
    () => kinds.flatMap(k => k.extensions).map(e => `.${e}`).join(','),
    [kinds],
  );
  const maxSizeMb = useMemo(
    () => Math.max(5, ...kinds.map(k => k.maxSizeMb)),
    [kinds],
  );

  async function upload(file: File) {
    setError('');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const kind = kinds.find(k => k.extensions.includes(ext));
    if (!kind) { setError(t('unsupportedType', { ext })); return; }
    if (file.size > kind.maxSizeMb * 1024 * 1024) {
      setError(t('sizeOverLimit', { maxMb: kind.maxSizeMb }));
      return;
    }

    setUploading(true);
    setProgress(0);

    const form = new FormData();
    form.append('model', file);
    form.append('name', file.name.replace(/\.[^.]+$/, ''));

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const d = JSON.parse(xhr.responseText);
            if (d.asset) setAssets(prev => [d.asset, ...prev]);
            resolve();
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error?.message)); }
            catch { reject(new Error(t('uploadFailed'))); }
          }
        };
        xhr.onerror = () => reject(new Error(t('networkError')));
        xhr.open('POST', `${API}/api/assets/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
        xhr.send(form);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('uploadFailed'));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  async function deleteAsset(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    const r = await fetch(`${API}/api/assets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) setAssets(prev => prev.filter(a => a.id !== id));
  }

  async function togglePublic(asset: Asset) {
    const r = await fetch(`${API}/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isPublic: !asset.isPublic }),
    });
    if (r.ok) {
      const { asset: updated } = await r.json();
      setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
    }
  }

  async function saveTags(asset: Asset, tags: string[]) {
    const r = await fetch(`${API}/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ tags }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'save failed');
    }
    const { asset: updated } = await r.json();
    setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  async function saveFolder(asset: Asset, folder: string | null) {
    const r = await fetch(`${API}/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ folder }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'save failed');
    }
    const { asset: updated } = await r.json();
    setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  /* ── 필터링/정렬 ── */
  const visibleAssets = useMemo(() => {
    const filtered = filterAssets(
      assets,
      { q, kinds: selectedKinds, tags: selectedTags, visibility, folder: selectedFolder },
      kinds,
    );
    return sortAssets(filtered, sort, kinds);
  }, [assets, q, selectedKinds, selectedTags, selectedFolder, visibility, sort, kinds]);

  /* ── 선택 토글 + Shift 범위 선택 ── */
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      // Shift + 클릭 — 마지막 클릭과 사이 전부 선택
      if (e.shiftKey && lastClickedRef.current) {
        const ids = visibleAssets.map(a => a.id);
        const a = ids.indexOf(lastClickedRef.current);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          lastClickedRef.current = id;
          return next;
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id);
      lastClickedRef.current = id;
      return next;
    });
  }, [visibleAssets]);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visibleAssets.map(a => a.id)));
  }, [visibleAssets]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /* ── 일괄 작업 ── */
  async function runBulk(
    action: 'delete' | 'move' | 'addTags' | 'removeTags' | 'setPublic',
    value?: unknown,
  ) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const tk = session.getToken() || '';
      const res = await api.batchUpdateAssets(tk, { ids, action, value });
      // 로컬 반영
      setAssets(prev => {
        if (action === 'delete') return prev.filter(a => !selectedIds.has(a.id));
        if (action === 'move')   return prev.map(a => selectedIds.has(a.id) ? { ...a, folder: (value as string | null) ?? null } : a);
        if (action === 'setPublic') return prev.map(a => selectedIds.has(a.id) ? { ...a, isPublic: Boolean(value) } : a);
        if (action === 'addTags' || action === 'removeTags') {
          const incoming = (value as string[]) || [];
          return prev.map(a => {
            if (!selectedIds.has(a.id)) return a;
            const cur = a.tags || [];
            const next = action === 'addTags'
              ? Array.from(new Set([...cur, ...incoming])).slice(0, 30)
              : cur.filter(t => !incoming.includes(t));
            return { ...a, tags: next };
          });
        }
        return prev;
      });
      if (res.skipped > 0) setError(t('bulkSkippedSome', { count: res.skipped }));
      else setError('');
      if (action === 'delete') setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'bulk failed');
    } finally {
      setBulkBusy(false);
    }
  }

  /* ── 에디터/프리뷰 (kind 핸들러에서 가져옴) ── */
  const editorHandler  = editingAsset ? getKind(editingAsset.kind) : null;
  const EditorComp     = editorHandler?.Editor;
  const previewHandler = previewAsset ? getKind(previewAsset.kind) : null;
  const PreviewComp    = previewHandler?.Preview;

  return (
    <>
      {editingAsset && EditorComp && (
        <EditorComp
          asset={editingAsset}
          allAssets={assets}
          onClose={() => setEditingAsset(null)}
          onSaved={(updated: Asset) => setAssets(prev => prev.map(a => a.id === updated.id ? updated : a))}
        />
      )}
      {previewAsset && PreviewComp && (
        <PreviewComp asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
      {taggingAsset && (
        <AssetTagEditor
          asset={taggingAsset}
          allAssets={assets}
          onClose={() => setTaggingAsset(null)}
          onSave={(tags) => saveTags(taggingAsset, tags)}
        />
      )}
      {foldingAsset && (
        <AssetFolderEditor
          asset={foldingAsset}
          allAssets={assets}
          onClose={() => setFoldingAsset(null)}
          onSave={(folder) => saveFolder(foldingAsset, folder)}
        />
      )}

      <AssetBulkBar
        selectedCount={selectedIds.size}
        totalVisible={visibleAssets.length}
        busy={bulkBusy}
        onSelectAll={selectAllVisible}
        onClear={clearSelection}
        onBulkDelete={() => runBulk('delete')}
        onBulkMove={(folder) => runBulk('move', folder)}
        onBulkAddTags={(tags) => runBulk('addTags', tags)}
        onBulkSetPublic={(isPublic) => runBulk('setPublic', isPublic)}
      />

      <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>📦</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('title')}</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('headerSubtitle', { count: kinds.length })}</p>
          </div>
        </div>

        {/* 본문: 사이드바 + 메인 */}
        <div style={{ display: 'flex', maxWidth: 1400, margin: '0 auto' }}>
          <AssetSidebar
            assets={assets}
            kinds={kinds}
            selectedKinds={selectedKinds}
            selectedTags={selectedTags}
            selectedFolder={selectedFolder}
            onSelectKinds={ks => setQuery({ kind: ks })}
            onToggleTag={toggleTag}
            onSelectFolder={f => setQuery({ folder: f })}
          />

          <div style={{ flex: 1, padding: '20px 32px' }}>
            {/* 업로드 영역 */}
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${dragOver ? '#6366f1' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 16, padding: '28px', textAlign: 'center',
                cursor: uploading ? 'default' : 'pointer', marginBottom: 18,
                background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
                transition: 'all .15s',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept={acceptAttr}
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
              />
              {uploading ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⬆️</div>
                  <div style={{ fontSize: 14, marginBottom: 12, opacity: 0.8 }}>{t('uploadingPercent', { progress })}</div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, maxWidth: 320, margin: '0 auto' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                      width: `${progress}%`,
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🗂️</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t('dragHint')}</div>
                  <div style={{ fontSize: 12, opacity: 0.45 }}>{t('fileTypeHint', { maxMb: maxSizeMb })}</div>
                </>
              )}
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 14,
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* 툴바 */}
            <AssetToolbar
              q={q}
              onQ={v => setQuery({ q: v })}
              sort={sort}
              onSort={v => setQuery({ sort: v === 'recent' ? null : v })}
              visibility={visibility}
              onVisibility={v => setQuery({ vis: v === 'all' ? null : v })}
              resultCount={visibleAssets.length}
            />

            {/* 활성 필터 칩 */}
            <AssetActiveFilters
              selectedKinds={selectedKinds}
              selectedTags={selectedTags}
              selectedFolder={selectedFolder}
              kinds={kinds}
              onRemoveKind={(id) => setQuery({ kind: selectedKinds.filter(x => x !== id) })}
              onRemoveTag={(tag) => setQuery({ tag: selectedTags.filter(x => x !== tag) })}
              onRemoveFolder={() => setQuery({ folder: null })}
              onClearAll={() => setQuery({ kind: null, tag: null, folder: null })}
            />

            {/* 그리드 */}
            <AssetGrid
              assets={visibleAssets}
              kinds={kinds}
              selectedTags={selectedTags}
              selectedFolder={selectedFolder}
              selectedIds={selectedIds}
              emptyMessage={
                assets.length === 0
                  ? `${t('emptyState')}\n${t('emptyHint')}`
                  : t('noMatches')
              }
              onEdit={setEditingAsset}
              onPreview={setPreviewAsset}
              onEditTags={setTaggingAsset}
              onEditFolder={setFoldingAsset}
              onClickTag={toggleTag}
              onClickFolder={(f) => setQuery({ folder: f })}
              onToggleSelect={toggleSelect}
              onTogglePublic={togglePublic}
              onDelete={deleteAsset}
            />
          </div>
        </div>
      </div>
    </>
  );
}
