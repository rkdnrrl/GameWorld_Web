'use client';
/* ── 최대 FPS 캡 ──
 * fps>0 일 때 Canvas frameloop='never' 로 두고 여기서 직접 렌더를 구동(상한 적용).
 * R3F v9 never 모드는 advance(timestamp) 의 timestamp 를 '초'로 해석하므로 t/1000 을 넘긴다.
 * XR 세션 중에는 마운트되지 않게(호출부에서 제외) — 헤드셋이 자체 주사율로 구동.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function FpsLimiter({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (!fps || fps <= 0) return;
    const interval = 1000 / fps;
    let raf = 0;
    let prevMs = 0;                     // 직전 rAF 시각(ms)
    let acc = 0;                        // 누적 경과(ms) — interval 넘으면 1회 렌더
    let started = false;
    // never 모드는 advance(t) 의 t 를 clock.elapsedTime(초)로 그대로 대입한다.
    // 현재 elapsedTime 에서 이어가며 '실제 경과'만 더해 → dt 정확 + 시간 연속(켤 때 점프 없음).
    let simSec = clock.elapsedTime;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!started) { started = true; prevMs = now; return; }
      acc += now - prevMs; prevMs = now;
      if (acc < interval) return;
      simSec += acc / 1000;            // 실제 경과(초)만큼 진행 (delta = acc/1000)
      acc = 0;
      advance(simSec);
    };
    raf = requestAnimationFrame(loop);
    // 해제(캡 끄기/XR 진입) 시: always 모드의 THREE.Clock.getDelta 가 oldTime(ms 기준)을 쓰므로
    // 복구해 첫 프레임 dt 폭주를 막는다(never 모드가 oldTime 을 초 단위로 덮어썼기 때문).
    return () => {
      cancelAnimationFrame(raf);
      clock.oldTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    };
  }, [fps, advance, clock]);
  return null;
}
