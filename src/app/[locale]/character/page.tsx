'use client';
import dynamic from 'next/dynamic';
import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { useRouter } from 'next/navigation';
import { session } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 프리뷰용 캐릭터 (Canvas 내부) ─────── */
function PreviewCharacter({ appearance }: { appearance: Record<string, string> }) {
  const g = useRef<import('three').Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.6;
  });

  const body  = appearance.bodyColor  || '#4f46e5';
  const skin  = appearance.skinColor  || '#fcd9b0';
  const hair  = appearance.hairColor  || '#1e293b';
  const pants = appearance.pantsColor || '#1e293b';

  return (
    <group ref={g} position={[0, -1, 0]}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.55, 0.65, 0.28]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.48, 0.48, 0.48]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <boxGeometry args={[0.50, 0.14, 0.50]} />
        <meshStandardMaterial color={hair} />
      </mesh>
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
    <div style={{ marginBottom: 16 }}>
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {colors.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              width: 28, height: 28, borderRadius: '50%', background: c, border: 'none',
              cursor: 'pointer', outline: value === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
              outlineOffset: 2, transform: value === c ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform .1s',
            }}
          />
        ))}
        {/* 직접 선택 */}
        <input
          type="color" value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }}
          title="직접 선택"
        />
      </div>
    </div>
  );
}

/* ── 캐릭터 생성 페이지 ─────────────────── */
export default function CharacterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState({
    bodyColor:  '#4f46e5',
    skinColor:  '#fcd9b0',
    hairColor:  '#1e293b',
    pantsColor: '#1e293b',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const setColor = (key: string) => (val: string) => {
    setAppearance(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    try {
      const token = session.getToken();
      const res = await fetch(`${API}/api/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), appearance }),
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

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
    }}>
      <div style={{
        display: 'flex', gap: 32, alignItems: 'flex-start',
        background: 'rgba(255,255,255,0.05)', borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.1)', padding: 32,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* 3D 프리뷰 */}
        <div style={{
          width: 240, height: 360, borderRadius: 18, overflow: 'hidden',
          background: 'linear-gradient(160deg,#1e293b,#0f172a)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Canvas camera={{ position: [0, 0.5, 3.5], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 8, 5]} intensity={1.5} />
            <Suspense fallback={null}>
              <PreviewCharacter appearance={appearance} />
            </Suspense>
          </Canvas>
        </div>

        {/* 커스터마이즈 */}
        <div style={{ width: 320 }}>
          <h2 style={{ color: '#fff', margin: '0 0 20px', fontSize: 22, fontWeight: 800 }}>
            🎮 캐릭터 만들기
          </h2>

          {/* 이름 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6 }}>캐릭터 이름</div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={30}
              placeholder="이름 입력 (최대 30자)"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10, color: '#fff', fontSize: 15, padding: '10px 12px', outline: 'none',
              }}
            />
          </div>

          <ColorPicker label="상의 색상" colors={BODY_COLORS}  value={appearance.bodyColor}  onChange={setColor('bodyColor')} />
          <ColorPicker label="피부 색상" colors={SKIN_COLORS}  value={appearance.skinColor}  onChange={setColor('skinColor')} />
          <ColorPicker label="머리 색상" colors={HAIR_COLORS}  value={appearance.hairColor}  onChange={setColor('hairColor')} />
          <ColorPicker label="하의 색상" colors={PANTS_COLORS} value={appearance.pantsColor} onChange={setColor('pantsColor')} />

          {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              color: '#fff', fontWeight: 800, fontSize: 16, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1, marginTop: 4,
            }}
          >
            {saving ? '저장 중…' : '월드로 입장하기 🌍'}
          </button>
        </div>
      </div>
    </div>
  );
}
