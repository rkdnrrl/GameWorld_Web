/**
 * 모델 썸네일 생성기 — 오프스크린 WebGLRenderer "1개"로 FBX/GLB/OBJ 를
 * PNG dataURL 로 한 번만 렌더해 캐시한다. 카드마다 라이브 캔버스를 띄우면
 * WebGL 컨텍스트 한계(~16) 를 넘겨 일부가 안 보이므로, 단일 렌더러로 순차 생성.
 *
 * 검게 나오는 것 방지:
 *  - 텍스처(colormap 등)는 비동기 로드 → 로드를 기다렸다가 다시 렌더 후 캡처
 *  - 환경광(IBL, RoomEnvironment) → 금속(GLB metalness=1) 머티리얼이 검게 안 나옴
 *  - 정점색(vertex color) 모델은 흰 베이스 + vertexColors 로 색 표시
 *  - 저장된 materialConfig(텍스처/프리셋) 가 있으면 머티리얼 에디터와 동일하게 적용
 *
 * 클라이언트 전용. 렌더러는 lazy 생성 → import 자체는 SSR-safe; requestThumb 는
 * useEffect 등 클라이언트에서만 호출.
 */
import * as THREE from 'three';
import { loadStaticModel } from '@/lib/world/modelLoader';
import { buildMat, disposeMat, type MaterialConfig } from '@/lib/assets/material';

const SIZE = 320;
const cache    = new Map<string, string>();           // url -> dataURL
const inflight = new Map<string, Promise<string>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(1.1, 0.9, 1.55);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.3); d1.position.set(5, 10, 5);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.45); d2.position.set(-4, 2, -3);
  scene.add(d1, d2);
}

// 환경맵(IBL) — PBR/금속 머티리얼이 검게 나오지 않게. 첫 렌더 시 1회 생성.
let envApplied = false;
async function ensureEnv() {
  if (envApplied || !renderer || !scene) return;
  envApplied = true;
  try {
    const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch { /* 환경맵 실패해도 라이트로 렌더 */ }
}

function disposeOriginal(obj: THREE.Object3D) {
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mat => (mat as THREE.Material)?.dispose?.());
  });
}

/** 모델 머티리얼의 텍스처 이미지가 모두 로드될 때까지 대기 (최대 maxMs) */
function waitForTextures(obj: THREE.Object3D, maxMs: number): Promise<void> {
  const waits: Promise<void>[] = [];
  obj.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mat => {
      const sm = mat as THREE.MeshStandardMaterial & { emissiveMap?: THREE.Texture | null };
      [sm?.map, sm?.normalMap, sm?.roughnessMap, sm?.emissiveMap].forEach(tex => {
        const img = tex?.image as (HTMLImageElement | ImageBitmap | undefined);
        if (img && 'complete' in img && !(img as HTMLImageElement).complete) {
          const el = img as HTMLImageElement;
          waits.push(new Promise<void>(res => {
            el.addEventListener('load', () => res(), { once: true });
            el.addEventListener('error', () => res(), { once: true });
          }));
        }
      });
    });
  });
  if (waits.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(waits).then(() => { /* all loaded */ }),
    new Promise<void>(res => setTimeout(res, maxMs)),
  ]);
}

async function renderThumb(url: string, config?: MaterialConfig | null): Promise<string> {
  ensureRenderer();
  await ensureEnv();
  const r = renderer!, sc = scene!, cam = camera!;
  const model = await loadStaticModel(url);
  // config 텍스처는 비동기 로드 → onTexLoad 콜백으로 완료를 기다린다 (three 의 texture.image 는 로드 후에야 채워져서 waitForTextures 로는 못 잡음)
  let resolveTex: () => void = () => {};
  const texPromise = new Promise<void>(res => { resolveTex = res; });
  let texExpected = 0, texLoaded = 0;
  const onTexLoad = () => { if (++texLoaded >= texExpected) resolveTex(); };
  const built = config ? buildMat(config, onTexLoad) : null;
  texExpected = config ? [config.textureAlbedo, config.textureNormal, config.textureRoughness].filter(Boolean).length : 0;
  if (texExpected === 0) resolveTex();
  try {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(1 / h);
    model.position.set(-center.x / h, -center.y / h, -center.z / h);
    model.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (built) {
        mesh.material = built;
        return;
      }
      // 원본 유지 — 텍스처 colorSpace 보정 + 정점색 처리
      const hasVColor = !!mesh.geometry?.getAttribute?.('color');
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach(mt => {
        const sm = mt as THREE.MeshStandardMaterial & { emissiveMap?: THREE.Texture | null };
        if (!sm) return;
        // FBXLoader 가 colormap 텍스처를 linear 로 잡아 어둡게 나오는 것 보정 → sRGB
        if (sm.map) { sm.map.colorSpace = THREE.SRGBColorSpace; }
        if (sm.emissiveMap) { sm.emissiveMap.colorSpace = THREE.SRGBColorSpace; }
        // 텍스처가 있는데 베이스색이 어두우면(검게 곱해짐) 흰색으로 — 텍스처 색이 그대로 보이게
        if (sm.map && sm.color && sm.color.getHex() < 0x202020) sm.color.set('#ffffff');
        if (hasVColor && !sm.vertexColors) {
          sm.vertexColors = true;
          if (!sm.map && sm.color) sm.color.set('#ffffff'); // 정점색만 있는 경우
        }
        sm.needsUpdate = true;
      });
    });
    sc.add(model);
    // config 텍스처(albedo 등) 로드 대기 + 임베디드 텍스처 로드 대기 → 입혀진 상태로 캡처
    await Promise.race([texPromise, new Promise<void>(res => setTimeout(res, 900))]);
    await waitForTextures(model, 500);
    r.render(sc, cam);
    return r.domElement.toDataURL('image/png');
  } finally {
    sc.remove(model);
    disposeOriginal(model);
    if (built) disposeMat(built);
  }
}

// 순차 처리 체인 — 단일 GL 컨텍스트라 동시 렌더 불가, FIFO 로 처리
let chain: Promise<unknown> = Promise.resolve();

export function getCachedThumb(url: string): string | undefined {
  return cache.get(url);
}

export function requestThumb(url: string, config?: MaterialConfig | null): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = chain.then(() => renderThumb(url, config)).then(
    (dataUrl) => { cache.set(url, dataUrl); inflight.delete(url); return dataUrl; },
    (err) => { inflight.delete(url); throw err; },
  );
  inflight.set(url, p);
  chain = p.catch(() => { /* 실패해도 다음 작업 이어지게 */ });
  return p;
}
