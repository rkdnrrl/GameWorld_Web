'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter, useSearchParams } from 'next/navigation';
import { session } from '@/lib/api';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitRef = any;

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 데이터 모델 ───────────────────────────── */
type ObjectKind = 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset';

interface MapObject {
  id: string;
  kind: ObjectKind;
  assetUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  color:    string;
}

interface Asset {
  id: string;
  name: string;
  modelUrl: string;
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

/* ── 단일 오브젝트 렌더링 ────────────────── */
function Mesh3D({ obj, selected, onClick }: {
  obj: MapObject;
  selected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const handle = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); };

  if (obj.kind === 'asset') return <AssetMesh obj={obj} selected={selected} onClick={handle} />;

  const geometry =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;
  return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale}
      onClick={handle} castShadow receiveShadow userData={{ id: obj.id }}>
      {geometry}
      <meshStandardMaterial color={obj.color} side={obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide} />
      {selected && <Outlines thickness={3} color="#22d3ee" screenspace />}
    </mesh>
  );
}

function AssetMesh({ obj, selected, onClick }: {
  obj: MapObject;
  selected: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);

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
        fbx.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
        setModel(fbx);
      });
    });
    return () => { cancelled = true; };
  }, [obj.assetUrl]);

  if (!model) return null;
  return (
    <group position={obj.position} rotation={obj.rotation} scale={obj.scale}
      onClick={onClick} userData={{ id: obj.id }}>
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
  if (!targetId) return null;

  let actualTarget: THREE.Object3D | null = null;
  scene.traverse(o => { if (o.userData?.id === targetId) actualTarget = o; });
  if (!actualTarget) return null;

  return (
    <TransformControls
      object={actualTarget}
      mode={mode}
      onObjectChange={() => {
        const o = actualTarget!;
        onChange(targetId, {
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
export default function StudioCanvas() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editingId    = searchParams.get('id') || null;

  const [objects, setObjects]       = useState<MapObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode]             = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [name, setName]             = useState('새 월드');
  const [savedId, setSavedId]       = useState<string | null>(editingId);
  const [saving, setSaving]         = useState(false);
  const [myAssets, setMyAssets]     = useState<Asset[]>([]);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [activeAssetPicker, setActiveAssetPicker] = useState(false);
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
  useEffect(() => {
    if (!editingId) return;
    fetch(`${API}/api/worlds/${editingId}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.world) return;
        setName(d.world.name);
        const objs = d.world.mapData?.objects || [];
        setObjects(objs);
        setHist({ stack: [clone(objs)], idx: 0 });
        setSavedId(d.world.id);
      })
      .catch(() => {});
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
      if (!res.ok) throw new Error('저장 실패');
      const d = await res.json();
      const newId = d.world?.id ?? savedId;
      if (newId && newId !== savedId) {
        setSavedId(newId);
        router.replace(`/studio?id=${newId}`);
      }
      alert('저장됨');
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
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>🛠️ 스튜디오</h2>

        {/* Undo/Redo */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          <button onClick={undo} disabled={!canUndo}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none',
              background: canUndo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: canUndo ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11, fontWeight: 600, cursor: canUndo ? 'pointer' : 'default' }}>
            ↶ 되돌리기 (Ctrl+Z)
          </button>
          <button onClick={redo} disabled={!canRedo}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none',
              background: canRedo ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: canRedo ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 11, fontWeight: 600, cursor: canRedo ? 'pointer' : 'default' }}>
            ↷ 다시 (Ctrl+Y)
          </button>
        </div>

        {/* 월드 이름 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>월드 이름</div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '7px 10px', outline: 'none' }} />
        </div>

        {/* 도형 추가 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>도형 추가</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([['cube','📦','큐브'],['sphere','⚪','구'],['cylinder','🥫','원기둥'],['plane','▭','평면']] as const).map(([kind, icon, label]) => (
              <button key={kind} onClick={() => addPrimitive(kind)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '8px 6px', cursor: 'pointer' }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {/* 에셋 추가 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>내 FBX 에셋 ({myAssets.length})</div>
            <button onClick={() => setActiveAssetPicker(v => !v)} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
              {activeAssetPicker ? '닫기' : '+ 추가'}
            </button>
          </div>
          {activeAssetPicker && (
            <div style={{ maxHeight: 180, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6 }}>
              {myAssets.length === 0
                ? <div style={{ fontSize: 11, opacity: 0.4, padding: 8, textAlign: 'center' }}>업로드된 FBX 없음<br /><a href="/assets" style={{ color: '#818cf8' }}>/assets</a> 에서 업로드</div>
                : myAssets.map(a => (
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
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>변환 모드 (G/R/S)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            {(['translate','rotate','scale'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ background: mode === m ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, padding: '6px 0', cursor: 'pointer', fontWeight: 600 }}>
                {m === 'translate' ? '이동' : m === 'rotate' ? '회전' : '크기'}
              </button>
            ))}
          </div>
        </div>

        {/* 선택된 오브젝트 — 변환 값 표시 */}
        {selected && (
          <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(99,102,241,0.1)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 10, fontWeight: 600 }}>선택됨: {selected.kind}</div>

            {/* 현재 모드에 해당하는 값만 입력창으로 표시 */}
            <AxisInputRow
              label={mode === 'translate' ? '위치 (m)' : mode === 'rotate' ? '회전 (°)' : '크기 (m)'}
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

            {/* 색상 (도형만) */}
            {selected.kind !== 'asset' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>색상</div>
                <input type="color" value={selected.color}
                  onChange={e => updateColor(selected.id, e.target.value)}
                  onBlur={() => pushHistory(objects)}
                  style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
              </div>
            )}

            <button onClick={deleteSelected}
              style={{ width: '100%', background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              🗑️ 삭제 (Del)
            </button>
          </div>
        )}

        <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 16 }}>
          오브젝트 {objects.length}개 · 히스토리 {hist.idx + 1}/{hist.stack.length}
        </div>

        <button onClick={save} disabled={saving}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#10b981,#06b6d4)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, marginBottom: 8 }}>
          {saving ? '저장 중…' : savedId ? '💾 업데이트' : '💾 저장'}
        </button>
        {savedId && (
          <a href={`/world?id=${savedId}`} target="_blank" rel="noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            ▶ 플레이 테스트
          </a>
        )}
      </div>

      {/* ── 3D 뷰포트 ─────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          shadows
          camera={{ position: [8, 8, 8], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[20, 30, 10]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
          <Sky sunPosition={[20, 10, 10]} />

          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} infiniteGrid />

          {objects.map(obj => (
            <Mesh3D key={obj.id} obj={obj}
              selected={obj.id === selectedId}
              onClick={() => setSelectedId(obj.id)} />
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
              LEFT:   THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT:  THREE.MOUSE.PAN,
            }}
          />
          <DraggingDetector setOrbitEnabled={setOrbitEnabled} />
        </Canvas>

        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 12, backdropFilter: 'blur(8px)' }}>
          좌클릭 드래그: 회전 · 우클릭 드래그: 이동 · 휠: 확대/축소 · 클릭: 선택 · Del: 삭제 · Ctrl+Z/Y: 되돌리기
        </div>
      </div>
    </div>
  );
}
