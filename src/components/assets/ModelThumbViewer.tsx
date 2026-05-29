'use client';
/**
 * 모델 썸네일용 경량 3D 뷰어 — 카드 호버 시에만 마운트(한 번에 하나).
 *  FBX/GLB/OBJ 를 로드해 1 단위로 정규화·중앙정렬 후 자동 회전.
 *  pointer-events:none 이라 클릭은 카드(편집/미리보기)로 그대로 전달됨.
 *  many-canvas WebGL 컨텍스트 폭발을 피하려 그리드에 상시 렌더하지 않고 호버 전용.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Spinning({ url }: { url: string }) {
  const ref = useRef<THREE.Group>(null);
  const [obj, setObj] = useState<THREE.Object3D | null>(null);

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
        // 정점 색 모델(Quaternius 등) 이 검게 나오지 않도록 vertexColors 켜기
        m.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach(mt => {
            const sm = mt as THREE.MeshStandardMaterial;
            if (sm && mesh.geometry?.getAttribute?.('color') && !sm.vertexColors) {
              sm.vertexColors = true;
              sm.needsUpdate = true;
            }
          });
        });
        setObj(m);
      }).catch(() => { /* 로드 실패 시 빈 화면 */ }),
    );
    return () => { cancelled = true; };
  }, [url]);

  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.9; });

  if (!obj) return null;
  return <group ref={ref}><primitive object={obj} /></group>;
}

export default function ModelThumbViewer({ url }: { url: string }) {
  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
      <Canvas camera={{ position: [1.5, 1.1, 1.5], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
        <ambientLight intensity={0.95} />
        <directionalLight position={[3, 5, 2]} intensity={1.0} />
        <Spinning url={url} />
      </Canvas>
    </div>
  );
}
