// 숲 몽환 앰비언트 BGM 생성기 — 의존성 없음. 절차적 합성 → 이음새 없는 루프 WAV.
// 구성: 패드 드론(코러스) + 공기감 시머(트레몰로) + 펜타토닉 벨(에코) + 바람(스테레오 노이즈).
// 실행: node scripts/gen-forest-dream.mjs  →  public/sounds/forest-dream.wav
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const L  = 30;            // 루프 길이(초)
const CF = 3;             // 패드/바람 크로스페이드 길이(초)
const N  = L * SR;        // 루프 샘플 수
const NT = (L + CF) * SR; // 패드/바람 렌더 길이(폴드용)
const TAU = Math.PI * 2;

// 시드 RNG — 재현 가능하게.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0xA17EE);

// 음정(Hz)
const A1 = 55, A2 = 110, E3 = 164.814, A3 = 220, E4 = 329.628;
const PENTA = [440, 493.883, 554.365, 659.255, 739.989, 880]; // A 메이저 펜타토닉(고음역)

// 패드/바람 — 연속 텍스처(길이 NT 렌더 후 크로스페이드 폴드)
const padL = new Float32Array(NT), padR = new Float32Array(NT);
const winL = new Float32Array(NT), winR = new Float32Array(NT);

// 부드러운 한쪽-극 로우패스 상태(바람)
let lpL = 0, lpR = 0, lp2L = 0, lp2R = 0;

// 패드 보이스: 기음 + 약한 배음, 살짝 디튠 2겹으로 코러스 폭.
function padVoice(t, f, detune) {
  const a = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.1 * Math.sin(TAU * 3 * f * t);
  const b = Math.sin(TAU * f * (1 + detune) * t) + 0.25 * Math.sin(TAU * 2 * f * (1 + detune) * t);
  return a * 0.6 + b * 0.4;
}

for (let i = 0; i < NT; i++) {
  const t = i / SR;
  // 숨쉬는 듯한 느린 진폭 LFO
  const breath = 0.72 + 0.28 * Math.sin(TAU * t / 11);
  // 드론: 루트 + 5도 + 옥타브 + 옥타브5도(약하게)
  let pl = 0, pr = 0;
  pl += padVoice(t, A2, 0.004) * 0.50;
  pr += padVoice(t, A2, -0.004) * 0.50;
  pl += padVoice(t, E3, -0.005) * 0.34;
  pr += padVoice(t, E3, 0.005) * 0.34;
  pl += padVoice(t, A3, 0.006) * 0.26;
  pr += padVoice(t, A3, -0.006) * 0.26;
  pl += padVoice(t, E4, 0.007) * 0.14;
  pr += padVoice(t, E4, -0.007) * 0.16;
  // 깊이감용 초저역(아주 약하게)
  const sub = Math.sin(TAU * A1 * t) * 0.10;
  pl += sub; pr += sub;
  // 공기감 시머 — 고음 사인 2개, 트레몰로 + 좌우 흔들림(몽환)
  const trem = 0.5 + 0.5 * Math.sin(TAU * t / 7);
  const pan = 0.5 + 0.5 * Math.sin(TAU * t / 9);
  const sh = (Math.sin(TAU * 880 * t) * 0.6 + Math.sin(TAU * 1318.51 * t) * 0.4) * 0.05 * trem;
  pl += sh * (1 - pan * 0.6);
  pr += sh * (0.4 + pan * 0.6);

  padL[i] = pl * breath;
  padR[i] = pr * breath;

  // 바람 — 스테레오 비상관 노이즈, 2단 로우패스, 느린 스웰
  const swell = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(TAU * t / 13 + 1.3));
  const wnL = rnd() * 2 - 1, wnR = rnd() * 2 - 1;
  lpL += 0.045 * (wnL - lpL); lp2L += 0.08 * (lpL - lp2L);
  lpR += 0.045 * (wnR - lpR); lp2R += 0.08 * (lpR - lp2R);
  winL[i] = (lpL - lp2L) * swell * 0.9; // 살짝 밴드패스 → 쉭 소리
  winR[i] = (lpR - lp2R) * swell * 0.9;
}

// 벨 — 펜타토닉, 모듈로 wrap 으로 완벽 루프. 에코 2개(반대 팬).
const belL = new Float32Array(N), belR = new Float32Array(N);
function addBell(startSec, f, vel, pan) {
  const tau = 1.7 + rnd() * 0.8;     // 감쇠
  const dur = Math.min(L, tau * 4.5);
  const n = Math.floor(dur * SR);
  const lg = 0.5 - pan * 0.5, rg = 0.5 + pan * 0.5;
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    const env = (1 - Math.exp(-tt / 0.004)) * Math.exp(-tt / tau); // 빠른 어택, 지수 감쇠
    let w = Math.sin(TAU * f * tt);
    w += 0.5 * Math.sin(TAU * 2 * f * tt) * Math.exp(-tt / 0.6);    // 온셋 밝기
    w += 0.22 * Math.sin(TAU * 3 * f * tt) * Math.exp(-tt / 0.3);
    w += 0.15 * Math.sin(TAU * 2.01 * f * tt);                     // 유리알 같은 비배음
    const s = w * env * vel;
    const idx = (Math.floor(startSec * SR) + k) % N;               // wrap → 루프 이음새 없음
    belL[idx] += s * lg;
    belR[idx] += s * rg;
  }
}
// 스케줄: 2.4~4.8초 간격, 매번 펜타토닉 랜덤 + 에코 2개.
for (let s = rnd() * 2; s < L; s += 2.4 + rnd() * 2.4) {
  const f = PENTA[Math.floor(rnd() * PENTA.length)];
  const pan = rnd() * 1.6 - 0.8;
  const vel = 0.45 + rnd() * 0.4;
  addBell(s, f, vel, pan);
  addBell(s + 0.34, f, vel * 0.5, -pan);   // 에코1
  addBell(s + 0.66, f, vel * 0.26, pan);   // 에코2
}

// 패드/바람 크로스페이드 폴드(길이 NT → N), 벨 합성, 마스터.
const out = new Float32Array(N * 2);
let peak = 0;
const cfN = CF * SR;
for (let i = 0; i < N; i++) {
  let pL = padL[i] + winL[i];
  let pR = padR[i] + winR[i];
  if (i < cfN) {
    // equal-power 크로스페이드: 시작부에 끝부(연속분)를 섞어 이음새 제거
    const tnorm = i / cfN;
    const fin = Math.sin(tnorm * Math.PI / 2), fout = Math.cos(tnorm * Math.PI / 2);
    pL = pL * fin + (padL[i + N] + winL[i + N]) * fout;
    pR = pR * fin + (padR[i + N] + winR[i + N]) * fout;
  }
  let l = pL * 0.42 + belL[i];
  let r = pR * 0.42 + belR[i];
  // 소프트 클립(부드러운 한계)
  l = Math.tanh(l * 0.9);
  r = Math.tanh(r * 0.9);
  out[i * 2] = l; out[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
// 정규화 → -1.2dB
const norm = 0.87 / (peak || 1);

// WAV(16-bit PCM 스테레오) 작성
const bytesPerSample = 2, channels = 2;
const dataLen = N * channels * bytesPerSample;
const buf = Buffer.alloc(44 + dataLen);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * channels * bytesPerSample, 28);
buf.writeUInt16LE(channels * bytesPerSample, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
for (let i = 0; i < N * channels; i++) {
  let v = out[i] * norm;
  v = Math.max(-1, Math.min(1, v));
  buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'sounds');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'forest-dream.wav');
writeFileSync(outPath, buf);
console.log(`✅ ${outPath}  (${(buf.length / 1048576).toFixed(2)} MB, ${L}s loop, ${SR}Hz stereo)`);
