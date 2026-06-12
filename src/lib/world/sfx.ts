'use client';
/**
 * 절차적 효과음 엔진 (WebAudio) — 오디오 에셋 파일 없이 런타임 합성.
 *
 * 발소리/물 첨벙/바람을 화이트노이즈 + 필터 + 엔벨로프로 그때그때 만든다.
 * 코드베이스의 자체완결 FX 패턴(FootstepDust/WaterRipples/BreathFog)과 동일하게
 * 외부 신호(발 디딤 순간·입수 감지·globalWind)에서 호출만 받는다.
 *
 * 멀티 동기화 없음 — 각 클라가 자기 카메라 기준 거리 볼륨으로 로컬 재생(발소리 특성).
 * 자동재생 정책: AudioContext 는 첫 사용자 제스처 후 resume() (WorldAudio 가 호출).
 */

let _ctx: AudioContext | null = null;
let _master: GainNode | null = null;
let _noise: AudioBuffer | null = null;     // 공유 화이트노이즈 버퍼 (1초)
let _enabled = true;
let _volume = 0.7;                         // 마스터 볼륨 0~1 (설정에서 주입)

// 바람 전용 지속 체인 (lazy)
let _windSrc: AudioBufferSourceNode | null = null;
let _windGain: GainNode | null = null;
let _windFilter: BiquadFilterNode | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  _master = _ctx.createGain();
  _master.gain.value = _volume;
  _master.connect(_ctx.destination);
  return _ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (_noise) return _noise;
  const len = Math.floor(c.sampleRate * 1.0);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  // 결정론적 LCG (Math.random 회피 — 어차피 노이즈라 시드 무관)
  let s = 1234567;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x3fffffff) - 1;        // -1..1
  }
  _noise = buf;
  return buf;
}

/** 첫 제스처 후 호출 — suspended 상태 해제. */
export function resumeSfx(): void {
  const c = ctx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setSfxVolume(v: number): void {
  _volume = Math.max(0, Math.min(1, v));
  _enabled = _volume > 0;
  if (_master) _master.gain.value = _volume;
}

/** 재생 가능 상태인지(켜짐 + 컨텍스트 동작 중) */
function live(): AudioContext | null {
  if (!_enabled) return null;
  const c = _ctx;                          // resume 전 새 컨텍스트를 만들지 않음
  if (!c || c.state !== 'running') return null;
  return c;
}

/** 짧은 노이즈 버스트(원샷) 공통 헬퍼. */
function burst(c: AudioContext, opts: {
  gain: number; attack: number; decay: number;
  filterType: BiquadFilterType; freqStart: number; freqEnd?: number; q?: number;
  rate?: number;
}): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.playbackRate.value = opts.rate ?? 1;
  const filt = c.createBiquadFilter();
  filt.type = opts.filterType;
  filt.frequency.value = opts.freqStart;
  if (opts.q != null) filt.Q.value = opts.q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + opts.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);
  if (opts.freqEnd != null) {
    filt.frequency.setValueAtTime(opts.freqStart, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), t + opts.attack + opts.decay);
  }
  src.connect(filt); filt.connect(g); g.connect(_master!);
  src.start(t);
  src.stop(t + opts.attack + opts.decay + 0.05);
}

/** 발소리 한 걸음 — 낮은 thud + 약한 scuff. volume 은 거리감쇠(0~1), running 이면 약간 더 또렷. */
export function sfxStep({ volume = 1, running = false }: { volume?: number; running?: boolean } = {}): void {
  const c = live();
  if (!c || volume <= 0.01) return;
  const v = Math.min(1, volume);
  // 걸음마다 미세한 피치 변화 (currentTime 기반 의사난수)
  const jitter = ((c.currentTime * 53.13) % 1) * 0.2 - 0.1;   // -0.1..0.1
  const base = (running ? 0.22 : 0.16) * v;
  // 저역 thud
  burst(c, { gain: base, attack: 0.004, decay: running ? 0.085 : 0.11, filterType: 'lowpass', freqStart: 520 + jitter * 200, q: 0.7, rate: 1 + jitter });
  // 고역 scuff (살짝)
  burst(c, { gain: base * 0.35, attack: 0.002, decay: 0.05, filterType: 'highpass', freqStart: 2600, q: 0.5, rate: 1 + jitter * 0.5 });
}

/** 물 첨벙 — 노이즈 burst + 밴드패스 하강 스윕. big=입수, 작게=이동 물보라. */
export function sfxSplash({ volume = 1, big = false }: { volume?: number; big?: boolean } = {}): void {
  const c = live();
  if (!c || volume <= 0.01) return;
  const v = Math.min(1, volume);
  const g = (big ? 0.4 : 0.16) * v;
  burst(c, { gain: g, attack: 0.005, decay: big ? 0.45 : 0.22, filterType: 'bandpass', freqStart: big ? 1400 : 1800, freqEnd: big ? 320 : 600, q: 0.8 });
  // 입수는 저역 "plonk" 한 겹 추가
  if (big) burst(c, { gain: g * 0.6, attack: 0.004, decay: 0.3, filterType: 'lowpass', freqStart: 700, freqEnd: 200, q: 1 });
}

/** 지속 바람 소리 레벨 0~1 설정 (0이면 무음·정지). lazy 로 노이즈 루프 체인 구성. */
export function sfxWind(level: number): void {
  const c = live();
  if (!c) return;
  const lv = Math.max(0, Math.min(1, level));
  if (!_windSrc) {
    if (lv <= 0.001) return;               // 바람 없으면 굳이 체인 안 만듦
    _windSrc = c.createBufferSource();
    _windSrc.buffer = noiseBuffer(c);
    _windSrc.loop = true;
    _windFilter = c.createBiquadFilter();
    _windFilter.type = 'lowpass';
    _windFilter.frequency.value = 480;
    _windFilter.Q.value = 0.6;
    _windGain = c.createGain();
    _windGain.gain.value = 0;
    _windSrc.connect(_windFilter); _windFilter.connect(_windGain); _windGain.connect(_master!);
    _windSrc.start();
  }
  if (_windGain) {
    // 부드럽게 추종 (돌풍감) — 최대 ~0.14
    _windGain.gain.setTargetAtTime(lv * 0.14, c.currentTime, 0.4);
  }
  if (_windFilter) {
    // 셀수록 밝게(고역 통과 ↑)
    _windFilter.frequency.setTargetAtTime(380 + lv * 700, c.currentTime, 0.5);
  }
}
