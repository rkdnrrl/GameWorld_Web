'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky, Outlines, Environment } from '@react-three/drei';
import * as THREE from 'three';

/* ── 머티리얼 프리셋 (WorldCanvas와 동일) ── */
const MAT_PRESETS: Record<string, { metalness: number; roughness: number; opacity?: number; transparent?: boolean; defaultColor: string; emissive?: string; emissiveIntensity?: number }> = {
  wood:     { defaultColor: '#8b6f47', metalness: 0,   roughness: 0.85 },
  metal:    { defaultColor: '#b0b0b0', metalness: 1.0, roughness: 0.3  },
  stone:    { defaultColor: '#7a7a7a', metalness: 0,   roughness: 0.95 },
  glass:    { defaultColor: '#a0c8e0', metalness: 0,   roughness: 0.05, opacity: 0.3, transparent: true },
  plastic:  { defaultColor: '#ffffff', metalness: 0,   roughness: 0.5  },
  emissive: { defaultColor: '#ffffff', metalness: 0,   roughness: 0.6, emissive: '#ffaa44', emissiveIntensity: 1.5 },
};

function loadTex(url: string, colorSpace: THREE.ColorSpace, tx: number, ty: number, onLoad: () => void): THREE.Texture {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const tex = loader.load(url, () => { tex.needsUpdate = true; onLoad(); });
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tx, ty);
  return tex;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMat(cfg: any, onTex?: () => void): THREE.MeshStandardMaterial | null {
  if (!cfg) return null;
  const presetKey = cfg.material && cfg.material !== 'default' ? cfg.material : null;
  const preset = presetKey ? MAT_PRESETS[presetKey] : null;
  const hasTex = cfg.textureAlbedo || cfg.textureNormal || cfg.textureRoughness;
  if (!presetKey && !hasTex && !cfg.materialColor) return null;

  const baseColor = cfg.materialColor || (preset ? preset.defaultColor : '#ffffff');
  const mat = new THREE.MeshStandardMaterial({
    color: hasTex && !cfg.materialColor ? '#ffffff' : baseColor,
    metalness: preset?.metalness ?? 0,
    roughness: preset?.roughness ?? 0.5,
    opacity: preset?.opacity ?? 1,
    transparent: preset?.transparent ?? false,
    emissive: preset?.emissive ?? '#000000',
    emissiveIntensity: preset?.emissiveIntensity ?? 0,
  });
  const tx = cfg.textureTilingX || 1;
  const ty = cfg.textureTilingY || 1;
  const trig = () => { mat.needsUpdate = true; onTex?.(); };
  if (cfg.textureAlbedo)    mat.map         = loadTex(cfg.textureAlbedo,    THREE.SRGBColorSpace, tx, ty, trig);
  if (cfg.textureNormal)    mat.normalMap   = loadTex(cfg.textureNormal,    THREE.NoColorSpace,   tx, ty, trig);
  if (cfg.textureRoughness) mat.roughnessMap = loadTex(cfg.textureRoughness, THREE.NoColorSpace,   tx, ty, trig);
  return mat;
}

function disposeMat(mat: THREE.MeshStandardMaterial) {
  mat.map?.dispose(); mat.normalMap?.dispose(); mat.roughnessMap?.dispose(); mat.dispose();
}

/* ── TransformControls 기즈모 핸들 hover/drag 상태 (전역 가드) ──
   화살표/링 위에 마우스가 있을 땐 그 뒤의 메시가 선택되지 않도록 막는 용도
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tcRef: { current: any } = { current: null };
function isGizmoActive(): boolean {
  const tc = tcRef.current;
  if (!tc) return false;
  // axis: hover 중인 축 이름 (없으면 null), dragging: 드래그 중
  return !!tc.axis || !!tc.dragging;
}
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitRef = any;

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 데이터 모델 ───────────────────────────── */
type ObjectKind = 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';

type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

interface MapObject {
  id: string;
  label?: string;
  locked?: boolean;
  kind: ObjectKind;
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  color:    string;
  // 머티리얼/텍스처
  material?:        MaterialPreset;
  materialColor?:   string;
  textureAlbedo?:    string;
  textureNormal?:    string;
  textureRoughness?: string;
  textureTilingX?:   number;
  textureTilingY?:   number;
}

interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  materialConfig?: any;     // 구버전 (DEPRECATED)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;           // 신규 — metadata.materialConfig
}

interface MyWorldItem {
  id: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  updatedAt?: string;
  isPublic?: boolean;
}

// 신/구 어느 위치든 머티리얼 설정 꺼내기
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAssetMaterialConfig(a: Asset | undefined): any {
  if (!a) return null;
  return a.metadata?.materialConfig ?? a.materialConfig ?? null;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/* ── X/Y/Z 숫자 입력 행 ──────────────────── */
function AxisInputRow({ label, values, step, min, onChange, onCommit }: {
  label: string;
  values: [number, number, number];
  step: number;
  min?: number;
  onChange: (axisIdx: number, value: number) => void;
  onCommit: () => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        {(['X','Y','Z'] as const).map((axis, i) => (
          <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '2px 4px' }}>
            <span style={{ color: ['#f87171','#4ade80','#60a5fa'][i], fontSize: 10, fontWeight: 700, width: 10 }}>{axis}</span>
            <input
              type="number"
              value={values[i]}
              step={step}
              min={min}
              onChange={e => onChange(i, Number(e.target.value))}
              onBlur={onCommit}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={{
                width: '100%', minWidth: 0,
                background: 'transparent', border: 'none',
                color: '#fff', fontSize: 11, padding: '2px 0',
                outline: 'none', textAlign: 'right',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 텍스처 선택 모달 ────────────────────── */
function TexturePickerModal({ assets, onSelect, onClose, title }: {
  assets: Asset[];
  onSelect: (url: string) => void;
  onClose: () => void;
  title: string;
}) {
  const t = useTranslations('Studio');
  const images = assets.filter(a => /\.(png|jpe?g|webp)$/i.test(a.modelUrl));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}>
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, width: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {images.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', padding: 30 }}>
            {t('noTextures')}<br />
            <a href="/assets" style={{ color: '#818cf8' }}>/assets</a> {t('uploadAtAssets')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, overflowY: 'auto' }}>
            {images.map(a => (
              <button key={a.id} onClick={() => onSelect(a.modelUrl)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', overflow: 'hidden', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
                <div style={{ width: '100%', aspectRatio: '1', background: `url(${a.modelUrl}) center/cover` }} />
                <div style={{ padding: '4px 6px', fontSize: 10, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 단일 오브젝트 렌더링 ────────────────── */
function Mesh3D({ obj, selected, onClick, assetConfig }: {
  obj: MapObject;
  selected: boolean;
  onClick: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetConfig?: any;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const handle = (e: { stopPropagation: () => void; button?: number }) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (isGizmoActive()) return;
    if (obj.locked) return; // 잠긴 오브젝트는 뷰포트 선택 불가
    e.stopPropagation();
    onClick();
  };

  if (obj.kind === 'asset') return <AssetMesh obj={obj} selected={selected} onClick={handle} assetConfig={assetConfig} />;

  const geometry =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;
  return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale}
      onPointerDown={handle} castShadow receiveShadow userData={{ id: obj.id }}>
      {geometry}
      <PrimitiveMaterial obj={obj} />
      {selected && <Outlines thickness={3} color="#22d3ee" screenspace />}
    </mesh>
  );
}

function PrimitiveMaterial({ obj }: { obj: MapObject }) {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const [, forceUpdate] = useState(0);
  const cfg = {
    material:         obj.material,
    materialColor:    obj.materialColor,
    textureAlbedo:    obj.textureAlbedo,
    textureNormal:    obj.textureNormal,
    textureRoughness: obj.textureRoughness,
    textureTilingX:   obj.textureTilingX,
    textureTilingY:   obj.textureTilingY,
  };
  const cfgKey = JSON.stringify(cfg);

  useEffect(() => {
    if (matRef.current) { disposeMat(matRef.current); matRef.current = null; }
    const mat = buildMat(cfg, () => forceUpdate(n => n + 1));
    matRef.current = mat;
    forceUpdate(n => n + 1);
    return () => { if (matRef.current) { disposeMat(matRef.current); matRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  const side = obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
  if (matRef.current) {
    matRef.current.side = side;
    return <primitive object={matRef.current} attach="material" />;
  }
  return <meshStandardMaterial color={obj.color} side={side} />;
}

function AssetMesh({ obj, selected, onClick, assetConfig }: {
  obj: MapObject;
  selected: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetConfig?: any;
}) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const originalMatsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const appliedMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!obj.assetUrl) return;
    let cancelled = false;
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(obj.assetUrl!, (fbx) => {
        if (cancelled) return;
        fbx.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z);
        if (h > 0) fbx.scale.multiplyScalar(1 / h);
        const origMap = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        fbx.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            origMap.set(m, m.material);
          }
        });
        originalMatsRef.current = origMap;
        setModel(fbx);
      });
    });
    return () => { cancelled = true; };
  }, [obj.assetUrl]);

  // obj 자체 머티리얼 필드 우선, 없으면 에셋의 저장된 materialConfig 사용
  const objHasMat = obj.material || obj.materialColor || obj.textureAlbedo || obj.textureNormal || obj.textureRoughness;
  const effectiveCfg = objHasMat
    ? { material: obj.material, materialColor: obj.materialColor,
        textureAlbedo: obj.textureAlbedo, textureNormal: obj.textureNormal, textureRoughness: obj.textureRoughness,
        textureTilingX: obj.textureTilingX, textureTilingY: obj.textureTilingY }
    : assetConfig;
  const cfgKey = JSON.stringify(effectiveCfg || null);

  useEffect(() => {
    if (!model) return;
    // 이전 적용 머티리얼 정리
    appliedMatsRef.current.forEach(disposeMat);
    appliedMatsRef.current = [];

    const mat = buildMat(effectiveCfg, () => forceUpdate(n => n + 1));
    originalMatsRef.current.forEach((origMat, mesh) => {
      if (mat) {
        mesh.material = mat;
      } else {
        mesh.material = origMat;
      }
    });
    if (mat) appliedMatsRef.current.push(mat);
    forceUpdate(n => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, cfgKey]);

  useEffect(() => () => {
    appliedMatsRef.current.forEach(disposeMat);
    appliedMatsRef.current = [];
  }, []);

  if (!model) return null;
  return (
    <group position={obj.position} rotation={obj.rotation} scale={obj.scale}
      onPointerDown={onClick} userData={{ id: obj.id }}>
      <primitive object={model} />
      {/* 선택 시 바운딩 박스 윤곽 */}
      {selected && <SelectedBoxOutline target={model} />}
    </group>
  );
}

function SelectedBoxOutline({ target }: { target: THREE.Object3D }) {
  const [size, setSize] = useState<[number, number, number]>([1, 1, 1]);
  const [center, setCenter] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(target);
    const s = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    setSize([s.x, s.y, s.z]);
    setCenter([c.x, c.y, c.z]);
  }, [target]);
  return (
    <mesh position={center}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#22d3ee" wireframe />
    </mesh>
  );
}

/* ── 변환 컨트롤 ──────────────────────────── */
function SelectedTransform({ targetId, mode, onChange, onDragEnd, snapTranslate, snapRotate, snapScale }: {
  targetId: string | null;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => void;
  onDragEnd: () => void;
  snapTranslate?: number | null;
  snapRotate?: number | null;
  snapScale?: number | null;
}) {
  const { scene } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);

  // targetId가 바뀌거나, scene 트리가 바뀐 후 매 프레임 검사
  useFrame(() => {
    if (!targetId) {
      if (target) setTarget(null);
      return;
    }
    let found: THREE.Object3D | null = null;
    scene.traverse(o => { if (o.userData?.id === targetId) found = o; });
    // 대상이 scene 트리에 실제 연결돼 있는지 확인 (이게 빠지면 TransformControls 에러 999개)
    if (found && (found as THREE.Object3D).parent) {
      if (target !== found) setTarget(found);
    } else {
      if (target) setTarget(null);
    }
  });

  if (!target) return null;

  return (
    <TransformControls
      key={targetId ?? 'none'}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={(tc: any) => { tcRef.current = tc || null; }}
      object={target}
      mode={mode}
      translationSnap={snapTranslate ?? null}
      rotationSnap={snapRotate ?? null}
      scaleSnap={snapScale ?? null}
      onObjectChange={() => {
        const o = target;
        onChange(targetId!, {
          p: [o.position.x, o.position.y, o.position.z],
          r: [o.rotation.x, o.rotation.y, o.rotation.z],
          s: [o.scale.x,    o.scale.y,    o.scale.z],
        });
      }}
      onMouseUp={onDragEnd}
    />
  );
}

/* ── TransformControls 드래그 중 OrbitControls 비활성화 ── */
/* ── WASD/QE 카메라 이동 ──
   W/S: 카메라가 바라보는 방향으로 전/후 (시선 방향 그대로 — 위/아래로 기울이면 그 방향으로 이동)
   A/D: 카메라 로컬 right 축 기준 좌/우 스트레이프
   Q/E: 월드 Y 하강/상승
   Shift: 가속 (3배)
   OrbitControls의 target도 함께 이동시켜 회전 피벗이 따라가게 함
*/
function WasdFlyCamera({ orbitRef }: { orbitRef: React.MutableRefObject<OrbitRef | null> }) {
  const { camera, gl } = useThree();
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // 입력 필드 포커스 중이면 무시
      const tgt = e.target as HTMLElement | null;
      if (tgt && /INPUT|TEXTAREA|SELECT/.test(tgt.tagName)) return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => { keysRef.current.delete(e.key.toLowerCase()); };
    const blur = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [gl]);

  const fwd   = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move  = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0) return;
    const speed = (keys.has('shift') ? 18 : 6) * delta;

    // 카메라의 실제 로컬 축을 행렬에서 추출 (column 0 = right, column 2 = back)
    // → roll/pitch 가 있어도 진짜 시선 방향 기준으로 이동
    right.current.setFromMatrixColumn(camera.matrix, 0);   // 카메라 right (+X 로컬)
    fwd.current.setFromMatrixColumn(camera.matrix, 2).negate(); // 카메라 forward = -back

    move.current.set(0, 0, 0);
    if (keys.has('w')) move.current.add(fwd.current);
    if (keys.has('s')) move.current.sub(fwd.current);
    if (keys.has('d')) move.current.add(right.current);
    if (keys.has('a')) move.current.sub(right.current);
    if (keys.has('e')) move.current.y += 1;
    if (keys.has('q')) move.current.y -= 1;
    if (move.current.lengthSq() === 0) return;
    move.current.normalize().multiplyScalar(speed);

    camera.position.add(move.current);
    if (orbitRef.current?.target) {
      orbitRef.current.target.add(move.current);
      orbitRef.current.update?.();
    }
  });

  return null;
}

/** Three.js 캔버스 캡처 함수를 외부 ref에 등록 */
function CanvasCapture({ captureFnRef }: { captureFnRef: React.MutableRefObject<(() => string | null) | null> }) {
  const { gl } = useThree();
  useEffect(() => {
    captureFnRef.current = () => {
      try { return gl.domElement.toDataURL('image/webp', 0.7); } catch { return null; }
    };
    return () => { captureFnRef.current = null; };
  }, [gl, captureFnRef]);
  return null;
}

function DraggingDetector({ setOrbitEnabled }: { setOrbitEnabled: (v: boolean) => void }) {
  const { scene } = useThree();
  useEffect(() => {
    const interval = setInterval(() => {
      let dragging = false;
      scene.traverse(obj => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((obj as any).isTransformControls && (obj as any).dragging) dragging = true;
      });
      setOrbitEnabled(!dragging);
    }, 50);
    return () => clearInterval(interval);
  }, [scene, setOrbitEnabled]);
  return null;
}

/* ── 메인 ─────────────────────────────────── */
// 일회용 콘솔 스팸 억제 (TransformControls, ShadowMap 등)
let _consoleSilenced = false;
function silenceConsoleSpam() {
  if (_consoleSilenced || typeof window === 'undefined') return;
  _consoleSilenced = true;
  const origErr = console.error;
  const origWarn = console.warn;
  const seenErr = new Set<string>();
  const seenWarn = new Set<string>();
  console.error = (...args: unknown[]) => {
    const m = String(args[0] ?? '');
    if (m.includes('TransformControls: The attached')) {
      if (seenErr.has(m)) return;
      seenErr.add(m);
    }
    origErr.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    const m = String(args[0] ?? '');
    if (m.includes('PCFSoftShadowMap has been deprecated')) {
      if (seenWarn.has(m)) return;
      seenWarn.add(m);
    }
    origWarn.apply(console, args);
  };
}

export default function StudioCanvas() {
  useEffect(() => { silenceConsoleSpam(); }, []);
  const t            = useTranslations('Studio');
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editingId    = searchParams.get('id') || null;

  const [objects, setObjects]       = useState<MapObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode]             = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [name, setName]             = useState(t('newWorldDefault'));
  const [savedId, setSavedId]       = useState<string | null>(editingId);
  const [saving, setSaving]         = useState(false);
  const [myAssets, setMyAssets]     = useState<Asset[]>([]);
  const [myWorlds, setMyWorlds]     = useState<MyWorldItem[]>([]);
  const [myWorldsOpen, setMyWorldsOpen] = useState(false);
  const [myWorldsLoading, setMyWorldsLoading] = useState(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [activeAssetPicker, setActiveAssetPicker] = useState(false);
  const [texPicker, setTexPicker] = useState<null | 'albedo' | 'normal' | 'roughness'>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const orbitRef = useRef<OrbitRef | null>(null);
  // 그리드 스냅
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapSize, setSnapSize] = useState(0.5);
  // 오브젝트 종류별 카운터 (자동 이름용)
  const objCounterRef = useRef<Record<string, number>>({});
  // 공개/비공개
  const [isPublic, setIsPublic] = useState(false);
  // 오브젝트 이름 인라인 편집
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  // 조명 설정
  const [lightAmbient, setLightAmbient] = useState(0.5);
  const [lightDir, setLightDir] = useState(1.5);
  const [skyEnabled, setSkyEnabled] = useState(true);
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  // 썸네일 캡처 함수 (Canvas 내부에서 등록)
  const captureFnRef = useRef<(() => string | null) | null>(null);

  const token = () => session.getToken() || '';

  /* ── Undo/Redo ─────────────────────────── */
  type HistState = { stack: MapObject[][]; idx: number };
  const [hist, setHist] = useState<HistState>({ stack: [[]], idx: 0 });

  const pushHistory = useCallback((snapshot: MapObject[]) => {
    setHist(s => {
      const truncated = s.stack.slice(0, s.idx + 1);
      return { stack: [...truncated, clone(snapshot)], idx: truncated.length };
    });
  }, []);

  const undo = useCallback(() => {
    setHist(s => {
      if (s.idx <= 0) return s;
      const newIdx = s.idx - 1;
      setObjects(clone(s.stack[newIdx]));
      setSelectedId(null);
      return { ...s, idx: newIdx };
    });
  }, []);

  const redo = useCallback(() => {
    setHist(s => {
      if (s.idx >= s.stack.length - 1) return s;
      const newIdx = s.idx + 1;
      setObjects(clone(s.stack[newIdx]));
      setSelectedId(null);
      return { ...s, idx: newIdx };
    });
  }, []);

  /* 내 에셋 목록 로드 */
  useEffect(() => {
    fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setMyAssets(d.assets || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token()) return;
    setMyWorldsLoading(true);
    fetch(`${API}/api/worlds/my`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((d) => setMyWorlds((d.worlds || []) as MyWorldItem[]))
      .catch(() => {})
      .finally(() => setMyWorldsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedId]);

  /* 편집 중인 월드 로드 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  // 방금 저장으로 인한 URL 변경 시에만 재로드 스킵
  const justSavedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingId) return;
    // 방금 저장으로 URL이 바뀐 거라면 재로드 스킵 → 데이터 보존
    if (justSavedRef.current === editingId) {
      justSavedRef.current = null;
      return;
    }

    setLoading(true);
    setLoadError(null);
    const tok = session.getToken();
    console.log('[studio] loading world', editingId);
    fetch(`${API}/api/worlds/${editingId}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(async r => {
        const text = await r.text();
        console.log('[studio] response status:', r.status);
        try { return JSON.parse(text); } catch { throw new Error('Invalid JSON: ' + text.slice(0, 100)); }
      })
      .then(d => {
        if (!d.world) {
          setLoadError(d.error?.message || '월드를 찾을 수 없습니다.');
          return;
        }
        console.log('[studio] loaded:', d.world.name, 'objects:', d.world.mapData?.objects?.length ?? 0);
        setName(d.world.name);
        setIsPublic(Boolean(d.world.isPublic));
        const objs = d.world.mapData?.objects || [];
        setObjects(objs);
        setHist({ stack: [clone(objs)], idx: 0 });
        setSelectedId(null);
        setSavedId(d.world.id);
      })
      .catch(e => {
        console.error('[studio] load failed:', e);
        setLoadError(String(e?.message || e));
      })
      .finally(() => setLoading(false));
  }, [editingId]);

  /* 단축키 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Undo/Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
        if (e.key === 'd') { e.preventDefault(); duplicate(); return; }
      }
      // 입력창에 포커스되어 있으면 단축키 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setObjects(prev => {
          const next = prev.filter(o => o.id !== selectedId);
          pushHistory(next);
          return next;
        });
        setSelectedId(null);
      } else if (e.key === 'g') setMode('translate');
      else if (e.key === 'r') setMode('rotate');
      else if (e.key === 's') setMode('scale');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, undo, redo, pushHistory]);

  useEffect(() => {
    const check = () => {
      const mobile = window.matchMedia?.('(max-width: 900px)')?.matches ?? false;
      setIsMobile(mobile);
      if (!mobile) setMobilePanelOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const KIND_LABELS: Record<string, string> = { cube: '큐브', sphere: '구체', cylinder: '실린더', plane: '평면', asset: '에셋' };
  const KIND_ICONS:  Record<string, string> = { cube: '📦', sphere: '⚪', cylinder: '🥫', plane: '▭', asset: '🎲' };

  function makeLabel(kind: string): string {
    objCounterRef.current[kind] = (objCounterRef.current[kind] ?? 0) + 1;
    return `${KIND_LABELS[kind] ?? kind} ${objCounterRef.current[kind]}`;
  }

  function addPrimitive(kind: 'cube' | 'sphere' | 'cylinder' | 'plane') {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel(kind);
    setObjects(prev => {
      const next = [...prev, {
        id, kind, label,
        position: [0, kind === 'plane' ? 0.01 : 0.5, 0] as [number,number,number],
        rotation: (kind === 'plane' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]) as [number,number,number],
        scale:    (kind === 'plane' ? [5, 5, 1] : [1, 1, 1]) as [number,number,number],
        color:    '#94a3b8',
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
  }

  function duplicate() {
    if (!selected) return;
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel(selected.kind);
    const offset: [number,number,number] = [selected.position[0] + 1, selected.position[1], selected.position[2]];
    setObjects(prev => {
      const next = [...prev, { ...clone(selected), id, label, position: offset }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
  }

  function addAsset(asset: Asset) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = asset.name || makeLabel('asset');
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'asset', label,
        assetUrl: asset.modelUrl,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#fff',
        // 에셋의 저장된 머티리얼 설정 자동 적용 (metadata.materialConfig 우선)
        ...(getAssetMaterialConfig(asset) || {}),
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setActiveAssetPicker(false);
  }

  function updateObjectTransform(id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, position: t.p, rotation: t.r, scale: t.s } : o));
  }

  function updateColor(id: string, color: string) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, color } : o));
  }

  function updateMaterialField<K extends keyof MapObject>(field: K, value: MapObject[K]) {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, [field]: value } : o));
  }

  function updateAxis(field: 'position' | 'rotation' | 'scale', axisIdx: number, value: number) {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId) return o;
      const arr = [...o[field]] as [number, number, number];
      arr[axisIdx] = value;
      return { ...o, [field]: arr };
    }));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setObjects(prev => {
      const next = prev.filter(o => o.id !== selectedId);
      pushHistory(next);
      return next;
    });
    setSelectedId(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // 썸네일: Three.js 캔버스 캡처 → base64 → 서버 업로드
      let thumbnailUrl: string | undefined;
      try {
        const dataUrl = captureFnRef.current?.();
        if (dataUrl) {
          const blob = await (await fetch(dataUrl)).blob();
          const fd = new FormData();
          fd.append('file', blob, 'thumbnail.webp');
          const upRes = await fetch(`${API}/api/worlds/thumbnail`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token()}` },
            body: fd,
          });
          if (upRes.ok) {
            const upData = await upRes.json();
            thumbnailUrl = upData.url;
          }
        }
      } catch { /* 썸네일 실패는 무시 */ }

      const payload: Record<string, unknown> = { name, mapData: { objects }, isPublic };
      if (thumbnailUrl) payload.thumbnailUrl = thumbnailUrl;
      const body = JSON.stringify(payload);
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };
      const res = savedId
        ? await fetch(`${API}/api/worlds/${savedId}`, { method: 'PATCH', headers, body })
        : await fetch(`${API}/api/worlds`, { method: 'POST', headers, body });
      if (!res.ok) throw new Error(t('saveFailed'));
      const d = await res.json();
      const newId = d.world?.id ?? savedId;
      if (newId) {
        // 방금 저장 플래그 → URL 변경으로 인한 재로드 방지
        justSavedRef.current = newId;
        setSavedId(newId);
        if (newId !== savedId) {
          router.replace(`/studio?id=${newId}`);
        }
      }
      alert(t('saved'));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = objects.find(o => o.id === selectedId);
  const canUndo  = hist.idx > 0;
  const canRedo  = hist.idx < hist.stack.length - 1;

  function openMyWorld(id: string) {
    setMyWorldsOpen(false);
    router.replace(`/studio?id=${id}`);
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0f172a', overflow: 'hidden', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif", position: 'relative' }}>

      {/* ── 좌측 패널 ──────────────────────── */}
      <div style={{
        width: 260,
        background: '#1e293b',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        padding: 16,
        overflowY: 'auto',
        color: '#fff',
        position: isMobile ? 'absolute' : 'relative',
        left: isMobile ? 0 : undefined,
        top: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 220 : undefined,
        transform: isMobile ? (mobilePanelOpen ? 'translateX(0)' : 'translateX(-108%)') : undefined,
        transition: isMobile ? 'transform 180ms ease' : undefined,
        boxShadow: isMobile ? '0 0 0 1px rgba(255,255,255,0.1), 8px 0 30px rgba(2,6,23,0.6)' : undefined,
      }}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setMobilePanelOpen(false)}
              style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 8, width: 32, height: 32, fontWeight: 700 }}
            >
              ×
            </button>
          </div>
        )}
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{t('title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          <button
            onClick={() => setMyWorldsOpen(true)}
            style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(99,102,241,0.24)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            🗺 {t('openMyWorlds')}
          </button>
          <button
            onClick={() => router.replace('/studio')}
            style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(16,185,129,0.22)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            ＋ {t('newWorldDefault')}
          </button>
        </div>

        {loading && (
          <div style={{ padding: 8, background: 'rgba(99,102,241,0.15)', borderRadius: 6, fontSize: 11, marginBottom: 10, color: '#a5b4fc' }}>
            ⏳ {t('saving').replace('…', '')} ...
          </div>
        )}
        {loadError && (
          <div style={{ padding: 8, background: 'rgba(239,68,68,0.15)', borderRadius: 6, fontSize: 11, marginBottom: 10, color: '#fca5a5' }}>
            ⚠️ {loadError}
          </div>
        )}

        {/* Undo/Redo */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          <button onClick={undo} disabled={!canUndo}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none',
              background: canUndo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: canUndo ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11, fontWeight: 600, cursor: canUndo ? 'pointer' : 'default' }}>
            {t('undo')} (Ctrl+Z)
          </button>
          <button onClick={redo} disabled={!canRedo}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none',
              background: canRedo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: canRedo ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11, fontWeight: 600, cursor: canRedo ? 'pointer' : 'default' }}>
            {t('redo')} (Ctrl+Y)
          </button>
        </div>

        {/* 월드 이름 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>{t('worldName')}</div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '7px 10px', outline: 'none' }} />
        </div>

        {/* 도형 추가 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>{t('addShape')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([['cube','📦','shapeCube'],['sphere','⚪','shapeSphere'],['cylinder','🥫','shapeCylinder'],['plane','▭','shapePlane']] as const).map(([kind, icon, labelKey]) => (
              <button key={kind} onClick={() => addPrimitive(kind)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '8px 6px', cursor: 'pointer' }}>
                {icon} {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* 에셋 추가 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('myAssets', { count: myAssets.length })}</div>
            <button onClick={() => setActiveAssetPicker(v => !v)} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
              {activeAssetPicker ? t('closeAssetPicker') : t('addAsset')}
            </button>
          </div>
          {activeAssetPicker && (
            <div style={{ maxHeight: 180, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6 }}>
              {myAssets.filter(a => /\.fbx$/i.test(a.modelUrl)).length === 0
                ? <div style={{ fontSize: 11, opacity: 0.4, padding: 8, textAlign: 'center' }}>{t('noAssets')}<br /><a href="/assets" style={{ color: '#818cf8' }}>/assets</a> {t('uploadAt')}</div>
                : myAssets.filter(a => /\.fbx$/i.test(a.modelUrl)).map(a => (
                    <button key={a.id} onClick={() => addAsset(a)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', fontSize: 11, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 3 }}>
                      📦 {a.name}
                    </button>
                  ))
              }
            </div>
          )}
        </div>

        {/* 변환 모드 + 스냅 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>{t('transformMode')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
            {(['translate','rotate','scale'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ background: mode === m ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, padding: '6px 0', cursor: 'pointer', fontWeight: 600 }}>
                {m === 'translate' ? t('modeTranslate') : m === 'rotate' ? t('modeRotate') : t('modeScale')}
              </button>
            ))}
          </div>
          {/* 그리드 스냅 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setSnapEnabled(v => !v)}
              style={{ flex: 1, background: snapEnabled ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${snapEnabled ? '#34d399' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: snapEnabled ? '#34d399' : 'rgba(255,255,255,0.45)', fontSize: 10, padding: '5px 0', cursor: 'pointer', fontWeight: 600 }}>
              {snapEnabled ? '⊞ 스냅 ON' : '⊟ 스냅 OFF'}
            </button>
            {snapEnabled && (
              <select value={snapSize} onChange={e => setSnapSize(Number(e.target.value))}
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontSize: 10, padding: '4px 6px', cursor: 'pointer' }}>
                {[0.1, 0.25, 0.5, 1, 2].map(v => <option key={v} value={v}>{v}m</option>)}
              </select>
            )}
          </div>
        </div>

        {/* 씬 오브젝트 목록 */}
        {objects.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>씬 오브젝트 ({objects.length})</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {objects.map((obj, i) => {
                const isSelected = obj.id === selectedId;
                return (
                  <div key={obj.id}
                    onClick={() => { if (editingLabelId !== obj.id) setSelectedId(isSelected ? null : obj.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: isSelected ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isSelected ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{KIND_ICONS[obj.kind] ?? '❓'}</span>
                    {editingLabelId === obj.id ? (
                      <input
                        autoFocus
                        value={editingLabelValue}
                        onChange={e => setEditingLabelValue(e.target.value)}
                        onBlur={() => {
                          const val = editingLabelValue.trim();
                          if (val) setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, label: val } : o));
                          setEditingLabelId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') { setEditingLabelId(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.4)',
                          border: '1px solid #6366f1', borderRadius: 4, color: '#fff',
                          fontSize: 11, padding: '1px 5px', outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setEditingLabelId(obj.id);
                          setEditingLabelValue(obj.label || `${KIND_LABELS[obj.kind] ?? obj.kind} ${i + 1}`);
                        }}
                        title="더블클릭하여 이름 변경"
                        style={{ flex: 1, fontSize: 11, fontWeight: isSelected ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSelected ? '#a5b4fc' : '#fff' }}>
                        {obj.label || `${KIND_LABELS[obj.kind] ?? obj.kind} ${i + 1}`}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, locked: !o.locked } : o)); }}
                      style={{ background: 'none', border: 'none', color: obj.locked ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontSize: 11, cursor: 'pointer', flexShrink: 0, padding: 0, lineHeight: 1 }}
                      title={obj.locked ? '잠금 해제' : '잠금'}>
                      {obj.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setObjects(prev => { const next = prev.filter(o => o.id !== obj.id); pushHistory(next); return next; }); if (selectedId === obj.id) setSelectedId(null); }}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer', flexShrink: 0, padding: 0, lineHeight: 1 }}
                      title="삭제">×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 선택된 오브젝트 — 변환 값 표시 */}
        {selected && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(99,102,241,0.1)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10, fontWeight: 600 }}>{t('selectedKind', { kind: selected.kind })}</div>

            <AxisInputRow
              label={mode === 'translate' ? t('position') : mode === 'rotate' ? t('rotation') : t('scale')}
              values={
                mode === 'translate' ? selected.position :
                mode === 'rotate'    ? selected.rotation.map(r => Math.round(r * 180 / Math.PI)) as [number,number,number] :
                                       selected.scale
              }
              step={mode === 'rotate' ? 1 : 0.1}
              min={mode === 'scale' ? 0.01 : undefined}
              onChange={(axisIdx, v) => {
                if (mode === 'translate') updateAxis('position', axisIdx, v);
                else if (mode === 'rotate') updateAxis('rotation', axisIdx, v * Math.PI / 180);
                else updateAxis('scale', axisIdx, Math.max(0.01, v));
              }}
              onCommit={() => pushHistory(objects)}
            />

            {selected.kind !== 'asset' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{t('color')}</div>
                <input type="color" value={selected.color}
                  onChange={e => updateColor(selected.id, e.target.value)}
                  onBlur={() => pushHistory(objects)}
                  style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
              </div>
            )}

            {/* 머티리얼 프리셋 */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{t('material')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {([
                  ['default',  t('matDefault')],
                  ['wood',     t('matWood')],
                  ['metal',    t('matMetal')],
                  ['stone',    t('matStone')],
                  ['glass',    t('matGlass')],
                  ['plastic',  t('matPlastic')],
                  ['emissive', t('matEmissive')],
                ] as const).map(([key, label]) => {
                  const active = (selected.material ?? 'default') === key;
                  return (
                    <button key={key}
                      onClick={() => { updateMaterialField('material', key); pushHistory(objects); }}
                      style={{
                        background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)',
                        border: 'none', borderRadius: 5, color: '#fff', fontSize: 10,
                        padding: '5px 4px', cursor: 'pointer', textAlign: 'left',
                      }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 머티리얼 색상 (default 아닐 때만) */}
            {selected.material && selected.material !== 'default' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{t('materialColor')}</div>
                <input type="color" value={selected.materialColor || '#ffffff'}
                  onChange={e => updateMaterialField('materialColor', e.target.value)}
                  onBlur={() => pushHistory(objects)}
                  style={{ width: '100%', height: 24, border: 'none', borderRadius: 5, padding: 0, cursor: 'pointer' }} />
              </div>
            )}

            {/* 텍스처 */}
            <div style={{ marginBottom: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{t('texture')}</div>
              {([
                ['albedo',    t('texAlbedo'),    selected.textureAlbedo,    'textureAlbedo'],
                ['normal',    t('texNormal'),    selected.textureNormal,    'textureNormal'],
                ['roughness', t('texRoughness'), selected.textureRoughness, 'textureRoughness'],
              ] as const).map(([slot, label, value, field]) => (
                <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, opacity: 0.55, width: 56 }}>{label}</span>
                  {value ? (
                    <>
                      <div style={{ width: 22, height: 22, background: `url(${value}) center/cover`, borderRadius: 3 }} />
                      <button onClick={() => { updateMaterialField(field, undefined); pushHistory(objects); }}
                        style={{ flex: 1, fontSize: 9, padding: '3px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
                        {t('texRemove')}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setTexPicker(slot)}
                      style={{ flex: 1, fontSize: 10, padding: '3px', background: 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 3, cursor: 'pointer' }}>
                      {t('texChoose')}
                    </button>
                  )}
                </div>
              ))}

              {/* 타일링 (텍스처 있을 때만) */}
              {(selected.textureAlbedo || selected.textureNormal || selected.textureRoughness) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
                  <label style={{ fontSize: 10, opacity: 0.55, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {t('texTilingX')}
                    <input type="number" step={0.5} min={0.1}
                      value={selected.textureTilingX ?? 1}
                      onChange={e => updateMaterialField('textureTilingX', Number(e.target.value))}
                      onBlur={() => pushHistory(objects)}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 3, outline: 'none' }} />
                  </label>
                  <label style={{ fontSize: 10, opacity: 0.55, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {t('texTilingY')}
                    <input type="number" step={0.5} min={0.1}
                      value={selected.textureTilingY ?? 1}
                      onChange={e => updateMaterialField('textureTilingY', Number(e.target.value))}
                      onBlur={() => pushHistory(objects)}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 3, outline: 'none' }} />
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={duplicate}
                style={{ flex: 1, background: 'rgba(99,102,241,0.2)', border: 'none', color: '#a5b4fc', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                복제 (Ctrl+D)
              </button>
              <button onClick={deleteSelected}
                style={{ flex: 1, background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                {t('delete')}
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 16 }}>
          {t('stats', { count: objects.length, idx: hist.idx + 1, total: hist.stack.length })}
        </div>

        {/* 조명 설정 */}
        <div style={{ marginBottom: 10 }}>
          <button type="button" onClick={() => setLightPanelOpen(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '6px 10px', cursor: 'pointer', fontWeight: 600 }}>
            🌤 조명 설정 {lightPanelOpen ? '▲' : '▼'}
          </button>
          {lightPanelOpen && (
            <div style={{ padding: '10px 6px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                환경광 {lightAmbient.toFixed(1)}
                <input type="range" min={0} max={2} step={0.1} value={lightAmbient}
                  onChange={e => setLightAmbient(Number(e.target.value))}
                  style={{ accentColor: '#6366f1' }} />
              </label>
              <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                직사광 {lightDir.toFixed(1)}
                <input type="range" min={0} max={4} step={0.1} value={lightDir}
                  onChange={e => setLightDir(Number(e.target.value))}
                  style={{ accentColor: '#6366f1' }} />
              </label>
              <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={skyEnabled} onChange={e => setSkyEnabled(e.target.checked)} />
                하늘(Sky) 표시
              </label>
            </div>
          )}
        </div>

        {/* 공개/비공개 토글 */}
        <button
          type="button"
          onClick={() => setIsPublic(v => !v)}
          style={{
            width: '100%', marginBottom: 6, padding: '8px', borderRadius: 8, border: `1px solid ${isPublic ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.12)'}`,
            background: isPublic ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
            color: isPublic ? '#34d399' : 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
          }}>
          {isPublic ? '🌍 공개 — 허브에서 탐색 가능' : '🔒 비공개 — 나만 접근 가능'}
        </button>

        <button onClick={save} disabled={saving}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, marginBottom: 8 }}>
          {saving ? t('saving') : savedId ? t('update') : t('save')}
        </button>
        {savedId && (
          <a href={`/world?id=${savedId}`} target="_blank" rel="noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            {t('playTest')}
          </a>
        )}
      </div>
      {isMobile && mobilePanelOpen && (
        <div
          onClick={() => setMobilePanelOpen(false)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.5)', zIndex: 210 }}
        />
      )}

      {myWorldsOpen && (
        <div
          onClick={() => setMyWorldsOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.75)', backdropFilter: 'blur(6px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(1080px, 96vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))', color: '#fff' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t('openMyWorlds')}</div>
              <button
                onClick={() => setMyWorldsOpen(false)}
                style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 14, overflowY: 'auto', maxHeight: 'calc(90vh - 72px)' }}>
              {myWorldsLoading ? (
                <div style={{ opacity: 0.7, fontSize: 13 }}>{t('saving')}</div>
              ) : myWorlds.length === 0 ? (
                <div style={{ opacity: 0.7, fontSize: 13 }}>{t('noMyWorlds')}</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {myWorlds.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => openMyWorld(w.id)}
                      style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, overflow: 'hidden', background: savedId === w.id ? 'rgba(99,102,241,0.28)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', color: '#fff', textAlign: 'left' }}
                    >
                      <div style={{ height: 110, background: w.thumbnailUrl ? `url(${w.thumbnailUrl}) center/cover` : 'linear-gradient(135deg,#1d4ed8,#0f766e)' }} />
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
                        {!!w.description && <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.35, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.description}</div>}
                        <div style={{ fontSize: 10, opacity: 0.6 }}>{w.updatedAt ? new Date(w.updatedAt).toLocaleString() : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 3D 뷰포트 ─────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }} onContextMenu={(e) => e.preventDefault()}>
        <Canvas
          shadows
          camera={{ position: [8, 8, 8], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onPointerMissed={() => { if (!isGizmoActive()) setSelectedId(null); }}
        >
          <ambientLight intensity={lightAmbient} />
          <directionalLight position={[20, 30, 10]} intensity={lightDir} castShadow shadow-mapSize={[2048, 2048]} />
          {skyEnabled && <Sky sunPosition={[20, 10, 10]} />}
          {/* 금속·유리 머티리얼이 새까맣게 보이지 않도록 환경맵 제공 */}
          <Environment preset="city" />

          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} infiniteGrid />

          {objects.map(obj => (
            <Mesh3D key={obj.id} obj={obj}
              selected={obj.id === selectedId}
              onClick={() => setSelectedId(obj.id)}
              assetConfig={obj.kind === 'asset' && obj.assetUrl
                ? getAssetMaterialConfig(myAssets.find(a => a.modelUrl === obj.assetUrl))
                : undefined} />
          ))}

          <SelectedTransform
            targetId={objects.find(o => o.id === selectedId)?.locked ? null : selectedId}
            mode={mode}
            onChange={updateObjectTransform}
            onDragEnd={() => pushHistory(objects)}
            snapTranslate={snapEnabled ? snapSize : null}
            snapRotate={snapEnabled ? (Math.PI / 12) : null}
            snapScale={snapEnabled ? 0.1 : null}
          />

          <OrbitControls
            ref={orbitRef}
            enabled={orbitEnabled}
            makeDefault
            enableZoom={true}
            mouseButtons={{
              LEFT:   undefined as unknown as THREE.MOUSE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT:  THREE.MOUSE.ROTATE,
            }}
          />
          <DraggingDetector setOrbitEnabled={setOrbitEnabled} />
          <WasdFlyCamera orbitRef={orbitRef} />
          <CanvasCapture captureFnRef={captureFnRef} />
        </Canvas>

        {/* 단축키 힌트 */}
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', pointerEvents: 'none' }}>
          {[
            ['G', '이동'], ['R', '회전'], ['S', '스케일'],
            ['WASD', '카메라'], ['QE', '상승/하강'], ['Shift', '가속'],
            ['Ctrl+D', '복제'], ['Ctrl+Z', '실행취소'], ['Del', '삭제'],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 7px', backdropFilter: 'blur(6px)' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 700 }}>{key}</kbd>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{desc}</span>
            </div>
          ))}
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              width: 40,
              height: 40,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(2,6,23,0.55)',
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
              zIndex: 230,
            }}
          >
            ☰
          </button>
        )}

        {texPicker && (
          <TexturePickerModal
            assets={myAssets}
            title={t('texPickerTitle')}
            onClose={() => setTexPicker(null)}
            onSelect={(url) => {
              const field =
                texPicker === 'albedo'    ? 'textureAlbedo' :
                texPicker === 'normal'    ? 'textureNormal' :
                                            'textureRoughness';
              updateMaterialField(field, url);
              pushHistory(objects);
              setTexPicker(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
