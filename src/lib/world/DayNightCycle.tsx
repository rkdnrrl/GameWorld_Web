'use client';
/**
 * 낮/밤 사이클 — dayNight 컴포넌트 인스턴스 정보를 받아
 *  - 해(낮) / 달(밤) DirectionalLight 자동 배치 + 색·세기
 *  - AmbientLight 색·세기
 *  - scene.background 색 (옵션) — HDRI texture 면 건드리지 않음
 * 멀티 동기화: 각 클라가 자체 clock 으로 진행 (시각 효과라 가벼운 차이 무시).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getProp, type ComponentInstance } from '@/lib/world/components';

const DAY_SKY    = new THREE.Color('#87ceeb');
const DUSK_SKY   = new THREE.Color('#ff7733');
const NIGHT_SKY  = new THREE.Color('#0a1024');
const DAY_AMB    = new THREE.Color('#ffffff');
const DUSK_AMB   = new THREE.Color('#ffaa55');
const NIGHT_AMB  = new THREE.Color('#445588');
const SUN_DAY    = new THREE.Color('#fff7e0');
const SUN_DUSK   = new THREE.Color('#ff7733');
const MOON       = new THREE.Color('#aabbff');

export default function DayNightCycle({ inst }: { inst: ComponentInstance | null }) {
  const enabled        = !!getProp(inst!, 'enabled', true);
  const cycleMinutes   = Math.max(0.1, Number(getProp(inst!, 'cycleMinutes', 10)));
  const startTime      = (((Number(getProp(inst!, 'startTime', 8)) % 24) + 24) % 24);
  const sunIntensity   = Number(getProp(inst!, 'sunIntensity', 1.5));
  const moonIntensity  = Number(getProp(inst!, 'moonIntensity', 0.3));
  const changeSky      = !!getProp(inst!, 'changeSky', true);

  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const originalBg = useRef<THREE.Color | THREE.Texture | null>(null);
  const ourBg = useRef<THREE.Color | null>(null);

  // 마운트 시 원래 배경 저장, 언마운트 시 복원 (changeSky 인 경우만)
  useEffect(() => {
    originalBg.current = scene.background as THREE.Color | THREE.Texture | null;
    return () => {
      if (changeSky) scene.background = originalBg.current;
    };
  }, [scene, changeSky]);

  const tmp = useRef(new THREE.Color());

  useFrame((state) => {
    if (!inst || !enabled || !sunRef.current || !ambRef.current) return;

    const cycleSec = cycleMinutes * 60;
    const elapsedHours = (state.clock.elapsedTime / cycleSec) * 24;
    const t = (startTime + elapsedHours) % 24; // 0~24

    // 해 각도: 6시=동쪽 수평, 12시=정오 (위), 18시=서쪽 수평, 0시=지하 (반대편)
    const ang = ((t - 6) / 24) * Math.PI * 2;
    const sy = Math.sin(ang);  // -1(자정) ~ +1(정오)
    const sx = Math.cos(ang);
    sunRef.current.position.set(sx * 50, sy * 50, 30);

    const dayFactor = Math.max(0, sy);
    // 노을 강도: 6시/18시 근처에서 1
    const dawn = Math.max(0, 1 - Math.abs(t - 6)  / 2);
    const dusk = Math.max(0, 1 - Math.abs(t - 18) / 2);
    const sunset = Math.max(dawn, dusk);

    // 해/달 — 지평선 위면 해, 아래면 달
    if (sy > -0.1) {
      sunRef.current.intensity = Math.max(0, sy + 0.1) / 1.1 * sunIntensity;
      tmp.current.copy(SUN_DAY).lerp(SUN_DUSK, sunset);
      sunRef.current.color.copy(tmp.current);
    } else {
      sunRef.current.intensity = moonIntensity;
      sunRef.current.color.copy(MOON);
    }

    // ambient — 시간에 따라 색·세기
    ambRef.current.intensity = 0.25 + dayFactor * 0.55;
    if (dayFactor > 0.05) tmp.current.copy(DAY_AMB).lerp(DUSK_AMB, sunset);
    else                   tmp.current.copy(NIGHT_AMB);
    ambRef.current.color.copy(tmp.current);

    // 하늘색 — HDRI 텍스처면 건드리지 않음 (Color 일 때만)
    if (changeSky) {
      // 대상 색 계산
      const target = tmp.current;
      if (dayFactor > 0.05) {
        target.copy(DAY_SKY).lerp(DUSK_SKY, sunset);
      } else if (sy > -0.3) {
        target.copy(DUSK_SKY).lerp(NIGHT_SKY, Math.min(1, -sy * 3.3));
      } else {
        target.copy(NIGHT_SKY);
      }
      // 우리가 이미 만들어둔 우리 배경 Color 가 있으면 in-place 갱신
      const bg = scene.background;
      if (bg && (bg as THREE.Color).isColor) {
        (bg as THREE.Color).copy(target);
      } else if (!(bg && (bg as THREE.Texture).isTexture)) {
        // 배경이 없거나 다른 Color 객체면 우리 인스턴스로 교체
        if (!ourBg.current) ourBg.current = new THREE.Color();
        ourBg.current.copy(target);
        scene.background = ourBg.current;
      }
      // HDRI texture 면 건드리지 않음
    }
  });

  return (
    <>
      <directionalLight ref={sunRef} intensity={0} />
      <ambientLight ref={ambRef} intensity={0.3} />
    </>
  );
}
