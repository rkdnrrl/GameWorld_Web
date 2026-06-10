'use client';
/**
 * 표지판 / 월드 공간 텍스트 — sign 컴포넌트 인스턴스 정보로 drei <Text> 렌더.
 * - billboard=true 면 항상 카메라 향함 (drei Billboard)
 * - viewDistance 밖이면 group.visible=false 로 자동 숨김 (성능)
 * - 배경 박스(plane mesh) 는 bgOpacity>0 일 때만 — maxWidth 폭, fontSize 비례 높이
 * - troika SDF 텍스트라 줌인해도 깨끗
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { getProp, type ComponentInstance } from '@/lib/world/components';

export default function SignText({ inst }: { inst: ComponentInstance }) {
  const text         = String(getProp(inst, 'text', '안녕하세요!'));
  const color        = String(getProp(inst, 'color', '#ffffff'));
  const fontSize     = Math.max(0.05, Number(getProp(inst, 'fontSize', 0.4)));
  const maxWidth     = Math.max(0.5,  Number(getProp(inst, 'maxWidth', 6)));
  const bgColor      = String(getProp(inst, 'bgColor', '#000000'));
  const bgOpacity    = Math.max(0, Math.min(1, Number(getProp(inst, 'bgOpacity', 0.5))));
  const outlineWidth = Math.max(0, Number(getProp(inst, 'outlineWidth', 0.02)));
  const outlineColor = String(getProp(inst, 'outlineColor', '#000000'));
  const billboard    = !!getProp(inst, 'billboard', true);
  const viewDistance = Math.max(1, Number(getProp(inst, 'viewDistance', 30)));

  const groupRef = useRef<THREE.Group>(null);
  const tmpPos = useRef(new THREE.Vector3());
  const cullDist2 = viewDistance * viewDistance;

  // 거리 cull — 매 frame 카메라 거리 비교
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    g.getWorldPosition(tmpPos.current);
    const d2 = tmpPos.current.distanceToSquared(state.camera.position);
    g.visible = d2 <= cullDist2;
  });

  // 배경 박스 크기: maxWidth × (줄 수 × fontSize × 1.3) + padding
  const bgDims = useMemo(() => {
    const lines = (text.match(/\n/g)?.length ?? 0) + 1;
    const pad = fontSize * 0.5;
    return { w: maxWidth + pad * 2, h: lines * fontSize * 1.3 + pad * 2 };
  }, [text, maxWidth, fontSize]);

  const inner = (
    <>
      {bgOpacity > 0 && (
        <mesh position={[0, 0, -0.005]} renderOrder={-1}>
          <planeGeometry args={[bgDims.w, bgDims.h]} />
          <meshBasicMaterial color={bgColor} transparent opacity={bgOpacity} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Text
        fontSize={fontSize}
        maxWidth={maxWidth}
        color={color}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        outlineWidth={outlineWidth}
        outlineColor={outlineColor}
      >
        {text}
      </Text>
    </>
  );

  return (
    <group ref={groupRef} raycast={() => null}>
      {billboard ? <Billboard>{inner}</Billboard> : inner}
    </group>
  );
}
