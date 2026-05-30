'use client';
/**
 * 인터랙티브 3D 뷰어 — 드래그 회전 / 휠·핀치 확대 / 터치 지원(OrbitControls).
 * 마켓 상세 모달 등에서 단일 모달로만 띄우므로 WebGL 컨텍스트 한계와 무관.
 * 모든 포맷(FBX/GLB/OBJ/DAE)을 loadStaticModel 로 로드하고, 썸네일과 동일한 텍스처 보정 적용.
 */
import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { loadStaticModel } from '@/lib/world/modelLoader';

function disposeModel(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => (mt as THREE.Material)?.dispose?.());
  });
}

// 썸네일(modelThumb)과 동일한 보정 — FBX colormap sRGB, 어두운 베이스→흰색, 정점색
function fixMaterials(model: THREE.Object3D) {
  model.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const hasVColor = !!mesh.geometry?.getAttribute?.('color');
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(mt => {
      const sm = mt as THREE.MeshStandardMaterial & { emissiveMap?: THREE.Texture | null };
      if (!sm) return;
      if (sm.map) sm.map.colorSpace = THREE.SRGBColorSpace;
      if (sm.emissiveMap) sm.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      if (sm.map && sm.color && sm.color.getHex() < 0x202020) sm.color.set('#ffffff');
      if (hasVColor && !sm.vertexColors) {
        sm.vertexColors = true;
        if (!sm.map && sm.color) sm.color.set('#ffffff');
      }
      sm.needsUpdate = true;
    });
  });
}

function Model({ url }: { url: string }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    let current: THREE.Object3D | null = null;
    setObj(null);
    loadStaticModel(url).then(model => {
      if (cancelled) { disposeModel(model); return; }
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const h = Math.max(size.x, size.y, size.z) || 1;
      const s = 2 / h;
      model.scale.setScalar(s);
      model.position.set(-center.x * s, -center.y * s, -center.z * s);
      fixMaterials(model);
      current = model;
      setObj(model);
    }).catch(() => {});
    return () => { cancelled = true; if (current) disposeModel(current); };
  }, [url]);
  if (!obj) return null;
  return <primitive object={obj} />;
}

// 환경광(IBL) — 금속/PBR 모델이 검게 안 나오게. RoomEnvironment(네트워크 X).
function IBL() {
  const { scene, gl } = useThree();
  useEffect(() => {
    let active = true;
    let env: THREE.Texture | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
      if (!active) return;
      pmrem = new THREE.PMREMGenerator(gl);
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;
    });
    return () => {
      active = false;
      if (scene.environment === env) scene.environment = null;
      env?.dispose();
      pmrem?.dispose();
    };
  }, [scene, gl]);
  return null;
}

export default function Asset3DViewer({ url }: { url: string }) {
  return (
    <Canvas camera={{ position: [0, 0.6, 3.2], fov: 45 }} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.4} />
      <IBL />
      <Suspense fallback={null}>
        <Model url={url} />
      </Suspense>
      <OrbitControls makeDefault enableDamping enablePan={false} minDistance={1.2} maxDistance={10} />
    </Canvas>
  );
}
