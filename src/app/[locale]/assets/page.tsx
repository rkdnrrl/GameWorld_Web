'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, session } from '@/lib/api';

import type { Asset, AssetKind } from '@/lib/assets/types';
import type { SortMode, VisibilityFilter } from '@/lib/assets/filters';
import { filterAssets, sortAssets } from '@/lib/assets/filters';
import { buildFolderTree, normalizeFolder } from '@/lib/assets/folders';
import type { FolderNode } from '@/lib/assets/folders';
import { getKind } from '@/lib/assets/registry';
// 사이드이펙트 import — 모든 kind 핸들러 등록
import '@/lib/assets/kinds';

import CreatorNav         from '@/components/creator/CreatorNav';
import AssetSidebar       from '@/components/assets/AssetSidebar';
import AssetToolbar       from '@/components/assets/AssetToolbar';
import AssetGrid          from '@/components/assets/AssetGrid';
import AssetActiveFilters from '@/components/assets/AssetActiveFilters';
import AssetTagEditor     from '@/components/assets/AssetTagEditor';
import AssetFolderEditor  from '@/components/assets/AssetFolderEditor';
import AssetBulkBar       from '@/components/assets/AssetBulkBar';
import AssetVersionsModal from '@/components/assets/AssetVersionsModal';
import MyPacksModal       from '@/components/assets/MyPacksModal';

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
  const [versionsAsset, setVersionsAsset] = useState<Asset | null>(null);
  const [packsOpen, setPacksOpen] = useState(false);
  // 다중 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // 드래그 상태 — 드롭 타겟 강조용
  const [dragActive, setDragActive] = useState(false);
  // 드래그 중인 에셋 id 들 (선택돼 있으면 selectedIds, 아니면 해당 카드 단건)
  const dragIdsRef = useRef<string[]>([]);

  // 사용자가 명시적으로 만든 빈 폴더 (assets 에 없지만 트리에 표시)
  const [manualFolders, setManualFolders] = useState<string[]>([]);
  function createFolder(path: string) {
    setManualFolders(prev => prev.includes(path) ? prev : [...prev, path]);
    setQuery({ folder: path });
  }

  async function deleteFolder(folderPath: string) {
    const folderName = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
    const toDelete = assets.filter(a => {
      const f = a.folder ?? null;
      return f === folderPath || (f !== null && f.startsWith(folderPath + '/'));
    });

    const msg = toDelete.length > 0
      ? `"${folderName}" 폴더를 삭제하면 안에 있는 에셋 ${toDelete.length}개도 모두 영구 삭제됩니다.\n\n계속하시겠습니까?`
      : `"${folderName}" 폴더를 삭제하시겠습니까?`;
    if (!window.confirm(msg)) return;

    const ids = toDelete.map(a => a.id);

    // 로컬 state 즉시 반영
    setAssets(prev => prev.filter(a => !ids.includes(a.id)));
    setManualFolders(prev => prev.filter(f => f !== folderPath && !f.startsWith(folderPath + '/')));

    // 현재 해당 폴더를 보고 있으면 루트로 이동
    if (selectedFolder === folderPath || (selectedFolder !== null && selectedFolder.startsWith(folderPath + '/'))) {
      setQuery({ folder: null });
    }

    if (ids.length > 0) {
      try {
        const tk = session.getToken() || '';
        await api.batchUpdateAssets(tk, { ids, action: 'delete', value: null });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'delete failed');
        fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
          .then(r => r.json()).then(d => setAssets(d.assets || [])).catch(() => {});
      }
    }
  }

  async function moveFolder(fromPath: string, toParentPath: string | null) {
    if (toParentPath !== null && (toParentPath === fromPath || toParentPath.startsWith(fromPath + '/'))) return;
    const lastSegment = fromPath.split('/').filter(Boolean).pop() ?? fromPath;
    const newPath = toParentPath ? `${toParentPath}/${lastSegment}` : `/${lastSegment}`;
    if (newPath === fromPath) return;

    const updated = assets.map(a => {
      const f = a.folder ?? null;
      if (f === fromPath) return { ...a, folder: newPath };
      if (f && f.startsWith(fromPath + '/')) return { ...a, folder: newPath + f.slice(fromPath.length) };
      return a;
    });
    setAssets(updated);
    setManualFolders(prev => prev.map(f => {
      if (f === fromPath) return newPath;
      if (f.startsWith(fromPath + '/')) return newPath + f.slice(fromPath.length);
      return f;
    }));
    if (selectedFolder === fromPath || (selectedFolder !== null && selectedFolder.startsWith(fromPath + '/'))) {
      setQuery({ folder: toParentPath });
    }
    const toUpdate = updated.filter(a => {
      const orig = assets.find(x => x.id === a.id);
      return orig && orig.folder !== a.folder;
    });
    const tk = session.getToken() || '';
    for (const a of toUpdate) {
      try {
        await fetch(`${API}/api/assets/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
          body: JSON.stringify({ folder: a.folder }),
        });
      } catch (e) { console.error('폴더 이동 실패', e); }
    }
  }

  /* ── 업로드 ── */
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [batchDone,  setBatchDone]  = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFailed, setBatchFailed] = useState(0);
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

  /** 단일 파일 업로드 — state 는 건드리지 않고 성공 시 새 asset 만 반환 */
  function uploadOne(file: File, folder: string | null, onProgress: (pct: number) => void): Promise<Asset> {
    return new Promise((resolve, reject) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const kind = kinds.find(k => k.extensions.includes(ext));
      if (!kind) { reject(new Error(t('unsupportedType', { ext }))); return; }
      if (file.size > kind.maxSizeMb * 1024 * 1024) {
        reject(new Error(t('sizeOverLimit', { maxMb: kind.maxSizeMb }))); return;
      }

      const form = new FormData();
      form.append('model', file);
      form.append('name', file.name.replace(/\.[^.]+$/, ''));
      if (folder) form.append('folder', folder);

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const d = JSON.parse(xhr.responseText);
            if (d.asset) resolve(d.asset);
            else reject(new Error(t('uploadFailed')));
          } catch { reject(new Error(t('uploadFailed'))); }
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
  }

  /** 여러 파일 — 순차 업로드 + 배치 진행률 + 개별 실패 격리.
   *  folderOverride 가 있으면 그 폴더로, 아니면 selectedFolder 로. */
  async function uploadMany(files: File[], folderOverride?: string | null) {
    if (files.length === 0) return;
    const folder = folderOverride !== undefined ? folderOverride : selectedFolder;
    setError('');
    setUploading(true);
    setProgress(0);
    setBatchDone(0);
    setBatchTotal(files.length);
    setBatchFailed(0);

    const failed: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const asset = await uploadOne(files[i], folder, pct => setProgress(pct));
        setAssets(prev => [asset, ...prev]);
      } catch (e) {
        failed.push(`${files[i].name}: ${e instanceof Error ? e.message : ''}`);
        setBatchFailed(n => n + 1);
      }
      setBatchDone(i + 1);
      setProgress(0);
    }

    setUploading(false);
    setProgress(0);
    if (failed.length > 0) {
      setError(t('batchUploadFailed', { count: failed.length }) + '\n' + failed.slice(0, 5).join('\n'));
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadMany(files);
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

  async function renameAsset(asset: Asset, newName: string) {
    const r = await fetch(`${API}/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ name: newName }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'rename failed');
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

  /* ── 폴더 트리 + 현재 폴더의 직계 서브폴더 ── */
  function findFolderNode(nodes: FolderNode[], path: string): FolderNode | null {
    for (const n of nodes) {
      if (n.path === path) return n;
      const found = findFolderNode(n.children, path);
      if (found) return found;
    }
    return null;
  }
  const folderTree = useMemo(() => {
    const fromAssets = assets.map(a => normalizeFolder(a.folder)).filter((f): f is string => f !== null);
    const all = Array.from(new Set([...fromAssets, ...manualFolders])).sort();
    return buildFolderTree(all);
  }, [assets, manualFolders]);
  const selectedSubfolders = useMemo(() => {
    if (selectedFolder === null) return [];
    const node = findFolderNode(folderTree, selectedFolder);
    return node ? node.children : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderTree, selectedFolder]);

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

  /* ── 드래그앤드롭 ── */
  function onCardDragStart(asset: Asset, e: React.DragEvent) {
    // 선택된 게 있으면 그 전체, 아니면 단건 (드래그된 카드가 선택돼 있어야 다른 것도 같이)
    const ids = selectedIds.has(asset.id) && selectedIds.size > 0
      ? Array.from(selectedIds)
      : [asset.id];
    dragIdsRef.current = ids;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(ids));   // fallback
    setDragActive(true);
  }
  function onCardDragEnd() {
    setDragActive(false);
    dragIdsRef.current = [];
  }
  /** 사이드바 폴더 드롭 — 내부 카드 드래그(이동) 또는 OS 파일(업로드) 둘 다 처리 */
  async function onDropToFolder(folder: string | null, files?: File[]) {
    setDragActive(false);
    // 1) OS 파일이 함께 왔으면 그 폴더로 업로드
    if (files && files.length > 0) {
      dragIdsRef.current = [];
      await uploadMany(files, folder);
      return;
    }
    // 2) 내부 카드 드래그 → 폴더 이동
    const ids = dragIdsRef.current;
    dragIdsRef.current = [];
    if (ids.length === 0) return;
    const filtered = ids.filter(id => {
      const a = assets.find(x => x.id === id);
      return a && (a.folder ?? null) !== folder;
    });
    if (filtered.length === 0) return;

    setAssets(prev => prev.map(a => filtered.includes(a.id) ? { ...a, folder } : a));
    try {
      const tk = session.getToken() || '';
      await api.batchUpdateAssets(tk, { ids: filtered, action: 'move', value: folder });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'move failed');
      fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAssets(d.assets || [])).catch(() => {});
    }
  }

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
      {versionsAsset && (
        <AssetVersionsModal
          asset={versionsAsset}
          onClose={() => setVersionsAsset(null)}
          onAssetChanged={(updated) => {
            setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
            setVersionsAsset(updated);
          }}
        />
      )}
      {packsOpen && (
        <MyPacksModal allAssets={assets} onClose={() => setPacksOpen(false)} />
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
        <CreatorNav />
        {/* 헤더 */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>📦</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('title')}</h1>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('headerSubtitle', { count: kinds.length })}</p>
          </div>
          <button onClick={() => setPacksOpen(true)} style={{
            fontSize: 12, color: '#a5b4fc', fontWeight: 700, cursor: 'pointer',
            padding: '8px 14px', background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            📦 {t('myPacksLink')}
          </button>
          <Link href="/assets/browse" style={{
            fontSize: 12, color: '#a5b4fc', textDecoration: 'none', fontWeight: 700,
            padding: '8px 14px', background: 'rgba(99,102,241,0.18)', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            🛒 {t('marketBrowseLink')}
          </Link>
        </div>

        {/* 본문: 사이드바 + 메인 */}
        <div style={{ display: 'flex', maxWidth: 1400, margin: '0 auto' }}>
          <AssetSidebar
            assets={assets}
            kinds={kinds}
            selectedKinds={selectedKinds}
            selectedTags={selectedTags}
            selectedFolder={selectedFolder}
            manualFolders={manualFolders}
            dragActive={dragActive}
            onSelectKinds={ks => setQuery({ kind: ks })}
            onToggleTag={toggleTag}
            onSelectFolder={f => setQuery({ folder: f })}
            onDropToFolder={onDropToFolder}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            onFolderMove={moveFolder}
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
                multiple
                accept={acceptAttr}
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) uploadMany(files);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⬆️</div>
                  <div style={{ fontSize: 14, marginBottom: 6, opacity: 0.8 }}>
                    {batchTotal > 1
                      ? t('batchUploadingProgress', { done: batchDone, total: batchTotal, percent: progress })
                      : t('uploadingPercent', { progress })}
                  </div>
                  {batchFailed > 0 && (
                    <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8 }}>
                      ⚠️ {t('batchUploadFailedShort', { count: batchFailed })}
                    </div>
                  )}
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, maxWidth: 320, margin: '8px auto 0' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                      width: batchTotal > 1
                        ? `${Math.round(((batchDone + progress / 100) / batchTotal) * 100)}%`
                        : `${progress}%`,
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🗂️</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t('dragHintMulti')}</div>
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

            {/* 서브폴더 카드 */}
            {selectedSubfolders.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {selectedSubfolders.map(n => (
                  <button
                    key={n.path}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('folderPath', n.path); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => {
                      e.preventDefault();
                      const from = e.dataTransfer.getData('folderPath');
                      if (from && from !== n.path && !n.path.startsWith(from + '/')) moveFolder(from, n.path);
                    }}
                    onClick={() => setQuery({ folder: n.path })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      color: '#e2e8f0', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(129,140,248,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  >
                    📁 {n.name}
                  </button>
                ))}
              </div>
            )}

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
              onEditVersions={setVersionsAsset}
              onRename={renameAsset}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          </div>
        </div>
      </div>
    </>
  );
}
