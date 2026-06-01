'use client';
/**
 * 'map' kind 핸들러 — 스튜디오 맵 스냅샷(오브젝트 + 환경 설정)을 Asset 으로 통합.
 *
 * modelUrl 없음. asset.metadata 에 데이터/메타 저장:
 *   { data: { objects: [...], env: {...}, terrain?: {...} },
 *     icon?: string, description?: string, objectCount?: number, version: 1 }
 *
 * Thumbnail — 🗺 아이콘 + 오브젝트 개수
 * Preview — 모달에 메타 정보 + "현재 맵에 추가" 버튼 (window 이벤트 발행)
 *           스튜디오는 이 이벤트를 받아 mergeMapData() 호출.
 */
import React, { useState } from 'react';
import { registerKind } from '../registry';
import type { Asset } from '../types';
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';

interface MapMeta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { objects?: any[]; env?: any; terrain?: any };
  icon?: string;
  description?: string;
  objectCount?: number;
}

/** 맵 에셋을 현재 스튜디오에 합치는 요청 — 스튜디오는 이 이벤트를 listen 해서 처리. */
export const MAP_APPLY_EVENT = 'alp:apply-map-asset';

function MapThumbnail({ asset }: { asset: Asset }) {
  const meta = (asset.metadata ?? {}) as MapMeta;
  const icon = meta.icon || '🗺';
  const count = meta.objectCount ?? (meta.data?.objects?.length ?? 0);
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: 'linear-gradient(135deg, #1e3a8a, #1e1b4b)',
      borderRadius: 8, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 42 }}>{icon}</span>
      <span style={{ fontSize: 10, color: 'rgba(199,210,254,0.85)', fontWeight: 700 }}>
        {count} objects
      </span>
    </div>
  );
}

function MapPreview({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const meta = (asset.metadata ?? {}) as MapMeta;
  const data = meta.data ?? {};
  const count = meta.objectCount ?? (data.objects?.length ?? 0);
  const [applied, setApplied] = useState(false);

  const applyToCurrent = () => {
    // 스튜디오가 listen 하는 글로벌 이벤트로 데이터 전달. 스튜디오 외부에선 listener 없음 → 안전.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MAP_APPLY_EVENT, { detail: { data, name: asset.name } }));
      setApplied(true);
      setTimeout(() => onClose(), 600);
    }
  };

  const downloadJson = () => {
    if (typeof window === 'undefined') return;
    const payload = { format: 'alp-map', version: 1, name: asset.name, ...data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.name.replace(/[^\w가-힣.-]+/g, '_')}.alpmap.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <AssetPreviewModal asset={asset} onClose={onClose}>
      <div style={{
        background: '#0a0f1c', borderRadius: 12, padding: 18,
        width: 'min(640px, 92vw)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 44 }}>{meta.icon || '🗺'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{asset.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(199,210,254,0.75)', marginTop: 2 }}>
              🧩 {count} objects
              {data.env ? ' · 🌐 환경 설정 포함' : ''}
              {data.terrain ? ' · 🗻 지형 포함' : ''}
            </div>
            {meta.description && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, lineHeight: 1.45 }}>
                {meta.description}
              </div>
            )}
          </div>
        </div>

        <div style={{
          fontSize: 11, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)',
          color: 'rgba(199,210,254,0.85)', lineHeight: 1.5,
        }}>
          ※ <b>현재 맵에 추가</b> — 환경 설정·HDRI·지형은 유지하고, 이 맵의 오브젝트들만 새 ID 로 현재 씬에 합쳐집니다. Undo 가능.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={downloadJson}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>
            📥 .json 다운로드
          </button>
          <button
            type="button"
            onClick={applyToCurrent}
            disabled={applied}
            style={{
              background: applied ? 'rgba(16,185,129,0.55)' : 'linear-gradient(135deg,#10b981,#06b6d4)',
              border: 'none', color: '#fff', borderRadius: 7,
              padding: '8px 18px', fontSize: 12, fontWeight: 800,
              cursor: applied ? 'default' : 'pointer',
            }}>
            {applied ? '✓ 추가됨' : '➕ 현재 맵에 추가'}
          </button>
        </div>
      </div>
    </AssetPreviewModal>
  );
}

registerKind({
  id: 'map',
  Thumbnail: MapThumbnail,
  Preview: MapPreview,
});
