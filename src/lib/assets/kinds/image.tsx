'use client';
/**
 * 'image' kind 핸들러 — PNG/JPG/WEBP
 */
import { registerKind } from '../registry';
import type { Asset } from '../types';

function ImageThumbnail({ asset }: { asset: Asset }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.modelUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}

registerKind({
  id: 'image',
  Thumbnail: ImageThumbnail,
});
