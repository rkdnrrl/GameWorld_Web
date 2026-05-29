'use client';
/**
 * 'model' kind 핸들러 — FBX/GLB/OBJ
 */
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { registerKind } from '../registry';
import type { Asset } from '../types';
import { getMaterialConfig } from '../types';

const AssetMaterialEditor = dynamic(
  () => import('@/components/assets/AssetMaterialEditor'),
  { ssr: false },
);

// 라이브 3D 뷰어 — 화면에 보일 때만 로드/마운트
const ModelThumbViewer = dynamic(
  () => import('@/components/assets/ModelThumbViewer'),
  { ssr: false },
);

// FBX/GLB 등 — 저장된 썸네일이 없으면, 카드가 화면에 보일 때만 라이브 3D 로 표시.
// 화면 밖이면 언마운트해 WebGL 컨텍스트를 반납 → 한 화면 카드 수만큼만 동시 렌더(안전).
function ModelThumbnail({ asset }: { asset: Asset }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (asset.thumbnailUrl) return;          // 서버 썸네일 우선
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some(e => e.isIntersecting)),
      { rootMargin: '0px' },                 // 딱 보이는 화면까지만
    );
    io.observe(el);
    return () => io.disconnect();
  }, [asset.thumbnailUrl]);

  // 저장된 썸네일 이미지가 있으면 그대로 사용
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  // 보이면 라이브 3D, 화면 밖이면 아이콘 (컨텍스트 반납)
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {visible
        ? <ModelThumbViewer url={asset.modelUrl} config={getMaterialConfig(asset)} />
        : <span style={{ fontSize: 44, opacity: 0.4 }}>🎲</span>}
    </div>
  );
}

registerKind({
  id: 'model',
  Thumbnail: ModelThumbnail,
  Editor: AssetMaterialEditor,
});
