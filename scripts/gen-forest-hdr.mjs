// 숲 HDR 환경맵 생성기 — 의존성 없음. 절차적 합성 → Radiance .hdr(RGBE, equirectangular).
// 구성: 차가운 하늘 그라데이션 + 낮은 황금빛 태양(글로우) + 구름 + 지평선 나무 실루엣 + 숲 바닥.
// 실행: node scripts/gen-forest-hdr.mjs  →  public/hdri/forest.hdr
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 2048, H = 1024;           // equirect 2:1
const PI = Math.PI, TAU = PI * 2;
const SEED = 1337;

// ── 3D value noise + fbm (방위각 wrap 위해 cos/sin 좌표로 샘플) ──
function hash(ix, iy, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177) + Math.imul(SEED, 362437)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = smooth(fx), uy = smooth(fy), uz = smooth(fz);
  const c = (a, b, cc) => hash(ix + a, iy + b, iz + cc);
  const x00 = lerp(c(0,0,0), c(1,0,0), ux), x10 = lerp(c(0,1,0), c(1,1,0), ux);
  const x01 = lerp(c(0,0,1), c(1,0,1), ux), x11 = lerp(c(0,1,1), c(1,1,1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}
function fbm(x, y, z, oct) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ── 장면 파라미터 ──
const sunEl = 0.36;                 // 태양 고도(rad) ~21°, 낮은 황금빛
const sunPhi = 0.9;                 // 태양 방위
const sunDir = [Math.cos(sunEl) * Math.cos(sunPhi), Math.sin(sunEl), Math.cos(sunEl) * Math.sin(sunPhi)];

// 색 (linear RGB)
const ZENITH = [0.18, 0.38, 0.82];
const HORIZON_SKY = [0.80, 0.86, 0.92];
const CLOUD = [1.5, 1.5, 1.55];
const CANOPY = [0.035, 0.085, 0.04];
const FLOOR = [0.06, 0.06, 0.03];

const data = new Float32Array(W * H * 3); // linear RGB

for (let y = 0; y < H; y++) {
  const theta = (y + 0.5) / H * PI;       // 0=천정 .. π=바닥
  const el = PI / 2 - theta;              // +π/2 위 .. -π/2 아래
  const sEl = Math.sin(el), cEl = Math.cos(el);
  for (let x = 0; x < W; x++) {
    const phi = (x + 0.5) / W * TAU;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    let r, g, b;

    // 나무 실루엣 라인 — 방위각마다 들쭉날쭉한 나무 꼭대기 고도
    const tBase = 0.12;
    const tCoarse = (fbm(cp * 1.6, sp * 1.6, 10.0, 3) - 0.5) * 0.16;
    const tFine = (fbm(cp * 6.0, sp * 6.0, 20.0, 3) - 0.5) * 0.07;
    const treeTop = tBase + tCoarse + tFine;

    if (el > treeTop) {
      // ── 하늘 ──
      const t = Math.min(1, Math.max(0, el / (PI / 2)));
      r = lerp(HORIZON_SKY[0], ZENITH[0], Math.pow(t, 0.6));
      g = lerp(HORIZON_SKY[1], ZENITH[1], Math.pow(t, 0.6));
      b = lerp(HORIZON_SKY[2], ZENITH[2], Math.pow(t, 0.6));
      r *= 1.15; g *= 1.18; b *= 1.2;

      // 태양 각거리
      const dx = cEl * cp, dy = sEl, dz = cEl * sp;
      const cosA = Math.max(-1, Math.min(1, dx * sunDir[0] + dy * sunDir[1] + dz * sunDir[2]));
      const ang = Math.acos(cosA);

      // 태양 글로우(따뜻) — 여러 폭으로 합성
      const glow = 6.5 * Math.exp(-ang / 0.025) + 1.8 * Math.exp(-ang / 0.10) + 0.5 * Math.exp(-ang / 0.45);
      r += glow * 1.0; g += glow * 0.82; b += glow * 0.55;

      // 구름 — fbm 패치, 천정으로 갈수록 옅게
      let cov = fbm(cp * 2.3, sp * 2.3, el * 2.3 + 4.2, 5);
      cov = Math.max(0, Math.min(1, (cov - 0.52) / 0.18));     // smoothstep 비슷
      cov *= 1 - Math.min(1, t * 0.5);
      if (cov > 0) {
        const lit = 1 + 1.4 * Math.exp(-ang / 0.5);            // 태양 쪽 구름 밝게
        const op = cov * 0.85;
        r = lerp(r, CLOUD[0] * lit, op);
        g = lerp(g, CLOUD[1] * lit, op);
        b = lerp(b, CLOUD[2] * lit, op);
      }

      // 태양 코어(아주 밝게 — 강한 directional light)
      if (ang < 0.011) { r = 90; g = 84; b = 68; }

    } else {
      // ── 숲(나무 + 바닥) ──
      // 아래로 갈수록 바닥. 나무 꼭대기 바로 아래는 캐노피, 깊어지면 floor.
      const depth = Math.min(1, (treeTop - el) / 0.7);
      let baseR = lerp(CANOPY[0], FLOOR[0], depth);
      let baseG = lerp(CANOPY[1], FLOOR[1], depth);
      let baseB = lerp(CANOPY[2], FLOOR[2], depth);

      // 잎/줄기 얼룩(dapple)
      const dap = fbm(cp * 7 + 5, sp * 7 + 5, el * 7 + 2, 4);
      const k = 0.55 + dap * 0.9;
      // 태양 쪽 면은 약간 더 밝고 따뜻
      const sunFace = Math.max(0, cp * sunDir[0] + sp * sunDir[2]);
      const warm = 1 + sunFace * 0.5 * Math.max(0, 1 - depth);
      r = baseR * k * warm;
      g = baseG * k * warm;
      b = baseB * k * (1 + sunFace * 0.25);

      // 나무 사이로 비치는 하늘빛 약간(캐노피 가장자리)
      const edge = Math.max(0, 1 - (treeTop - el) / 0.05);
      if (edge > 0) { r = lerp(r, 0.5, edge * 0.3); g = lerp(g, 0.6, edge * 0.3); b = lerp(b, 0.7, edge * 0.3); }
    }

    const i = (y * W + x) * 3;
    data[i] = Math.max(0, r); data[i + 1] = Math.max(0, g); data[i + 2] = Math.max(0, b);
  }
}

// ── float RGB → RGBE ──
function frexp(value) {
  if (value === 0 || !isFinite(value)) return [0, 0];
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, value);
  let bits = (dv.getUint32(0) >>> 20) & 0x7FF;
  if (bits === 0) { dv.setFloat64(0, value * 2 ** 64); bits = ((dv.getUint32(0) >>> 20) & 0x7FF) - 64; }
  const exponent = bits - 1022;
  const mantissa = value / 2 ** exponent;
  return [mantissa, exponent];
}
function toRgbe(r, g, b, out, o) {
  const v = Math.max(r, g, b);
  if (v < 1e-32) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; return; }
  const [m, e] = frexp(v);
  const scale = m * 256 / v;
  out[o]   = Math.min(255, Math.floor(r * scale));
  out[o + 1] = Math.min(255, Math.floor(g * scale));
  out[o + 2] = Math.min(255, Math.floor(b * scale));
  out[o + 3] = e + 128;
}

// ── RGBE new-RLE .hdr 작성 ──
const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`;
const bytes = [];
for (let i = 0; i < header.length; i++) bytes.push(header.charCodeAt(i));

const row = new Uint8Array(W * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    toRgbe(data[i], data[i + 1], data[i + 2], row, x * 4);
  }
  // 스캔라인 헤더(new RLE): 2,2,width_hi,width_lo
  bytes.push(2, 2, (W >> 8) & 0xff, W & 0xff);
  // 채널별로 리터럴 런(<=128)으로 기록 (압축 없이도 RGBELoader 호환)
  for (let ch = 0; ch < 4; ch++) {
    let x = 0;
    while (x < W) {
      const count = Math.min(128, W - x);
      bytes.push(count);
      for (let k = 0; k < count; k++) bytes.push(row[(x + k) * 4 + ch]);
      x += count;
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'hdri');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'forest.hdr');
writeFileSync(outPath, Buffer.from(bytes));
console.log(`✅ ${outPath}  (${(bytes.length / 1048576).toFixed(2)} MB, ${W}x${H} equirect RGBE)`);
