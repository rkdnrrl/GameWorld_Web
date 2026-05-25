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
  materialConfig?: any;
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
  // onPointerDown 으로 선택 — 누른 순간의 대상이 확정 (드래그 후 다른 오브젝트 위에서 떼도 원래 것 유지)
  // 좌클릭(button=0)만 처리, 우클릭(카메라 회전)/중클릭은 무시
  // TransformControls 화살표/링 위에 마우스가 있을 땐 무시 (뒤쪽 메시 잘못 선택 방지)
  const handle = (e: { stopPropagation: () => void; button?: number }) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (isGizmoActive()) return;
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
function SelectedTransform({ targetId, mode, onChange, onDragEnd }: {
  targetId: string | null;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => void;
  onDragEnd: () => void;
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
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [activeAssetPicker, setActiveAssetPicker] = useState(false);
  const [texPicker, setTexPicker] = useState<null | 'albedo' | 'normal' | 'roughness'>(null);
  const orbitRef = useRef<OrbitRef | null>(null);

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

  function addPrimitive(kind: 'cube' | 'sphere' | 'cylinder' | 'plane') {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => {
      const next = [...prev, {
        id, kind,
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

  function addAsset(asset: Asset) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'asset',
        assetUrl: asset.modelUrl,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#fff',
        // 에셋의 머티리얼 설정을 자동 적용
        ...(asset.materialConfig || {}),
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
      const body = JSON.stringify({ name, mapData: { objects } });
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

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0f172a', overflow: 'hidden', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>

      {/* ── 좌측 패널 ──────────────────────── */}
      <div style={{ width: 260, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.08)', padding: 16, overflowY: 'auto', color: '#fff' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{t('title')}</h2>

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

        {/* 변환 모드 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>{t('transformMode')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            {(['translate','rotate','scale'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ background: mode === m ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, padding: '6px 0', cursor: 'pointer', fontWeight: 600 }}>
                {m === 'translate' ? t('modeTranslate') : m === 'rotate' ? t('modeRotate') : t('modeScale')}
              </button>
            ))}
          </div>
        </div>

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

            <button onClick={deleteSelected}
              style={{ width: '100%', background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {t('delete')}
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 16 }}>
          {t('stats', { count: objects.length, idx: hist.idx + 1, total: hist.stack.length })}
        </div>

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

      {/* ── 3D 뷰포트 ─────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }} onContextMenu={(e) => e.preventDefault()}>
        <Canvas
          shadows
          camera={{ position: [8, 8, 8], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onPointerMissed={() => { if (!isGizmoActive()) setSelectedId(null); }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[20, 30, 10]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
          <Sky sunPosition={[20, 10, 10]} />
          {/* 금속·유리 머티리얼이 새까맣게 보이지 않도록 환경맵 제공 */}
          <Environment preset="city" />

          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} infiniteGrid />

          {objects.map(obj => (
            <Mesh3D key={obj.id} obj={obj}
              selected={obj.id === selectedId}
              onClick={() => setSelectedId(obj.id)}
              assetConfig={obj.kind === 'asset' && obj.assetUrl
                ? myAssets.find(a => a.modelUrl === obj.assetUrl)?.materialConfig
                : undefined} />
          ))}

          <SelectedTransform
            targetId={selectedId}
            mode={mode}
            onChange={updateObjectTransform}
            onDragEnd={() => pushHistory(objects)}
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
        </Canvas>

        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 12, backdropFilter: 'blur(8px)' }}>
          {t('hudHint')}
        </div>

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
