// 숲 환경음(자연 앰비언트) 생성기 — 의존성 없음. 절차적 합성 → 이음새 없는 루프 WAV.
// 구성: 바람+나뭇잎 사각임(거스트 연동) + 새소리(여러 패턴, 거리감) + 풀벌레 배경.
// 실행: node scripts/gen-forest-ambience.mjs  →  public/sounds/forest-ambience.wav
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const L  = 30;            // 루프 길이(초)
const CF = 3;             // 연속 텍스처 크로스페이드(초)
const N  = L * SR;
const NT = (L + CF) * SR;
const TAU = Math.PI * 2;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x5EED7);

// ── 연속 텍스처: 바람 + 나뭇잎 + 풀벌레 (길이 NT 렌더 후 폴드) ──
const texL = new Float32Array(NT), texR = new Float32Array(NT);
// 필터 상태
let wLpL = 0, wLpL2 = 0, wLpR = 0, wLpR2 = 0;   // 바람 로우패스(2단)
let lvHpL = 0, lvLpL = 0, lvHpR = 0, lvLpR = 0; // 나뭇잎 밴드패스
let flutL = 0, flutR = 0;                        // 잎 떨림(빠른 AM 소스)

for (let i = 0; i < NT; i++) {
  const t = i / SR;
  // 거스트(돌풍) — 여러 주기 합성으로 자연스러운 불규칙 세기
  let gust = 0.30
    + 0.30 * (0.5 + 0.5 * Math.sin(TAU * t / 6.3 + 0.7))
    + 0.22 * (0.5 + 0.5 * Math.sin(TAU * t / 9.7 + 2.1))
    + 0.18 * (0.5 + 0.5 * Math.sin(TAU * t / 3.1 + 4.0));
  gust = Math.min(1, gust);

  // 바람 — 스테레오 비상관 노이즈, 2단 로우패스(쉭~ 저역)
  const wnL = rnd() * 2 - 1, wnR = rnd() * 2 - 1;
  wLpL += 0.08 * (wnL - wLpL); wLpL2 += 0.10 * (wLpL - wLpL2);
  wLpR += 0.08 * (wnR - wLpR); wLpR2 += 0.10 * (wLpR - wLpR2);
  const windL = wLpL2 * gust * 1.1;
  const windR = wLpR2 * gust * 1.1;

  // 나뭇잎 사각임 — 고역 밴드패스 노이즈, 거스트에 더 강하게 연동 + 빠른 떨림 AM
  const lnL = rnd() * 2 - 1, lnR = rnd() * 2 - 1;
  lvLpL += 0.5 * (lnL - lvLpL); lvHpL += 0.02 * (lvLpL - lvHpL);
  lvLpR += 0.5 * (lnR - lvLpR); lvHpR += 0.02 * (lvLpR - lvHpR);
  const leafSrcL = lvLpL - lvHpL; // 밴드패스(고역 강조)
  const leafSrcR = lvLpR - lvHpR;
  // 잎 떨림 — 빠른 필터드 노이즈를 0.4~1 AM 으로
  flutL += 0.25 * ((rnd() * 2 - 1) - flutL);
  flutR += 0.25 * ((rnd() * 2 - 1) - flutR);
  const amL = 0.55 + 0.45 * Math.abs(flutL) * 2;
  const amR = 0.55 + 0.45 * Math.abs(flutR) * 2;
  const g2 = gust * gust; // 거스트 제곱 → 돌풍 때 잎이 확 살아남
  const leafL = leafSrcL * g2 * Math.min(1.4, amL) * 0.85;
  const leafR = leafSrcR * g2 * Math.min(1.4, amR) * 0.85;

  // 풀벌레 배경 — 아주 faint, 느린 스웰. 좌우 캐리어 약간 다르게(폭)
  const bugSwell = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(TAU * t / 17 + 1.0));
  const buzz = 0.5 + 0.5 * Math.sin(TAU * 62 * t);            // 지~ 하는 진동
  const bugL = Math.sin(TAU * 4600 * t) * buzz * bugSwell * 0.018;
  const bugR = Math.sin(TAU * 4675 * t) * buzz * bugSwell * 0.018;

  texL[i] = windL * 0.5 + leafL * 0.55 + bugL;
  texR[i] = windR * 0.5 + leafR * 0.55 + bugR;
}

// ── 새소리: 모듈로 wrap 으로 완벽 루프 ──
const birdL = new Float32Array(N), birdR = new Float32Array(N);
// 음 1개: f0→f1 스윕 + 비브라토 + 부드러운 엔벨로프 + 온셋 chiff.
function renderNote(startSec, f0, f1, dur, vel, pan, vibRate, vibDepth) {
  const n = Math.floor(dur * SR);
  const start = Math.floor(startSec * SR);
  const lg = (0.5 - pan * 0.5) * vel, rg = (0.5 + pan * 0.5) * vel;
  let phase = 0;
  for (let k = 0; k < n; k++) {
    const tt = k / SR, frac = k / n;
    const f = f0 + (f1 - f0) * frac;
    const vib = 1 + vibDepth * Math.sin(TAU * vibRate * tt);
    phase += TAU * f * vib / SR;
    const env = Math.pow(Math.sin(Math.PI * frac), 0.6);
    let w = Math.sin(phase) + 0.18 * Math.sin(2 * phase);
    if (tt < 0.006) w += (rnd() * 2 - 1) * 0.5; // 온셋 chiff(숨소리)
    const s = w * env;
    const idx = (start + k) % N;
    birdL[idx] += s * lg;
    birdR[idx] += s * rg;
  }
}
// 한 번의 지저귐(여러 음 패턴). far=true 면 작고 살짝 에코.
function birdEvent(start, far) {
  const type = Math.floor(rnd() * 5);
  const pan = rnd() * 1.6 - 0.8;
  const baseVel = (far ? 0.18 : 0.42) + rnd() * (far ? 0.12 : 0.35);
  const echo = (s, f0, f1, d, v, p, vr, vd) => {
    renderNote(s, f0, f1, d, v, p, vr, vd);
    if (far || rnd() < 0.4) renderNote(s + 0.16, f0, f1, d, v * 0.32, -p, vr, vd); // 거리 에코
  };
  if (type === 0) {            // tweet — 위로 스윕 2~3음
    const m = 2 + Math.floor(rnd() * 2);
    for (let j = 0; j < m; j++) echo(start + j * 0.12, 2600, 3300, 0.09, baseVel, pan, 45, 0.02);
  } else if (type === 1) {     // warble — 두 음 번갈아
    const a = 2400 + rnd() * 400, b = a + 500 + rnd() * 300;
    for (let j = 0; j < 5; j++) echo(start + j * 0.11, j % 2 ? a : b, (j % 2 ? a : b) + 150, 0.08, baseVel, pan, 38, 0.025);
  } else if (type === 2) {     // trill — 빠른 펄스
    const f = 3000 + rnd() * 600;
    for (let j = 0; j < 12; j++) echo(start + j * 0.045, f, f + 60, 0.03, baseVel * 0.9, pan, 0, 0);
  } else if (type === 3) {     // chirp-down — 아래로 스윕
    echo(start, 4200, 2200, 0.16, baseVel, pan, 30, 0.015);
  } else {                     // tee-too — 두 음
    echo(start, 3500, 3500, 0.10, baseVel, pan, 25, 0.02);
    echo(start + 0.18, 2800, 2700, 0.12, baseVel, pan, 25, 0.02);
  }
}
// 스케줄: 1.4~4.4초 간격, 일부는 멀리(far).
for (let s = rnd() * 1.5; s < L; s += 1.4 + rnd() * 3.0) {
  birdEvent(s, rnd() < 0.4);
}

// ── 폴드(크로스페이드) + 합성 + 마스터 ──
const out = new Float32Array(N * 2);
const cfN = CF * SR;
let peak = 0;
for (let i = 0; i < N; i++) {
  let tL = texL[i], tR = texR[i];
  if (i < cfN) {
    const tnorm = i / cfN;
    const fin = Math.sin(tnorm * Math.PI / 2), fout = Math.cos(tnorm * Math.PI / 2);
    tL = tL * fin + texL[i + N] * fout;
    tR = tR * fin + texR[i + N] * fout;
  }
  let l = tL + birdL[i];
  let r = tR + birdR[i];
  l = Math.tanh(l * 1.1);
  r = Math.tanh(r * 1.1);
  out[i * 2] = l; out[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = 0.87 / (peak || 1);

// WAV(16-bit PCM 스테레오)
const ch = 2, bps = 2, dataLen = N * ch * bps;
const buf = Buffer.alloc(44 + dataLen);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataLen, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * ch * bps, 28); buf.writeUInt16LE(ch * bps, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(dataLen, 40);
for (let i = 0; i < N * ch; i++) {
  let v = Math.max(-1, Math.min(1, out[i] * norm));
  buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'sounds');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'forest-ambience.wav');
writeFileSync(outPath, buf);
console.log(`✅ ${outPath}  (${(buf.length / 1048576).toFixed(2)} MB, ${L}s loop, ${SR}Hz stereo)`);
