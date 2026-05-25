'use client';
/**
 * 'audio' kind 핸들러 — MP3/WAV/OGG
 */
import { registerKind } from '../registry';
import type { Asset } from '../types';
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';

function AudioThumbnail({ asset }: { asset: Asset }) {
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#1e293b,#312e81)',
      fontSize: 48,
    }}>
      🎵
    </div>
  );
}

function AudioPreview({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <AssetPreviewModal asset={asset} onClose={onClose}>
      <div style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 16,
        padding: 32, minWidth: 400, maxWidth: 600, textAlign: 'center',
      }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>🎵</div>
        <audio src={asset.modelUrl} controls preload="metadata" autoPlay
          style={{ width: '100%', borderRadius: 8 }}
        />
      </div>
    </AssetPreviewModal>
  );
}

registerKind({
  id: 'audio',
  Thumbnail: AudioThumbnail,
  Preview: AudioPreview,
});
