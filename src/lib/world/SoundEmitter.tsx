'use client';
/**
 * Sound 오브젝트 (kind === 'sound') 런타임 재생.
 *
 * 자동 재생 (autoplay 일 때) — 첫 사용자 제스처 후 (브라우저 자동재생 정책)
 * 거리 감쇠 — radius>0 면 카메라 거리 따라 볼륨 감쇠. radius=0 = 전역(거리 무관)
 * loop — true 면 반복
 *
 * 권위 모델: 각 클라가 자기 카메라 거리로 자기 볼륨 계산. 호스트 동기화 X (단순화).
 */
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  url: string;
  position: [number, number, number];
  volume: number;
  loop: boolean;
  autoplay: boolean;
  radius: number;       // 0 = 전역, >0 = 거리 감쇠
}

export function SoundEmitter({ url, position, volume, loop, autoplay, radius }: Props) {
  const { camera } = useThree();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tmpRef = useRef(new THREE.Vector3());

  // url 변경 시 새 Audio
  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    a.loop = loop;
    a.volume = 0;     // 첫 프레임에 거리 계산해 set
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    audioRef.current = a;
    if (autoplay) {
      a.play().catch(() => {
        // 자동재생 정책 — 첫 사용자 제스처 후 재시도
        const retry = () => { a.play().catch(() => {}); window.removeEventListener('pointerdown', retry); };
        window.addEventListener('pointerdown', retry);
      });
    }
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.load();
      audioRef.current = null;
    };
  }, [url, loop, autoplay]);

  // 매 프레임 카메라 거리 → 볼륨
  useFrame(() => {
    const a = audioRef.current;
    if (!a) return;
    if (radius <= 0) {
      a.volume = Math.max(0, Math.min(1, volume));
      return;
    }
    tmpRef.current.set(position[0], position[1], position[2]);
    const d = tmpRef.current.distanceTo(camera.position);
    if (d >= radius) { a.volume = 0; return; }
    // 선형 감쇠 (1 가까이 → 0 멀리)
    const t = 1 - (d / radius);
    a.volume = Math.max(0, Math.min(1, volume * t));
  });

  return null;
}
