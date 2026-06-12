// 숲 밤하늘 HDR 생성기 — 의존성 없음. Radiance .hdr(RGBE, equirectangular).
// 구성: 깊은 밤하늘 그라데이션 + 은하수(밴드 글로우·먼지띠·별 밀집) + 별(밝기/색 분포) + 달(글로우) + 숲 실루엣.
// 실행: node scripts/gen-forest-hdr-night.mjs  →  public/hdri/forest-night.hdr
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 2048, H = 1024;
const PI = Math.PI, TAU = PI * 2;
const SEED = 7777;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x1357924);

function hash(ix, iy, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177) + Math.imul(SEED, 362437)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
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
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
const dot3 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

// ── 장면 파라미터 ──
const moonEl = 0.62, moonPhi = 3.9;
const moonDir = [Math.cos(moonEl)*Math.cos(moonPhi), Math.sin(moonEl), Math.cos(moonEl)*Math.sin(moonPhi)];

// 은하수 밴드 — 밴드 법선(이 방향에 수직인 큰 원이 밴드). 하늘을 가로질러 높게 아치.
const bandN = norm3([0.55, 0.22, 0.80]);
const bandU = norm3(cross(bandN, [0, 1, 0]));
const bandV = cross(bandN, bandU);
// 은하 중심(밴드 위 한 점) — 그 근처가 더 밝고 따뜻
const gcDir = norm3([bandU[0]*0.4 + bandV[0]*0.9, bandU[1]*0.4 + bandV[1]*0.9, bandU[2]*0.4 + bandV[2]*0.9]);

const ZENITH = [0.004, 0.008, 0.018];
const HORIZON = [0.018, 0.026, 0.045];
const CANOPY = [0.006, 0.011, 0.014];
const FLOOR = [0.004, 0.005, 0.007];

const data = new Float32Array(W * H * 3);

function dirOf(phi, el) { const c = Math.cos(el); return [c*Math.cos(phi), Math.sin(el), c*Math.sin(phi)]; }

// ── 하늘/숲 베이스 ──
for (let y = 0; y < H; y++) {
  const theta = (y + 0.5) / H * PI, el = PI / 2 - theta;
  const cEl = Math.cos(el), sEl = Math.sin(el);
  for (let x = 0; x < W; x++) {
    const phi = (x + 0.5) / W * TAU;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    let r, g, b;

    const tBase = 0.12;
    const treeTop = tBase + (fbm(cp*1.6, sp*1.6, 10, 3) - 0.5)*0.16 + (fbm(cp*6, sp*6, 20, 3) - 0.5)*0.07;

    if (el > treeTop) {
      const t = Math.min(1, Math.max(0, el / (PI / 2)));
      r = lerp(HORIZON[0], ZENITH[0], Math.pow(t, 0.5));
      g = lerp(HORIZON[1], ZENITH[1], Math.pow(t, 0.5));
      b = lerp(HORIZON[2], ZENITH[2], Math.pow(t, 0.5));

      const d = [cEl*cp, sEl, cEl*sp];

      // 은하수 — 밴드 근접도(가우시안) × fbm 구조, 먼지띠(어두운 줄), 중심부 따뜻
      const td = dot3(d, bandN);
      const prox = Math.exp(-((td / 0.16) ** 2));
      if (prox > 0.001) {
        const a = dot3(d, bandU), bb = dot3(d, bandV);
        let neb = fbm(a*2.4 + 8, bb*2.4 + 3, td*5 + 1, 4);          // 구름 구조
        const dust = fbm(a*3.5 + 20, bb*3.5 + 11, 7, 4);           // 먼지띠
        const lane = smooth(Math.min(1, Math.max(0, (dust - 0.38) / 0.3)));
        let mw = prox * (0.35 + neb * 0.9) * lane;
        const toGC = Math.max(0, dot3(d, gcDir));
        const warm = 0.5 + 0.5 * Math.pow(toGC, 2);                // 중심 쪽 강조
        mw *= (0.6 + warm);
        r += mw * (0.42 + warm * 0.28);
        g += mw * (0.40 + warm * 0.14);
        b += mw * (0.52);
      }

      // 달빛 산란 헤일로
      const cosM = Math.max(-1, Math.min(1, d[0]*moonDir[0] + d[1]*moonDir[1] + d[2]*moonDir[2]));
      const angM = Math.acos(cosM);
      const halo = 0.20*Math.exp(-angM/0.18) + 0.06*Math.exp(-angM/0.6);
      r += halo*0.85; g += halo*0.9; b += halo;

      // 달 코어 + 글로우
      if (angM < 0.045) { const f = 1 - angM/0.045; const v = lerp(6, 55, f*f); r += v*0.92; g += v*0.95; b += v; }

      r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
    } else {
      const depth = Math.min(1, (treeTop - el) / 0.7);
      let R = lerp(CANOPY[0], FLOOR[0], depth), G = lerp(CANOPY[1], FLOOR[1], depth), B = lerp(CANOPY[2], FLOOR[2], depth);
      const dap = fbm(cp*7 + 5, sp*7 + 5, el*7 + 2, 4);
      const k = 0.5 + dap * 0.9;
      const moonFace = Math.max(0, cp*moonDir[0] + sp*moonDir[2]);  // 달 쪽 면 살짝 차갑게 밝음
      const rim = moonFace * 0.5 * Math.max(0, 1 - depth);
      r = R*k + rim*0.05; g = G*k + rim*0.06; b = B*k + rim*0.09;
    }

    const i = (y*W + x)*3;
    data[i] = r; data[i+1] = g; data[i+2] = b;
  }
}

// ── 별 splat ──
// 서브픽셀 점(≈1px)으로 별을 찍는다 — 가까운 2x2 픽셀에 bilinear 분배. 밝아도 커지지 않음.
function deposit(fx, fy, R, G, B) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const add = (xx, yy, w) => {
    if (yy < 0 || yy >= H) return;
    const X = ((xx % W) + W) % W, i = (yy*W + X)*3;
    data[i] += R*w; data[i+1] += G*w; data[i+2] += B*w;
  };
  add(x0, y0, (1-tx)*(1-ty)); add(x0+1, y0, tx*(1-ty));
  add(x0, y0+1, (1-tx)*ty);   add(x0+1, y0+1, tx*ty);
}
function starColor(u) {
  if (u < 0.55) return [0.85, 0.9, 1.1];       // 청백
  if (u < 0.85) return [1.0, 1.0, 1.0];        // 백색
  return [1.2, 0.95, 0.7];                     // 주황
}
// el(고도)에서 바닥 나무선보다 위만 별 배치 (나무에 별 안 박히게)
function aboveTrees(phi, el) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const treeTop = 0.12 + (fbm(cp*1.6, sp*1.6, 10, 3) - 0.5)*0.16 + (fbm(cp*6, sp*6, 20, 3) - 0.5)*0.07;
  return el > treeTop + 0.01;
}
function place(phi, el, bright) {
  if (!aboveTrees(phi, el)) return;
  const x = phi / TAU * W, y = (PI/2 - el) / PI * H;
  const c = starColor(rnd());
  deposit(x, y, c[0]*bright, c[1]*bright, c[2]*bright);
  // 아주 밝은 별만 미세한 십자 윙 — 점처럼 보이되 존재감(여전히 작음)
  if (bright > 7) {
    const g = bright * 0.10;
    deposit(x+1, y, c[0]*g, c[1]*g, c[2]*g); deposit(x-1, y, c[0]*g, c[1]*g, c[2]*g);
    deposit(x, y+1, c[0]*g, c[1]*g, c[2]*g); deposit(x, y-1, c[0]*g, c[1]*g, c[2]*g);
  }
}
// 배경 별 — 구면 균일 분포
for (let i = 0; i < 7000; i++) {
  const phi = rnd()*TAU, el = Math.asin(2*rnd() - 1);
  const bright = 0.25 + Math.pow(rnd(), 9) * 16;
  place(phi, el, bright);
}
// 은하수 별 밀집 — 밴드 근처에 더 많이, 더 밝게
for (let i = 0; i < 11000; i++) {
  // 밴드 위 임의 방향 + 수직 가우시안 오프셋
  const ang = rnd()*TAU;
  let d = [bandU[0]*Math.cos(ang) + bandV[0]*Math.sin(ang),
           bandU[1]*Math.cos(ang) + bandV[1]*Math.sin(ang),
           bandU[2]*Math.cos(ang) + bandV[2]*Math.sin(ang)];
  const off = (rnd() + rnd() + rnd() - 1.5) * 0.16;   // 종 모양
  d = norm3([d[0] + bandN[0]*off, d[1] + bandN[1]*off, d[2] + bandN[2]*off]);
  const el = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const phi = Math.atan2(d[2], d[0]);
  const bright = 0.3 + Math.pow(rnd(), 7) * 10;
  place((phi + TAU) % TAU, el, bright);
}

// ── float RGB → RGBE → .hdr (new RLE) ──
function frexp(value) {
  if (value === 0 || !isFinite(value)) return [0, 0];
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, value);
  let bits = (dv.getUint32(0) >>> 20) & 0x7FF;
  if (bits === 0) { dv.setFloat64(0, value * 2**64); bits = ((dv.getUint32(0) >>> 20) & 0x7FF) - 64; }
  const exponent = bits - 1022; return [value / 2**exponent, exponent];
}
function toRgbe(r, g, b, out, o) {
  const v = Math.max(r, g, b);
  if (v < 1e-32) { out[o] = out[o+1] = out[o+2] = out[o+3] = 0; return; }
  const [m, e] = frexp(v); const s = m * 256 / v;
  out[o] = Math.min(255, Math.floor(r*s)); out[o+1] = Math.min(255, Math.floor(g*s));
  out[o+2] = Math.min(255, Math.floor(b*s)); out[o+3] = e + 128;
}
const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`;
const bytes = [];
for (let i = 0; i < header.length; i++) bytes.push(header.charCodeAt(i));
const row = new Uint8Array(W * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) { const i = (y*W + x)*3; toRgbe(data[i], data[i+1], data[i+2], row, x*4); }
  bytes.push(2, 2, (W >> 8) & 0xff, W & 0xff);
  for (let ch = 0; ch < 4; ch++) {
    let x = 0;
    while (x < W) { const count = Math.min(128, W - x); bytes.push(count); for (let k = 0; k < count; k++) bytes.push(row[(x + k)*4 + ch]); x += count; }
  }
}
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'hdri');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'forest-night.hdr');
writeFileSync(outPath, Buffer.from(bytes));
console.log(`✅ ${outPath}  (${(bytes.length / 1048576).toFixed(2)} MB, ${W}x${H} equirect RGBE)`);
