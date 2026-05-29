'use client';
/**
 * 모델 카드용 라이브 3D 뷰어 — 화면에 보이는 카드에만 마운트(스크롤로 벗어나면 언마운트).
 *  화면에 한 번에 보이는 카드 수만큼만 WebGL 컨텍스트를 쓰므로(보통 ~10개) 안전.
 *  FBX/GLB/OBJ 를 1 단위로 정규화·중앙정렬 후 자동 회전. pointer-events:none 이라
 *  클릭은 카드(편집/미리보기)로 그대로 전달됨.
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
        // 정점 색 모델(Quaternius 등) 검게 나오지 않게 vertexColors 켜기
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

  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.8; });

  if (!obj) return null;
  return <group ref={ref}><primitive object={obj} /></group>;
}

export default function ModelThumbViewer({ url }: { url: string }) {
  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
      <Canvas camera={{ position: [1.4, 1.0, 1.6], fov: 42 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
        <ambientLight intensity={0.95} />
        <directionalLight position={[3, 5, 2]} intensity={1.05} />
        <Spinning url={url} />
      </Canvas>
    </div>
  );
}
