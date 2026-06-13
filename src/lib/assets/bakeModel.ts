/**
 * 클라이언트 모델 베이킹 — 업로드 전에 브라우저에서:
 *   1) FBX → GLB 변환 (assimpjs WASM — ASCII·바이너리 FBX 모두 견고. three FBXLoader 는 ASCII 못 읽음)
 *   2) 큰 텍스처(>2048px) 다운스케일 (GLTFLoader 로 열어 canvas 리사이즈 → GLTFExporter 재출력)
 *
 * 왜 클라에서: 브라우저는 실행 중 FBX 를 매번 파싱(느림)·ASCII 는 못 읽음. GLB+작은텍스처는 빠름.
 * 유니티가 임포트 때 굽듯이 우리는 업로드 때 업로더 브라우저에서 굽는다 → 서버 부하 0.
 * 어떤 단계든 실패하면 그 전 단계 결과(최소 원본)를 반환 — 업로드는 절대 막지 않음.
 */

import { LoadingManager } from 'three';

const MAX_TEXTURE = 2048;   // 텍스처 한 변 최대 px

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssimpModule = any;

let _assimpPromise: Promise<AssimpModule> | null = null;

function loadAssimpScript(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).assimpjs) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-assimpjs]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('assimpjs.js load error')));
      return;
    }
    const s = document.createElement('script');
    s.src = '/assimpjs.js';
    s.dataset.assimpjs = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('assimpjs.js load error'));
    document.head.appendChild(s);
  });
}

function getAssimp(): Promise<AssimpModule> {
  if (!_assimpPromise) {
    _assimpPromise = (async () => {
      await loadAssimpScript();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (window as any).assimpjs({ locateFile: () => '/assimpjs.wasm' });
    })().catch((e) => { _assimpPromise = null; throw e; });
  }
  return _assimpPromise;
}

/** assimpjs 로 FBX → GLB (Uint8Array). 실패 시 throw. */
async function fbxToGlb(file: File): Promise<Uint8Array> {
  const ajs = await getAssimp();
  const fbx = new Uint8Array(await file.arrayBuffer());
  const fl = new ajs.FileList();
  fl.AddFile('model.fbx', fbx);
  const res = ajs.ConvertFileList(fl, 'glb2');
  if (!res.IsSuccess()) throw new Error('assimp ' + (res.GetErrorCode && res.GetErrorCode()));
  const out = res.GetFile(0).GetContent();
  if (!out || out.length === 0) throw new Error('empty glb');
  return new Uint8Array(out);   // WASM 메모리에서 분리 복사
}

const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'specularMap'] as const;

/** 씬의 큰 텍스처를 canvas 로 다운스케일(in-place). 하나라도 줄였으면 true. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function downscaleSceneTextures(root: any): boolean {
  let changed = false;
  const seen = new Set<unknown>();
  root.traverse((o: { isMesh?: boolean; material?: unknown }) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const key of TEX_KEYS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tex = (m as any)[key];
        if (!tex || seen.has(tex) || !tex.image) continue;
        seen.add(tex);
        const img = tex.image as { width?: number; height?: number };
        const w = img.width || 0, h = img.height || 0;
        if (Math.max(w, h) <= MAX_TEXTURE) continue;
        const scale = MAX_TEXTURE / Math.max(w, h);
        const nw = Math.max(1, Math.round(w * scale));
        const nh = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = nw; canvas.height = nh;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ctx.drawImage(img as any, 0, 0, nw, nh);
          tex.image = canvas;
          tex.needsUpdate = true;
          changed = true;
        } catch { /* 데이터/압축 텍스처 등 drawImage 불가 — 건너뜀 */ }
      }
    }
  });
  return changed;
}

/** 씬의 삼각형 수 + 텍스처 크기 통계 — 무엇이 무거운지(폴리 vs 텍스처) 진단용. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sceneStats(root: any): { tris: number; texDims: string[] } {
  let tris = 0;
  const texDims: string[] = [];
  const seen = new Set<unknown>();
  root.traverse((o: { isMesh?: boolean; geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } }; material?: unknown }) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (g) tris += (g.index ? g.index.count : (g.attributes?.position?.count || 0)) / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const key of TEX_KEYS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tex = (m as any)?.[key];
        if (!tex || seen.has(tex) || !tex.image) continue;
        seen.add(tex);
        texDims.push(`${tex.image.width || 0}x${tex.image.height || 0}`);
      }
    }
  });
  return { tris: Math.round(tris), texDims };
}

/** GLB 의 큰 텍스처를 줄여 새 GLB 반환 + 통계 + 로드 실패(누락) 텍스처 URL. 줄일 게 없거나 실패하면 원본 GLB 그대로. */
async function downscaleGlbTextures(glb: Uint8Array): Promise<{ buffer: Uint8Array; tris: number; texDims: string[]; missingTex: string[] }> {
  const missingTex: string[] = [];
  try {
    const [{ GLTFLoader }, { GLTFExporter }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/exporters/GLTFExporter.js'),
    ]);
    // LoadingManager.onError 가 텍스처(외부 .png 등) 로드 실패 URL 을 정확히 보고 → 누락 감지.
    const manager = new LoadingManager();
    manager.onError = (url) => { if (!missingTex.includes(url)) missingTex.push(url); };
    const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader(manager).parseAsync(ab, '');
    const stats = sceneStats(gltf.scene);
    if (!downscaleSceneTextures(gltf.scene)) return { buffer: glb, ...stats, missingTex };   // 큰 텍스처 없음 → 원본 그대로
    const out = await new Promise<ArrayBuffer | null>((resolve) => {
      new GLTFExporter().parse(gltf.scene, (r) => resolve(r as ArrayBuffer), () => resolve(null), { binary: true });
    });
    return { buffer: out && out.byteLength > 0 ? new Uint8Array(out) : glb, ...stats, missingTex };
  } catch (e) {
    console.warn('[bake] 텍스처 다운스케일 실패(원본 GLB 유지):', e);
    return { buffer: glb, tris: -1, texDims: [], missingTex };
  }
}

/** GLB(또는 gltf) 의 텍스처 로드 실패 URL 목록만 읽기 전용으로 수집 (모델 수정/재출력 없음). 실패 시 빈 배열. */
async function collectMissingTextures(file: File): Promise<string[]> {
  const missing: string[] = [];
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const manager = new LoadingManager();
    manager.onError = (url) => { if (!missing.includes(url)) missing.push(url); };
    const ab = await file.arrayBuffer();
    await new GLTFLoader(manager).parseAsync(ab, '');
  } catch { /* 파싱 실패 시 경고 생략 (업로드는 막지 않음) */ }
  return missing;
}

/**
 * FBX 면 GLB 로 변환(+텍스처 다운스케일)해 새 File 반환. 그 외(GLB 등)는 원본 그대로. 실패 시 원본 File.
 * missingTextures: 모델이 참조하지만 로드 실패한(=업로드돼도 404 날) 텍스처 URL 목록 — 업로드 UI 가 경고.
 */
export async function bakeModelToGlb(file: File): Promise<{ file: File; missingTextures: string[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'fbx') {
    // GLB/gltf — 변환 없이, 누락 텍스처만 읽기 전용으로 점검(외부 .png 참조가 없으면 빈 배열).
    const missingTextures = (ext === 'glb' || ext === 'gltf') ? await collectMissingTextures(file) : [];
    return { file, missingTextures };
  }

  try {
    const rawGlb = await fbxToGlb(file);
    const { buffer: glb, tris, texDims, missingTex } = await downscaleGlbTextures(rawGlb);
    // 진단 로그 — 무엇이 무거운지(잎=폴리 vs 텍스처) 한눈에. 다시 업로드 시 콘솔에서 확인.
    console.log(
      `[bake] "${file.name}": 삼각형 ${tris.toLocaleString()}개, 텍스처 [${texDims.join(', ') || '없음'}], ` +
      `용량 FBX ${(file.size / 1024 / 1024).toFixed(2)}MB → GLB ${(glb.length / 1024 / 1024).toFixed(2)}MB`,
    );
    const glbName = file.name.replace(/\.fbx$/i, '.glb');
    const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    return { file: new File([ab], glbName, { type: 'model/gltf-binary' }), missingTextures: missingTex };
  } catch (e) {
    console.warn('[bake] FBX→GLB 실패 — 원본 업로드:', e);
    return { file, missingTextures: [] };
  }
}
