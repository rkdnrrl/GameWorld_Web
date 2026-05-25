'use client';
/**
 * 'image' kind 핸들러 — PNG/JPG/WEBP
 */
import { registerKind } from '../registry';
import type { Asset } from '../types';
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';

function ImageThumbnail({ asset }: { asset: Asset }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.modelUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}

function ImagePreview({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <AssetPreviewModal asset={asset} onClose={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.modelUrl} alt={asset.name}
        style={{
          maxWidth: '90vw', maxHeight: 'calc(90vh - 80px)',
          objectFit: 'contain', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
        }}
      />
    </AssetPreviewModal>
  );
}

registerKind({
  id: 'image',
  Thumbnail: ImageThumbnail,
  Preview: ImagePreview,
});
