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
  // 현재 화면에 보이는지 — 보이는 동안에만 생성하고, 밖으로 나가면 생성을 취소(유니티식)
  const visibleRef = useRef(false);
  // 머티리얼 설정이 바뀌면(에디터에서 텍스처 저장 등) 썸네일 재생성
  const cfgKey = JSON.stringify(getMaterialConfig(asset) ?? null);

  useEffect(() => {
    if (asset.thumbnailUrl) return;          // 서버 썸네일 우선
    setThumb(null);                          // url/config 바뀌면 다시 생성
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    visibleRef.current = false;

    // 보이는 동안에만 생성. isWanted 로 큐 처리 시점에 화면 밖이면 렌더 스킵.
    const run = () => {
      if (cancelled || !visibleRef.current) return;
      import('@/lib/assets/modelThumb').then(({ requestThumb }) => {
        if (cancelled || !visibleRef.current) return;
        requestThumb(asset.modelUrl, getMaterialConfig(asset), () => !cancelled && visibleRef.current)
          .then(d => {
            if (cancelled) return;
            if (d) setThumb(d);
            else if (visibleRef.current) setTimeout(run, 60);  // 스킵됐는데 아직 보이면 재시도
          })
          .catch(() => { /* 실패 시 아이콘 유지 */ });
      });
    };

    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some(e => e.isIntersecting);
      if (visibleRef.current) run();
    }, { rootMargin: '120px' });
    io.observe(el);
    return () => { cancelled = true; visibleRef.current = false; io.disconnect(); };
  }, [asset.modelUrl, asset.thumbnailUrl, cfgKey]);

  // 저장된 썸네일 이미지가 있으면 그대로 사용
  if (asset.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img draggable={false} src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  // ref 컨테이너는 항상 렌더(IntersectionObserver 타깃 유지) — 썸네일 있으면 이미지, 없으면 아이콘
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {thumb
        // eslint-disable-next-line @next/next/no-img-element
        ? <img draggable={false} src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 44, opacity: 0.4 }}>🎲</span>}
    </div>
  );
}

registerKind({
  id: 'model',
  Thumbnail: ModelThumbnail,
  Editor: AssetMaterialEditor,
});
