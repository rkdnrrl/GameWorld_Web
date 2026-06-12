'use client';
/**
 * 월드 효과음 구동기 — 절차적 SFX 엔진(sfx.ts)의 진입점.
 *  1) 첫 사용자 제스처 후 AudioContext resume (브라우저 자동재생 정책)
 *  2) 설정의 효과음 볼륨을 엔진 마스터에 주입
 *  3) 매 프레임 globalWind 강도를 읽어 지속 바람 소리 레벨 갱신
 *
 * 발소리(FootstepDust)·물 첨벙(WaterRipples)은 각자 디딤/입수 순간에 직접 sfx 를 호출한다.
 * 이 컴포넌트는 그 외 '지속음(바람)' + 마스터 볼륨·언락만 담당.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { G } from '@/lib/world/globalWind';
import { resumeSfx, setSfxVolume, sfxWind } from '@/lib/world/sfx';

export function WorldAudio({ volume }: { volume: number }) {
  // 볼륨 설정 → 엔진 주입
  useEffect(() => { setSfxVolume(volume); }, [volume]);

  // 언마운트(월드 이탈) 시 지속 바람 소리 내림 (공유 컨텍스트에 남지 않게)
  useEffect(() => () => { sfxWind(0); }, []);

  // 첫 제스처 후 컨텍스트 resume
  useEffect(() => {
    const unlock = () => resumeSfx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // 매 프레임 바람 레벨 갱신 (sfxWind 내부에서 setTargetAtTime 으로 부드럽게 추종)
  const tick = useRef(0);
  useFrame(() => {
    if ((tick.current++ & 3) !== 0) return;   // 4프레임마다 — 어차피 엔진이 0.4s 로 스무딩
    const lv = G.active > 0 ? Math.min(1, G.uWindStr.value / 2.5) : 0;
    sfxWind(lv);
  });

  return null;
}
