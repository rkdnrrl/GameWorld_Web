/**
 * 모델 썸네일 생성기 — 오프스크린 WebGLRenderer "1개"로 FBX/GLB/OBJ 를
 * PNG dataURL 로 한 번만 렌더해 캐시한다. 카드마다 라이브 캔버스를 띄우면
 * WebGL 컨텍스트 한계(~16) 를 넘겨 일부가 안 보이므로, 단일 렌더러로 순차 생성.
 *
 * - 저장된 materialConfig(텍스처/프리셋) 가 있으면 머티리얼 에디터와 동일하게 적용.
 * - getCachedThumb(url): 캐시된 dataURL (없으면 undefined)
 * - requestThumb(url, config): 캐시 우선, 없으면 큐에 넣어 순차 생성 → dataURL
 *
 * 클라이언트 전용 (WebGLRenderer 는 브라우저에서만). 렌더러는 lazy 생성 →
 * import 자체는 SSR-safe; requestThumb 는 useEffect 등 클라이언트에서만 호출.
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
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(1.1, 0.9, 1.55);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.4); d1.position.set(5, 10, 5);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-4, 2, -3);
  scene.add(d1, d2);
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

async function renderThumb(url: string, config?: MaterialConfig | null): Promise<string> {
  ensureRenderer();
  const r = renderer!, sc = scene!, cam = camera!;
  const model = await loadStaticModel(url);
  const built = config ? buildMat(config) : null;
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
      } else {
        // 정점 색 모델(Quaternius 등) 검게 나오지 않게 vertexColors 켜기
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mt => {
          const sm = mt as THREE.MeshStandardMaterial;
          if (sm && mesh.geometry?.getAttribute?.('color') && !sm.vertexColors) {
            sm.vertexColors = true;
            sm.needsUpdate = true;
          }
        });
      }
    });
    sc.add(model);
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
