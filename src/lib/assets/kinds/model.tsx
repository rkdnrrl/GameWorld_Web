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

// FBX/GLB 등 — 저장된 썸네일이 없으면, 카드가 화면에 보일 때 오프스크린 렌더러(단일)로
// 3D 미리보기 이미지를 한 번 생성·캐시해 항상 표시. 카드마다 라이브 캔버스를 띄우지 않아
// WebGL 컨텍스트 한계로 일부가 빈칸이 되는 문제가 없음. (머티리얼 설정 텍스처도 적용)
function ModelThumbnail({ asset }: { asset: Asset }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (asset.thumbnailUrl) return;          // 서버 썸네일 우선
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      import('@/lib/assets/modelThumb')
        .then(({ requestThumb }) => requestThumb(asset.modelUrl, getMaterialConfig(asset)))
        .then(d => { if (!cancelled) setThumb(d); })
        .catch(() => { /* 실패 시 아이콘 유지 */ });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [asset.modelUrl, asset.thumbnailUrl]);

  // 저장된 썸네일 이미지가 있으면 그대로 사용
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  if (thumb) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
  }
  // 생성 전 — 아이콘 (이 div 가 보이면 생성 트리거)
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 44, opacity: 0.4 }}>🎲</span>
    </div>
  );
}

registerKind({
  id: 'model',
  Thumbnail: ModelThumbnail,
  Editor: AssetMaterialEditor,
});
