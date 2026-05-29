'use client';
/**
 * 모델 카드용 라이브 3D 뷰어 — 화면에 보이는 카드에만 마운트(스크롤로 벗어나면 언마운트).
 *  화면에 한 번에 보이는 카드 수만큼만 WebGL 컨텍스트를 쓰므로(보통 ~10개) 안전.
 *  저장된 materialConfig(텍스처·프리셋) 가 있으면 머티리얼 에디터와 똑같이 적용해 보여준다.
 *  pointer-events:none 이라 클릭은 카드(편집/미리보기)로 그대로 전달됨.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildMat, disposeMat, type MaterialConfig } from '@/lib/assets/material';

function Spinning({ url, config }: { url: string; config?: MaterialConfig | null }) {
  const ref = useRef<THREE.Group>(null);
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const builtMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/world/modelLoader').then(({ loadStaticModel }) =>
      loadStaticModel(url).then(m => {
        if (cancelled) return;
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z) || 1;
        m.scale.setScalar(1 / h);
        m.position.set(-center.x / h, -center.y / h, -center.z / h);

        // 저장된 머티리얼 설정(텍스처/프리셋) 이 있으면 적용 — 없으면 원본 + 정점색 보정
        const mat = config ? buildMat(config) : null;
        builtMatRef.current = mat;
        m.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mat) {
            mesh.material = mat;
          } else {
            // 정점 색 모델(Quaternius 등) 검게 나오지 않게 vertexColors 켜기
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(mt => {
              const sm = mt as THREE.MeshStandardMaterial;
              if (sm && mesh.geometry?.getAttribute?.('color') && !sm.vertexColors) {
                sm.vertexColors = true;
                sm.needsUpdate = true;
              }
            });
          }
        });
        setObj(m);
      }).catch(() => { /* 로드 실패 시 빈 화면 */ }),
    );
    return () => {
      cancelled = true;
      if (builtMatRef.current) { disposeMat(builtMatRef.current); builtMatRef.current = null; }
    };
    // config 는 url 당 보통 고정 — 의존성에 넣어 변경 시 재적용
  }, [url, config]);

  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.8; });

  if (!obj) return null;
  return <group ref={ref}><primitive object={obj} /></group>;
}

export default function ModelThumbViewer({ url, config }: { url: string; config?: MaterialConfig | null }) {
  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
      <Canvas camera={{ position: [1.4, 1.0, 1.6], fov: 42 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[5, 10, 5]} intensity={1.4} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Spinning url={url} config={config} />
      </Canvas>
    </div>
  );
}
