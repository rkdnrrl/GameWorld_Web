'use client';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
  isPublic: boolean;
  createdAt: string;
}

const ACCEPT = '.fbx';
const MAX_MB = 100;

export default function AssetsPage() {
  const t = useTranslations('Assets');
  const [assets, setAssets]       = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState('');
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = () => session.getToken() || '';

  /* 내 에셋 목록 */
  useEffect(() => {
    fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setAssets(d.assets || []))
      .catch(() => {});
  }, []);

  /* 파일 업로드 */
  async function upload(file: File) {
    setError('');
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t('sizeOverLimit', { maxMb: MAX_MB }));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext !== 'fbx') {
      setError(t('fbxOnly'));
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

  /* 드래그&드롭 */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  /* 삭제 */
  async function deleteAsset(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    const r = await fetch(`${API}/api/assets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (r.ok) setAssets(prev => prev.filter(a => a.id !== id));
  }

  /* 공개 토글 */
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

  const extBadge = () => ({ ext: 'FBX', color: '#f59e0b' });

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#fff',
      fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 26 }}>📦</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t('title')}</h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>{t('subtitle', { maxMb: MAX_MB })}</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* 업로드 영역 */}
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? '#6366f1' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 20, padding: '48px 32px', textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer', marginBottom: 36,
            background: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
            transition: 'all .15s',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
          />

          {uploading ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⬆️</div>
              <div style={{ fontSize: 15, marginBottom: 16, opacity: 0.8 }}>{t('uploadingPercent', { progress })}</div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, maxWidth: 320, margin: '0 auto' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                  width: `${progress}%`,
                  transition: 'width 0.2s ease',
                }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗂️</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                {t('dragHint')}
              </div>
              <div style={{ fontSize: 13, opacity: 0.45 }}>{t('fileTypeHint', { maxMb: MAX_MB })}</div>
            </>
          )}
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '10px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 20,
          }}>
            ⚠️ {error}
          </div>
        )}


        {/* 에셋 목록 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t('myAssetsCount', { count: assets.length })}</h2>
        </div>

        {assets.length === 0 ? (
          <div style={{ textAlign: 'center', opacity: 0.35, padding: '48px 0', fontSize: 14 }}>
            업로드된 에셋이 없습니다.<br />위에서 파일을 드래그하거나 클릭해서 추가하세요.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {assets.map(a => {
              const { ext, color } = extBadge();
              return (
                <div key={a.id} style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
                  transition: 'border-color .15s',
                }}>
                  {/* 썸네일 */}
                  <div style={{
                    width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                  }}>
                    {a.thumbnailUrl
                      ? <img src={a.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 44, opacity: 0.4 }}>📦</span>
                    }
                    {/* 파일 형식 배지 */}
                    <span style={{
                      position: 'absolute', top: 8, left: 8,
                      background: color, color: '#fff',
                      fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                    }}>
                      {ext}
                    </span>
                    {/* 공개 배지 */}
                    {a.isPublic && (
                      <span style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(16,185,129,0.9)', color: '#fff',
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      }}>공개</span>
                    )}
                  </div>

                  {/* 정보 */}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <a
                        href={a.modelUrl}
                        download
                        style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', padding: '3px 8px', background: 'rgba(99,102,241,0.15)', borderRadius: 5 }}
                      >
                        ↓ 다운로드
                      </a>
                      <button
                        onClick={() => togglePublic(a)}
                        style={{
                          fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
                          background: a.isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)',
                          color: a.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {a.isPublic ? '공개 중' : '비공개'}
                      </button>
                      <button
                        onClick={() => deleteAsset(a.id)}
                        style={{
                          fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
                          background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
