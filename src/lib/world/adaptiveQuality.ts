'use client';
/**
 * 적응형 품질 — 측정 FPS 에 따라 폴리지 LOD 거리·그림자 갱신율을 자동 조절해 오픈월드 프레임을 안정화.
 *
 * 빽빽한 꽃밭 등 무거운 장면에 들어가면 foliageScale 이 내려가 "원본(풀디테일) 유지 거리"를 줄이고
 * (그 너머는 빌보드라 거의 공짜) → 삼각형↓ → FPS 회복. 여유가 생기면 천천히 다시 올려 디테일 복원.
 * heavy 플래그는 그림자 갱신율을 낮추는 데 쓰인다(그림자 패스가 지오메트리를 또 그려 비쌈).
 *
 * 단일 드라이버(updateAdaptive)가 매 프레임 1회 갱신하고, 폴리지/그림자가 값을 읽기만 한다.
 */
export const AQ = {
  /** 이 FPS 아래로 잘 안 떨어지게 — 폴리지 디테일을 깎아 회복시킨다. */
  targetFps: 60,
  /** 평활화된 현재 FPS. */
  fps: 60,
  /** 0.3~1 — 폴리지 원본(풀디테일) 거리에 곱하는 배수. 버거우면 ↓. */
  foliageScale: 1,
  /** 버거운 상태 — 그림자 갱신율↓ 등에 사용. */
  heavy: false,
};

let _smoothMs = 16.7;   // 평활화된 프레임 시간(ms)
let _adjAcc = 0;        // 조정 주기 누적
let _elapsed = 0;       // 마운트 후 경과(초) — 초기 로드 스파이크 무시용

/** 매 프레임 1회 호출(dt 초). 단일 드라이버에서만 호출할 것. */
export function updateAdaptive(dt: number): void {
  const ms = Math.min(dt, 0.1) * 1000;
  _smoothMs += (ms - _smoothMs) * 0.08;        // EMA 평활(스파이크에 둔감)
  AQ.fps = 1000 / _smoothMs;
  _elapsed += dt;
  if (_elapsed < 3) return;                     // 초기 3초(로드 스파이크) 동안 조정 안 함
  _adjAcc += dt;
  if (_adjAcc < 0.25) return;                   // 초당 4회만 조정 — 오실레이션 방지
  _adjAcc = 0;
  const t = AQ.targetFps;
  if (AQ.fps < t)            AQ.foliageScale = Math.max(0.3, AQ.foliageScale - 0.08);  // 버거우면 빠르게 깎음
  else if (AQ.fps > t + 25)  AQ.foliageScale = Math.min(1, AQ.foliageScale + 0.04);    // 여유 충분할 때만 천천히 복원
  // (t ~ t+25 데드존: 이 구간에선 유지 → 깎였다 늘었다 진동 방지)
  AQ.heavy = AQ.fps < t - 2;
}
