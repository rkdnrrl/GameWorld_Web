'use client';
import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter, useSearchParams } from 'next/navigation';
import { session } from '@/lib/api';

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

/* ── 단일 오브젝트 렌더링 ────────────────── */
function Mesh3D({ obj, onClick }: {
  obj: MapObject;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const handle = (e: React.MouseEvent) => { e.stopPropagation(); onClick(e); };

  if (obj.kind === 'cube') return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handle} castShadow receiveShadow userData={{ id: obj.id }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={obj.color} />
    </mesh>
  );
  if (obj.kind === 'sphere') return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handle} castShadow userData={{ id: obj.id }}>
      <sphereGeometry args={[0.5, 24, 16]} />
      <meshStandardMaterial color={obj.color} />
    </mesh>
  );
  if (obj.kind === 'cylinder') return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handle} castShadow userData={{ id: obj.id }}>
      <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
      <meshStandardMaterial color={obj.color} />
    </mesh>
  );
  if (obj.kind === 'plane') return (
    <mesh ref={ref} position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handle} receiveShadow userData={{ id: obj.id }}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={obj.color} side={THREE.DoubleSide} />
    </mesh>
  );
  // FBX 에셋
  return <AssetMesh obj={obj} onClick={handle} />;
}

function AssetMesh({ obj, onClick }: { obj: MapObject; onClick: (e: React.MouseEvent) => void }) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!obj.assetUrl) return;
    let cancelled = false;
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(obj.assetUrl!, (fbx) => {
        if (cancelled) return;
        // 1m 기준으로 정규화
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
    <group position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={onClick} userData={{ id: obj.id }}>
      <primitive object={model} />
    </group>
  );
}

/* ── 변환 컨트롤 (선택된 오브젝트 조작) ── */
function SelectedTransform({ targetId, mode, onChange }: {
  targetId: string | null;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => void;
}) {
  const { scene } = useThree();
  if (!targetId) return null;
  const target = scene.getObjectByProperty('uuid', '') ?? scene.children.find(c => {
    let found: THREE.Object3D | null = null;
    c.traverse(o => { if (o.userData?.id === targetId) found = o; });
    return found;
  }) as THREE.Object3D | undefined;

  // userData.id로 직접 찾기
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
    />
  );
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

  const token = () => session.getToken() || '';

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
        setObjects(d.world.mapData?.objects || []);
        setSavedId(d.world.id);
      })
      .catch(() => {});
  }, [editingId]);

  /* 단축키: Delete 키로 선택된 오브젝트 삭제, G/R/S로 모드 전환 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        setObjects(prev => prev.filter(o => o.id !== selectedId));
        setSelectedId(null);
      } else if (e.key === 'g') setMode('translate');
      else if (e.key === 'r') setMode('rotate');
      else if (e.key === 's') setMode('scale');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  /* 도형 추가 */
  function addPrimitive(kind: 'cube' | 'sphere' | 'cylinder' | 'plane') {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => [...prev, {
      id, kind,
      position: [0, kind === 'plane' ? 0.01 : 0.5, 0],
      rotation: kind === 'plane' ? [-Math.PI / 2, 0, 0] : [0, 0, 0],
      scale:    kind === 'plane' ? [5, 5, 1] : [1, 1, 1],
      color:    '#94a3b8',
    }]);
    setSelectedId(id);
  }

  /* 에셋 추가 */
  function addAsset(asset: Asset) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => [...prev, {
      id, kind: 'asset',
      assetUrl: asset.modelUrl,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale:    [1, 1, 1],
      color:    '#fff',
    }]);
    setSelectedId(id);
    setActiveAssetPicker(false);
  }

  /* 오브젝트 변환 업데이트 */
  function updateObjectTransform(id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, position: t.p, rotation: t.r, scale: t.s } : o));
  }

  /* 색상 변경 */
  function updateColor(id: string, color: string) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, color } : o));
  }

  /* 저장 */
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ name, mapData: { objects } });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` };
      let res: Response;
      if (savedId) {
        res = await fetch(`${API}/api/worlds/${savedId}`, { method: 'PATCH', headers, body });
      } else {
        res = await fetch(`${API}/api/worlds`, { method: 'POST', headers, body });
      }
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

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#0f172a', overflow: 'hidden', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>

      {/* ── 좌측 패널 ──────────────────────── */}
      <div style={{ width: 240, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.08)', padding: 16, overflowY: 'auto', color: '#fff' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>🛠️ 스튜디오</h2>

        {/* 월드 이름 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>월드 이름</div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '7px 10px', outline: 'none' }} />
        </div>

        {/* 도형 추가 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>도형 추가</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {([
              ['cube','📦','큐브'],
              ['sphere','⚪','구'],
              ['cylinder','🥫','원기둥'],
              ['plane','▭','평면'],
            ] as const).map(([kind, icon, label]) => (
              <button key={kind} onClick={() => addPrimitive(kind)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '8px 6px', cursor: 'pointer' }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {/* 에셋 추가 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>내 FBX 에셋 ({myAssets.length})</div>
            <button onClick={() => setActiveAssetPicker(v => !v)} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 11, cursor: 'pointer' }}>
              {activeAssetPicker ? '닫기' : '+ 추가'}
            </button>
          </div>
          {activeAssetPicker && (
            <div style={{ maxHeight: 200, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6 }}>
              {myAssets.length === 0
                ? <div style={{ fontSize: 11, opacity: 0.4, padding: 8, textAlign: 'center' }}>업로드된 FBX 없음<br/><a href="/assets" style={{ color: '#818cf8' }}>/assets</a> 에서 업로드</div>
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
        <div style={{ marginBottom: 20 }}>
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

        {/* 선택된 오브젝트 */}
        {selected && (
          <div style={{ marginBottom: 20, padding: '10px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>선택됨: {selected.kind}</div>
            {selected.kind !== 'asset' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>색상</div>
                <input type="color" value={selected.color}
                  onChange={e => updateColor(selected.id, e.target.value)}
                  style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
              </div>
            )}
            <button onClick={() => { setObjects(prev => prev.filter(o => o.id !== selected.id)); setSelectedId(null); }}
              style={{ width: '100%', background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '6px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              🗑️ 삭제 (Del)
            </button>
          </div>
        )}

        {/* 통계 */}
        <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 16 }}>
          오브젝트 {objects.length}개
        </div>

        {/* 저장 / 플레이 */}
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

          {/* 바닥 그리드 */}
          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} infiniteGrid />

          {/* 보이지 않는 큰 바닥 — 클릭 빈 곳 처리 */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color="#1e293b" transparent opacity={0.0} />
          </mesh>

          {/* 오브젝트들 */}
          {objects.map(obj => (
            <Mesh3D key={obj.id} obj={obj} onClick={() => setSelectedId(obj.id)} />
          ))}

          {/* 변환 컨트롤 */}
          <SelectedTransform
            targetId={selectedId}
            mode={mode}
            onChange={updateObjectTransform}
          />

          {/* 카메라 컨트롤 (TransformControls 사용 중엔 비활성) */}
          <OrbitControls
            enabled={orbitEnabled}
            makeDefault
            onStart={() => setOrbitEnabled(true)}
          />

          {/* TransformControls 드래그 중 OrbitControls 끄기 */}
          <DraggingDetector setOrbitEnabled={setOrbitEnabled} />
        </Canvas>

        {/* HUD */}
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: '6px 16px', color: '#fff', fontSize: 12, backdropFilter: 'blur(8px)' }}>
          마우스 드래그: 카메라 회전 · 우클릭: 이동 · 휠: 줌 · 클릭: 선택 · Del: 삭제
        </div>
      </div>
    </div>
  );
}

/* TransformControls 드래그 중 OrbitControls 비활성화 */
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
