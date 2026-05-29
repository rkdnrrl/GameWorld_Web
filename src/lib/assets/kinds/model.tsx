'use client';
/**
 * 'model' kind 핸들러 — FBX/GLB/OBJ
 */
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { registerKind } from '../registry';
import type { Asset } from '../types';

const AssetMaterialEditor = dynamic(
  () => import('@/components/assets/AssetMaterialEditor'),
  { ssr: false },
);

// 호버 시에만 로드되는 경량 3D 미리보기 (R3F 를 필요할 때만 번들 로드)
const ModelThumbViewer = dynamic(
  () => import('@/components/assets/ModelThumbViewer'),
  { ssr: false },
);

function ModelThumbnail({ asset }: { asset: Asset }) {
  const [hovered, setHovered] = useState(false);
  // 저장된 썸네일 이미지가 있으면 그대로 사용
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  // 썸네일 없으면(FBX 등) 호버 시 실시간 3D 미리보기, 평소엔 아이콘
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {hovered
        ? <ModelThumbViewer url={asset.modelUrl} />
        : <span style={{ fontSize: 44, opacity: 0.4 }}>🎲</span>}
    </div>
  );
}

registerKind({
  id: 'model',
  Thumbnail: ModelThumbnail,
  Editor: AssetMaterialEditor,
});
