'use client';
/**
 * 에셋 미리보기 모달 — 공용 셸
 * 각 kind 의 Preview 컴포넌트가 children 으로 자기 미디어 요소만 렌더
 */
import { useEffect, useState } from 'react';
import type { Asset } from '@/lib/assets/types';
import { session } from '@/lib/api';

interface Props {
  asset: Asset;
  onClose: () => void;
  children: React.ReactNode;
}

export default function AssetPreviewModal({ asset, onClose, children }: Props) {
  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 다운로드는 자신의 에셋(creatorId 일치, 참조 제외)이거나 운영자일 때만
  const [me, setMe] = useState<{ id: string; isOperator?: boolean } | null>(null);
  useEffect(() => {
    const u = session.getUser();
    setMe(u ? { id: u.id, isOperator: u.isOperator } : null);
  }, []);
  const creatorId = (asset as { creatorId?: string }).creatorId;
  const canDownload = !!me && (!!me.isOperator || (creatorId === me.id && !asset.metadata?.referenceOnly));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', padding: 20,
      }}
    >
      {/* 헤더 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          color: '#fff', marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{asset.name}</div>
        {canDownload && (
          <a href={asset.modelUrl} download
            style={{
              fontSize: 12, color: '#a5b4fc', textDecoration: 'none',
              padding: '6px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: 6,
            }}>
            ↓ 다운로드
          </a>
        )}
        <button onClick={onClose}
          style={{
            fontSize: 14, color: '#fff', cursor: 'pointer',
            padding: '6px 14px', background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: 6,
          }}>
          ✕ 닫기
        </button>
      </div>

      {/* 컨텐츠 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
