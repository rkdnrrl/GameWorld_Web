'use client';
import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRouter } from '@/i18n/navigation';
import { session } from '@/lib/api';
import * as THREE from 'three';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 에셋 타입 ─────────────────────────────── */
interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
}

/* ── 자동 정규화 (1.8m 기준) ────────────── */
function autoNormalize(obj: THREE.Object3D, targetHeight = 1.8) {
  const box  = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const h    = Math.max(size.x, size.y, size.z);
  if (h > 0) obj.scale.multiplyScalar(targetHeight / h);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;
}

/* ── 커스텀 모델 프리뷰 (명령형 로드) ───── */
function CustomPreview({ url, userScale, rotX }: { url: string; userScale: number; rotX: number }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const g = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const ext = url.split('.').pop()?.toLowerCase();

    const onLoaded = (loaded: THREE.Object3D) => {
      if (cancelled) return;
      autoNormalize(loaded, 1.8);
      setObj(loaded);
    };

    if (ext === 'glb' || ext === 'gltf') {
      import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
        new GLTFLoader().load(url, (gltf) => onLoaded(gltf.scene.clone(true)));
      });
    } else {
      import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
        new FBXLoader().load(url, onLoaded);
      });
    }
    return () => { cancelled = true; };
  }, [url]);

  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });

  if (!obj) return null;
  return (
    <group ref={g} position={[0, -1, 0]}>
      <primitive object={obj} scale={userScale} rotation={[rotX, 0, 0]} />
    </group>
  );
}

/* ── 블록 캐릭터 프리뷰 ──────────────────── */
function BlockPreview({ appearance }: { appearance: Record<string, string> }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });
  const body = appearance.bodyColor || '#4f46e5';
  const skin = appearance.skinColor || '#fcd9b0';
  const hair = appearance.hairColor || '#1e293b';
  const pants = appearance.pantsColor || '#1e293b';
  return (
    <group ref={g} position={[0, -1, 0]}>
      <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.55, 0.65, 0.28]} /><meshStandardMaterial color={body} /></mesh>
      <mesh position={[0, 0.95, 0]}><boxGeometry args={[0.48, 0.48, 0.48]} /><meshStandardMaterial color={skin} /></mesh>
      <mesh position={[0, 1.22, 0]}><boxGeometry args={[0.50, 0.14, 0.50]} /><meshStandardMaterial color={hair} /></mesh>
      <mesh position={[0.12, 0.97, 0.25]}><boxGeometry args={[0.09,0.09,0.02]}/><meshStandardMaterial color="#111"/></mesh>
      <mesh position={[-0.12, 0.97, 0.25]}><boxGeometry args={[0.09,0.09,0.02]}/><meshStandardMaterial color="#111"/></mesh>
      <mesh position={[-0.40, 0.32, 0]}><boxGeometry args={[0.22,0.60,0.22]}/><meshStandardMaterial color={body}/></mesh>
      <mesh position={[0.40, 0.32, 0]}><boxGeometry args={[0.22,0.60,0.22]}/><meshStandardMaterial color={body}/></mesh>
      <mesh position={[-0.15, -0.28, 0]}><boxGeometry args={[0.23,0.60,0.23]}/><meshStandardMaterial color={pants}/></mesh>
      <mesh position={[0.15, -0.28, 0]}><boxGeometry args={[0.23,0.60,0.23]}/><meshStandardMaterial color={pants}/></mesh>
    </group>
  );
}

/* ── 색상 프리셋 ─────────────────────────── */
const BODY_COLORS  = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#ffffff'];
const SKIN_COLORS  = ['#fcd9b0','#f5c28a','#d4956a','#a0674a','#7d4a2f','#ffe0bd','#f1c27d','#e0ac69'];
const HAIR_COLORS  = ['#1e293b','#f59e0b','#dc2626','#7c3aed','#f97316','#64748b','#ffffff','#4ade80'];
const PANTS_COLORS = ['#1e293b','#1e40af','#166534','#7f1d1d','#374151','#713f12','#111827','#e2e8f0'];

function ColorPicker({ label, colors, value, onChange }: {
  label: string; colors: string[]; value: string; onChange: (c: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {colors.map(c => (
          <button key={c} onClick={() => onChange(c)} style={{
            width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
            cursor: 'pointer',
            outline: value === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.12)',
            outlineOffset: 2, transform: value === c ? 'scale(1.15)' : 'scale(1)',
            transition: 'transform .1s',
          }} />
        ))}
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
      </div>
    </div>
  );
}

/* ── 에셋 선택 모달 ──────────────────────── */
function AssetPickerModal({ onSelect, onClose }: {
  onSelect: (asset: Asset) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/assets/my`, {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    })
      .then(r => r.json())
      .then(d => setAssets(d.assets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
        padding: 24, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>📦 에셋 선택</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {loading && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24 }}>로딩 중…</div>}

        {!loading && assets.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 }}>
            업로드된 에셋이 없습니다.<br />
            <a href="/assets" style={{ color: '#818cf8' }}>/assets 페이지</a>에서 FBX를 먼저 업로드하세요.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, overflowY: 'auto' }}>
          {assets.map(a => {
            const ext = a.modelUrl.split('.').pop()?.toUpperCase() || '';
            const extColor: Record<string, string> = { FBX: '#f59e0b', GLB: '#10b981', GLTF: '#3b82f6', OBJ: '#8b5cf6' };
            return (
              <button key={a.id} onClick={() => onSelect(a)} style={{
                background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)',
                borderRadius: 12, cursor: 'pointer', overflow: 'hidden', padding: 0,
                transition: 'border-color .15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div style={{
                  width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                }}>
                  {a.thumbnailUrl
                    ? <img src={a.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 32 }}>📦</span>
                  }
                  <span style={{
                    position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800,
                    background: extColor[ext] || '#64748b', color: '#fff',
                    padding: '2px 5px', borderRadius: 3,
                  }}>{ext}</span>
                </div>
                <div style={{ padding: '6px 8px', textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────── */
export default function CharacterPage() {
  const router = useRouter();
  const [name, setName]           = useState('');
  const [appearance, setAppearance] = useState<Record<string, string>>({
    bodyColor: '#4f46e5', skinColor: '#fcd9b0',
    hairColor: '#1e293b', pantsColor: '#1e293b',
  });
  const [modelUrl, setModelUrl]     = useState('');
  const [modelScale, setModelScale] = useState(0.01);
  const [modelRotX, setModelRotX]   = useState(-Math.PI / 2); // FBX 기본 Z-up 보정
  const [modelName, setModelName]   = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const setColor = (key: string) => (val: string) =>
    setAppearance(prev => ({ ...prev, [key]: val }));

  const handleSelectAsset = (asset: Asset) => {
    setModelUrl(asset.modelUrl);
    setModelName(asset.name);
    setShowPicker(false);
    const ext = asset.modelUrl.split('.').pop()?.toLowerCase();
    setModelScale(ext === 'glb' || ext === 'gltf' ? 1 : 0.01);
    setModelRotX(ext === 'fbx' ? -Math.PI / 2 : 0); // FBX Z-up 기본 보정
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    const fullAppearance = modelUrl
      ? { ...appearance, modelUrl, modelScale, fbxRotX: modelRotX }
      : appearance;
    try {
      const token = session.getToken();
      const res = await fetch(`${API}/api/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), appearance: fullAppearance }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error?.message || '저장 실패');
        return;
      }
      router.replace('/world');
    } catch {
      setError('네트워크 오류');
    } finally {
      setSaving(false);
    }
  };

  const ext = modelUrl.split('.').pop()?.toLowerCase();

  return (
    <>
      {showPicker && (
        <AssetPickerModal onSelect={handleSelectAsset} onClose={() => setShowPicker(false)} />
      )}

      <div style={{
        width: '100vw', height: '100vh', overflowY: 'auto',
        background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        padding: '24px 0',
      }}>
        <div style={{
          display: 'flex', gap: 28, alignItems: 'flex-start',
          background: 'rgba(255,255,255,0.05)', borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.1)', padding: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>

          {/* 3D 프리뷰 */}
          <div style={{
            width: 220, height: 340, borderRadius: 16, overflow: 'hidden', flexShrink: 0,
            background: 'linear-gradient(160deg,#1e293b,#0f172a)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <Canvas camera={{ position: [0, 0.5, 3.5], fov: 45 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 8, 5]} intensity={1.5} />
              {modelUrl
                ? <CustomPreview url={modelUrl} scale={modelScale} rotX={modelRotX} />
                : <BlockPreview appearance={appearance} />
              }
            </Canvas>
          </div>

          {/* 설정 패널 */}
          <div style={{ width: 300 }}>
            <h2 style={{ color: '#fff', margin: '0 0 18px', fontSize: 20, fontWeight: 800 }}>🎮 캐릭터 만들기</h2>

            {/* 이름 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 5 }}>캐릭터 이름</div>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={30}
                placeholder="이름 입력 (최대 30자)"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none',
                }} />
            </div>

            {/* 3D 모델 선택 */}
            <div style={{
              marginBottom: 16, padding: '12px 14px',
              background: 'rgba(99,102,241,0.1)', borderRadius: 12,
              border: '1px solid rgba(99,102,241,0.25)',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 8 }}>3D 모델 (선택)</div>

              {modelUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>📦</span>
                  <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelName}</span>
                  <button onClick={() => { setModelUrl(''); setModelName(''); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 8 }}>
                  FBX/GLB 없으면 블록 캐릭터로 표시됩니다
                </div>
              )}

              <button onClick={() => setShowPicker(true)} style={{
                width: '100%', padding: '7px', borderRadius: 8, border: '1px dashed rgba(99,102,241,0.5)',
                background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {modelUrl ? '다른 모델 선택' : '📂 내 에셋에서 선택'}
              </button>

              {/* 스케일 / 회전 조정 */}
              {modelUrl && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>크기</span>
                      <span style={{ color: '#a5b4fc', fontSize: 11 }}>{modelScale.toFixed(3)}</span>
                    </div>
                    <input type="range" min={0.001} max={0.5} step={0.001}
                      value={modelScale} onChange={e => setModelScale(Number(e.target.value))}
                      style={{ width: '100%' }} />
                  </div>
                  {ext === 'fbx' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>X 회전 (눕혀질 때 조정)</span>
                        <span style={{ color: '#a5b4fc', fontSize: 11 }}>{Math.round(modelRotX * 180 / Math.PI)}°</span>
                      </div>
                      <input type="range" min={-Math.PI} max={Math.PI} step={0.01}
                        value={modelRotX} onChange={e => setModelRotX(Number(e.target.value))}
                        style={{ width: '100%' }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {[0, -Math.PI/2, Math.PI/2, Math.PI].map(v => (
                          <button key={v} onClick={() => setModelRotX(v)} style={{
                            flex: 1, fontSize: 10, padding: '2px 0', borderRadius: 4, border: 'none',
                            background: Math.abs(modelRotX - v) < 0.05 ? '#4f46e5' : 'rgba(255,255,255,0.1)',
                            color: '#fff', cursor: 'pointer',
                          }}>{Math.round(v * 180 / Math.PI)}°</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 블록 캐릭터 색상 (모델 없을 때만) */}
            {!modelUrl && (
              <>
                <ColorPicker label="상의 색상" colors={BODY_COLORS}  value={appearance.bodyColor}  onChange={setColor('bodyColor')} />
                <ColorPicker label="피부 색상" colors={SKIN_COLORS}  value={appearance.skinColor}  onChange={setColor('skinColor')} />
                <ColorPicker label="머리 색상" colors={HAIR_COLORS}  value={appearance.hairColor}  onChange={setColor('hairColor')} />
                <ColorPicker label="하의 색상" colors={PANTS_COLORS} value={appearance.pantsColor} onChange={setColor('pantsColor')} />
              </>
            )}

            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{error}</div>}

            <button onClick={handleSave} disabled={saving} style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1, marginTop: 4,
            }}>
              {saving ? '저장 중…' : '월드로 입장하기 🌍'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
