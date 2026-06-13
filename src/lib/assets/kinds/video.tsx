'use client';
/**
 * 'video' kind 핸들러 — MP4/WEBM
 */
import { useEffect, useRef } from 'react';
import { registerKind } from '../registry';
import type { Asset } from '../types';
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';

function VideoThumbnail({ asset }: { asset: Asset }) {
  const ref = useRef<HTMLVideoElement>(null);

  // 첫 프레임 정도 위치로 이동시켜 정지화면처럼 표시
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onLoaded = () => { try { v.currentTime = 0.1; } catch {} };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, []);

  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img draggable={false} src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video ref={ref} src={asset.modelUrl} preload="metadata" muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
      />
      {/* 재생 아이콘 오버레이 */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, color: 'rgba(255,255,255,0.85)',
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
      }}>▶</div>
    </div>
  );
}

function VideoPreview({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <AssetPreviewModal asset={asset} onClose={onClose}>
      <video src={asset.modelUrl} controls autoPlay
        style={{
          maxWidth: '90vw', maxHeight: 'calc(90vh - 80px)',
          borderRadius: 12, background: '#000',
        }}
      />
    </AssetPreviewModal>
  );
}

registerKind({
  id: 'video',
  Thumbnail: VideoThumbnail,
  Preview: VideoPreview,
});
