'use client';
/**
 * 'model' kind 핸들러 — FBX/GLB/OBJ
 */
import dynamic from 'next/dynamic';
import { registerKind } from '../registry';
import type { Asset } from '../types';

const AssetMaterialEditor = dynamic(
  () => import('@/components/assets/AssetMaterialEditor'),
  { ssr: false },
);

function ModelThumbnail({ asset }: { asset: Asset }) {
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <span style={{ fontSize: 44, opacity: 0.4 }}>🎲</span>;
}

registerKind({
  id: 'model',
  Thumbnail: ModelThumbnail,
  Editor: AssetMaterialEditor,
});
