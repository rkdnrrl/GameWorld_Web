'use client';
/**
 * 앰비언트 사운드 / BGM 재생기 — ambientSound 컴포넌트가 있는 모든 오브젝트를
 * 인스턴스(zone) 로 받아 HTMLAudioElement 풀로 재생. 매 frame 카메라 위치로 in/out
 * 판정 후 zone.fadeSec 동안 부드럽게 페이드. mode='global' 인 인스턴스는 항상 풀 볼륨.
 *
 * 멀티 동기화: 각 클라이언트가 자체 재생 — 시간/위치 동기화 불필요(BGM 특성).
 * 자동 재생 정책: 첫 유저 제스처 후에만 재생되도록 브라우저 제한 회피 (window pointerdown 1회).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AmbientSoundZone } from './components';

const FADE_DEFAULT = 1.5;

export default function AmbientSoundsPlayer({ zones }: { zones: AmbientSoundZone[] }) {
  const { camera } = useThree();
  const elsRef = useRef<Map<string, { el: HTMLAudioElement; cur: number; target: number }>>(new Map());
  const unlockedRef = useRef(false);

  // 첫 user gesture 후 자동 재생 unlock
  useEffect(() => {
    if (unlockedRef.current) return;
    const onGesture = () => {
      unlockedRef.current = true;
      for (const [, e] of elsRef.current) {
        if (e.el.paused) e.el.play().catch(() => { /* noop */ });
      }
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  // zones 변화에 따라 audio element 풀 동기화 (id 기준)
  useEffect(() => {
    const map = elsRef.current;
    const seen = new Set<string>();
    for (const z of zones) {
      seen.add(z.id);
      const prev = map.get(z.id);
      if (!prev || prev.el.src !== z.url) {
        // 새로 추가 or URL 변경 → 새 audio 만들고 기존 정리
        if (prev) { try { prev.el.pause(); prev.el.src = ''; } catch { /* noop */ } }
        const el = new Audio(z.url);
        el.crossOrigin = 'anonymous';
        el.loop = z.loop;
        el.volume = 0;       // 페이드 인 출발점
        el.preload = 'auto';
        if (unlockedRef.current) el.play().catch(() => { /* noop */ });
        map.set(z.id, { el, cur: 0, target: 0 });
      } else {
        prev.el.loop = z.loop;
      }
    }
    // 없어진 인스턴스 정리
    for (const [id, e] of map) {
      if (!seen.has(id)) { try { e.el.pause(); e.el.src = ''; } catch { /* noop */ } map.delete(id); }
    }
  }, [zones]);

  // unmount 시 정리
  useEffect(() => () => {
    for (const [, e] of elsRef.current) { try { e.el.pause(); e.el.src = ''; } catch { /* noop */ } }
    elsRef.current.clear();
  }, []);

  useFrame((_state, dt) => {
    const cam = camera.position;
    for (const z of zones) {
      const entry = elsRef.current.get(z.id);
      if (!entry) continue;
      const inside = z.mode === 'global'
        ? true
        : (Math.abs(cam.x - z.cx) <= z.hx && Math.abs(cam.y - z.cy) <= z.hy && Math.abs(cam.z - z.cz) <= z.hz);
      entry.target = inside ? z.volume : 0;
      const fade = z.fadeSec > 0 ? z.fadeSec : FADE_DEFAULT;
      const step = dt / fade;
      // 선형 페이드 (제한)
      if (entry.cur < entry.target)      entry.cur = Math.min(entry.target, entry.cur + step * z.volume);
      else if (entry.cur > entry.target) entry.cur = Math.max(entry.target, entry.cur - step * Math.max(z.volume, 0.01));
      if (Math.abs(entry.el.volume - entry.cur) > 0.005) entry.el.volume = entry.cur;
      // 완전히 0이고 페이드 끝났으면 일시정지 (CPU 절약). 들어가면 다시 play.
      if (entry.cur <= 0.001 && !entry.el.paused) { try { entry.el.pause(); } catch { /* noop */ } }
      else if (entry.cur > 0.001 && entry.el.paused && unlockedRef.current) {
        entry.el.play().catch(() => { /* noop */ });
      }
    }
  });

  return null;
}
