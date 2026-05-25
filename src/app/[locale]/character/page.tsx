'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';
import * as THREE from 'three';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 에셋 타입 ─────────────────────────────── */
interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
  tags?: string[];
}

/* ── 애니메이션 이름 → 슬롯 자동 매칭 ──
   각 슬롯의 키워드 후보를 우선순위 순으로 매칭.
   - 정확히 일치 > 단어 경계 일치 > 부분 일치 순
   - 한 애니메이션은 한 슬롯에만 (이미 다른 슬롯에서 잡은 건 제외)
*/
const ANIM_SLOT_KEYWORDS: Record<string, string[]> = {
  idle:   ['idle', 'stand', 'standing', 'wait', 'rest'],
  walk:   ['walk', 'walking', 'stroll'],
  run:    ['run', 'running', 'sprint', 'jog'],
  jump:   ['jump', 'jumping', 'hop', 'leap'],
  crouch: ['crouch', 'crouching', 'squat', 'duck', 'sneak'],
  prone:  ['prone', 'lying', 'lie', 'lay', 'crawl'],
};

function autoMatchAnims(
  anims: { name: string; duration: number }[],
): Record<string, string> {
  const slots = Object.keys(ANIM_SLOT_KEYWORDS);
  const result: Record<string, string> = { idle: '', walk: '', run: '', jump: '', crouch: '', prone: '' };
  const used = new Set<string>();

  // 각 후보 애니메이션을 슬롯별로 점수 매기기
  // 정확 일치(이름이 키워드와 같거나 키워드_숫자 형태) = 3
  // 단어 경계 (대문자·언더스코어 직후) = 2
  // 단순 substring = 1
  function score(animName: string, kw: string): number {
    const n = animName.toLowerCase();
    const k = kw.toLowerCase();
    if (n === k) return 5;
    // "Idle", "Idle_3", "Idle3" 형태
    if (new RegExp(`^${k}([_\\-]?\\d+)?$`, 'i').test(n)) return 4;
    // "Regular_Jump", "MyJump_01" — 언더스코어/하이픈/대문자 직후
    if (new RegExp(`(^|[_\\-])${k}([_\\-]|\\d|$)`, 'i').test(animName)) return 3;
    if (new RegExp(`(^|[A-Z])${k}([A-Z_\\-]|\\d|$)`, 'i').test(animName)) return 2;
    if (n.includes(k)) return 1;
    return 0;
  }

  for (const slot of slots) {
    const keywords = ANIM_SLOT_KEYWORDS[slot];
    let best: { name: string; score: number } | null = null;
    for (const a of anims) {
      if (used.has(a.name)) continue;
      let bestKwScore = 0;
      for (const kw of keywords) bestKwScore = Math.max(bestKwScore, score(a.name, kw));
      if (bestKwScore > 0 && (!best || bestKwScore > best.score)) {
        best = { name: a.name, score: bestKwScore };
      }
    }
    if (best) {
      result[slot] = best.name;
      used.add(best.name);
    }
  }
  return result;
}

/* ── 자동 정규화 (1.8m 기준) ────────────── */
const btnTiny = (active: boolean) => ({
  width: 26, padding: '3px 0', fontSize: 11, borderRadius: 4, border: 'none',
  background: active ? '#4f46e5' : 'rgba(255,255,255,0.1)',
  color: '#fff', cursor: 'pointer',
} as const);

function autoNormalize(obj: THREE.Object3D, rotX = 0, targetHeight = 1.8) {
  // 재호출 시 누적 방지 — 매번 fresh 한 상태에서 시작
  obj.position.set(0, 0, 0);
  obj.rotation.set(rotX, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);

  const box  = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const h    = Math.max(size.x, size.y, size.z);
  if (h > 0) {
    obj.scale.setScalar(targetHeight / h);
    obj.updateMatrixWorld(true);
  }
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box2.min.y;            // 발 → y=0 (정확히 정렬)
}

/* ── 커스텀 모델 프리뷰 (명령형 로드) ───── */
function CustomPreview({
  url, userScale, rotX, offsetY = 0, previewAnim, previewTrim, onAnimationsLoaded, onPlayingClip,
}: {
  url: string;
  userScale: number;
  rotX: number;
  offsetY?: number;
  previewAnim?: string;
  previewTrim?: { start?: number; end?: number };
  onAnimationsLoaded?: (anims: { name: string; duration: number }[]) => void;
  /** 디버그용 — 실제로 mixer에 들어간 clip 이름 알림 */
  onPlayingClip?: (name: string | null) => void;
}) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const g     = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const animClips = useRef<THREE.AnimationClip[]>([]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const onLoaded = (loaded: THREE.Object3D, anims: THREE.AnimationClip[] = []) => {
      if (cancelled) return;
      autoNormalize(loaded, rotX, 1.8);
      animClips.current = anims;
      if (anims.length) {
        mixer.current = new THREE.AnimationMixer(loaded);
      }
      onAnimationsLoaded?.(anims.map(a => ({ name: a.name, duration: a.duration })));
      setObj(loaded);
    };

    // FBX만 지원
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        onLoaded(fbx, (fbx as unknown as { animations: THREE.AnimationClip[] }).animations ?? []);
      });
    });
    return () => {
      cancelled = true;
      mixer.current?.stopAllAction();
      mixer.current = null;
    };
  }, [url, onAnimationsLoaded]);

  // rotX 가 변경되면 회전 + 발 재정렬 (FBX 재로드 없이)
  useEffect(() => {
    if (!obj) return;
    autoNormalize(obj, rotX, 1.8);
  }, [rotX, obj]);

  // 선택된 애니메이션만 재생 (트림 적용)
  useEffect(() => {
    if (!mixer.current) { onPlayingClip?.(null); return; }
    mixer.current.stopAllAction();
    // mixer 의 캐시된 액션까지 정리 — 캐시된 액션이 새 clip 재생을 방해할 수 있음
    mixer.current.uncacheRoot(mixer.current.getRoot());
    if (!previewAnim) { onPlayingClip?.(null); return; }
    const src = animClips.current.find(c => c.name === previewAnim);
    if (!src) {
      console.warn('[preview] clip not found:', previewAnim, 'available:', animClips.current.map(c => c.name));
      onPlayingClip?.(`(없음: ${previewAnim})`);
      return;
    }
    let clip = src;
    if (previewTrim) {
      const start = Math.max(0, previewTrim.start ?? 0);
      const end   = Math.min(src.duration, previewTrim.end ?? src.duration);
      if (end > start && (start > 0 || end < src.duration)) {
        const fps = 30;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const utils = (THREE as any).AnimationUtils;
        clip = utils.subclip(src, src.name + '_t', Math.floor(start * fps), Math.ceil(end * fps), fps);
      }
    }
    const action = mixer.current.clipAction(clip);
    action.reset();
    action.play();
    onPlayingClip?.(clip.name);
  }, [previewAnim, previewTrim, obj, onPlayingClip]);

  // 자동 회전 제거 — OrbitControls 로 사용자가 직접 회전 (충돌 방지)
  useFrame((_, dt) => {
    mixer.current?.update(dt);
  });

  if (!obj) return null;
  // rotX 와 발 정렬은 autoNormalize 가 obj 안에서 처리.
  // 외곽 group y=-1 은 카메라(y=0.5)에서 적당한 시야 위치 잡으려고 유지.
  // offsetY 는 사용자가 발 높이 미세조정 (m)
  return (
    <group ref={g} position={[0, -1, 0]}>
      <group scale={userScale} position={[0, offsetY, 0]}>
        <primitive object={obj} />
      </group>
    </group>
  );
}

/* ── 바닥 기준 표시 ──
   디스크 = world 의 실제 ground.
   외곽 group y=-1 + autoNormalize 후 발이 outer-local y=0 이므로 default offsetY=0 일 때 발이 정확히 디스크에 닿음.
*/
function GroundRef() {
  return (
    <group position={[0, -1, 0]}>
      {/* 메인 디스크 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <circleGeometry args={[1.2, 48]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.15} depthWrite={false} />
      </mesh>
      {/* 테두리 링 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} renderOrder={-1}>
        <ringGeometry args={[1.18, 1.2, 48]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {/* 중심 십자 (정확한 0,0 표시) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={-1}>
        <ringGeometry args={[0.08, 0.1, 24]} />
        <meshBasicMaterial color="#a5b4fc" transparent opacity={0.8} depthWrite={false} />
      </mesh>
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
/** 추천 태그 — 처음 켤 때 자동 활성화 (있으면) */
const SUGGESTED_TAG = 'character';
/** 사이드바 태그 칩 최대 개수 */
const MAX_TAG_CHIPS = 8;

function AssetPickerModal({ onSelect, onClose }: {
  onSelect: (asset: Asset) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Character');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 첫 로드 시 'character' 태그 가진 에셋이 있으면 자동 필터
  const initialized = useRef(false);

  useEffect(() => {
    fetch(`${API}/api/assets/my`, {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        const list: Asset[] = d.assets || [];
        // FBX 만 (kind === 'model' or 확장자)
        const fbxOnly = list.filter(a => /\.fbx(\?|$)/i.test(a.modelUrl));
        setAssets(fbxOnly);
        // 추천 태그가 1개 이상 매칭되면 자동 활성화
        if (!initialized.current) {
          const hasSuggested = fbxOnly.some(a => (a.tags || []).includes(SUGGESTED_TAG));
          if (hasSuggested) setSelectedTags([SUGGESTED_TAG]);
          initialized.current = true;
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 태그 사용 빈도 (상위 N개)
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) for (const tag of a.tags || []) m[tag] = (m[tag] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  // 필터링
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return assets.filter(a => {
      if (query) {
        const inName = a.name.toLowerCase().includes(query);
        const inTags = (a.tags || []).some(t => t.toLowerCase().includes(query));
        if (!inName && !inTags) return false;
      }
      if (selectedTags.length > 0) {
        const has = selectedTags.every(t => (a.tags || []).includes(t));
        if (!has) return false;
      }
      return true;
    });
  }, [assets, q, selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag]);
  }

  const ext = 'FBX';
  const hasAnyTags = tagCounts.length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
        padding: 24, width: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>{t('assetPickerTitle')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 검색 + 태그 필터 */}
        {!loading && assets.length > 0 && (
          <>
            <div style={{ position: 'relative', marginBottom: hasAnyTags ? 8 : 12 }}>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={t('pickerSearchPlaceholder')}
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', fontSize: 13,
                  background: 'rgba(0,0,0,0.3)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
            </div>

            {hasAnyTags ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {tagCounts.slice(0, MAX_TAG_CHIPS).map(([tag, count]) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button key={tag} onClick={() => toggleTag(tag)}
                      style={{
                        padding: '4px 10px', fontSize: 11,
                        background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                        color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                        border: 'none', borderRadius: 5, cursor: 'pointer',
                        fontWeight: active ? 700 : 500,
                      }}>
                      #{tag} <span style={{ opacity: 0.55, fontSize: 10 }}>{count}</span>
                    </button>
                  );
                })}
                {selectedTags.length > 0 && (
                  <button onClick={() => setSelectedTags([])}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 700,
                      background: 'transparent', color: '#fca5a5',
                      border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, cursor: 'pointer',
                    }}>
                    {t('pickerClearTags')}
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                fontSize: 11, opacity: 0.55, padding: '8px 12px', marginBottom: 10,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 8, color: '#c7d2fe',
              }}>
                💡 {t('pickerTagTipNoTags')}
              </div>
            )}

            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 8 }}>
              {t('pickerResultCount', { count: filtered.length, total: assets.length })}
            </div>
          </>
        )}

        {loading && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24 }}>{t('loadingAssets')}</div>}

        {!loading && assets.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 }}>
            {t('noUploadedAssets')}<br />
            <a href="/assets" style={{ color: '#818cf8' }}>/assets</a> {t('uploadAtAssets')}
          </div>
        )}

        {!loading && assets.length > 0 && filtered.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 }}>
            {t('pickerNoMatches')}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, overflowY: 'auto' }}>
          {filtered.map(a => (
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
                  background: '#f59e0b', color: '#fff',
                  padding: '2px 5px', borderRadius: 3,
                }}>{ext}</span>
              </div>
              <div style={{ padding: '6px 8px', textAlign: 'left' }}>
                <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                {(a.tags || []).length > 0 && (
                  <div style={{ fontSize: 9, opacity: 0.55, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    #{(a.tags || []).slice(0, 2).join(' #')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────── */
export default function CharacterPage() {
  const t = useTranslations('Character');
  const router = useRouter();
  const [name, setName]           = useState('');
  const [appearance, setAppearance] = useState<Record<string, string>>({
    bodyColor: '#4f46e5', skinColor: '#fcd9b0',
    hairColor: '#1e293b', pantsColor: '#1e293b',
  });
  const [modelUrl, setModelUrl]     = useState('');
  const [modelScale, setModelScale] = useState(0.01);
  const [modelRotX, setModelRotX]   = useState(-Math.PI / 2);
  const [modelOffsetY, setModelOffsetY] = useState(0);   // 발 높이 미세 조정 (m)
  const [modelName, setModelName]   = useState('');
  // 애니메이션 매핑 — 6가지 상태
  const [availableAnims, setAvailableAnims] = useState<{ name: string; duration: number }[]>([]);
  const [animMap, setAnimMap] = useState<Record<string, string>>({
    idle: '', walk: '', run: '', jump: '', crouch: '', prone: '',
  });
  // 각 슬롯의 트림 구간 (초)
  const [animTrims, setAnimTrims] = useState<Record<string, { start: number; end: number }>>({});
  const [previewSlot, setPreviewSlot] = useState<'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'prone'>('idle');
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const setColor = (key: string) => (val: string) =>
    setAppearance(prev => ({ ...prev, [key]: val }));

  const handleSelectAsset = (asset: Asset) => {
    setModelUrl(asset.modelUrl);
    setModelName(asset.name);
    setShowPicker(false);
    setModelScale(1.0);
    setModelRotX(-Math.PI / 2);
    setModelOffsetY(0);
    setAvailableAnims([]);
    setAnimMap({ idle: '', walk: '', run: '', jump: '', crouch: '', prone: '' });
    setAnimTrims({});
  };

  // availableAnims 가 새로 로드되면 이름 기반 자동 매칭
  // (단, 사용자가 이미 직접 슬롯을 채워둔 게 있으면 그건 유지)
  useEffect(() => {
    if (availableAnims.length === 0) return;
    setAnimMap(prev => {
      const matched = autoMatchAnims(availableAnims);
      const next: Record<string, string> = { ...prev };
      let changed = false;
      for (const slot of Object.keys(matched)) {
        // 비어있을 때만 자동 채움 (사용자 선택 보존)
        if (!prev[slot] && matched[slot]) {
          next[slot] = matched[slot];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // 새로 채워진 슬롯에 대해 트림도 default 로 (start=0, end=duration)
    setAnimTrims(prev => {
      const matched = autoMatchAnims(availableAnims);
      const next = { ...prev };
      let changed = false;
      for (const slot of Object.keys(matched)) {
        const name = matched[slot];
        if (name && !prev[slot]) {
          const dur = availableAnims.find(a => a.name === name)?.duration ?? 0;
          next[slot] = { start: 0, end: dur };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availableAnims]);

  const handleSave = async () => {
    if (!name.trim()) { setError(t('nameRequired')); return; }
    setSaving(true);
    setError('');
    const fullAppearance = modelUrl
      ? {
          ...appearance, modelUrl, modelScale, fbxRotX: modelRotX, fbxOffsetY: modelOffsetY,
          idleAnim:   animMap.idle,
          walkAnim:   animMap.walk,
          runAnim:    animMap.run,
          jumpAnim:   animMap.jump,
          crouchAnim: animMap.crouch,
          proneAnim:  animMap.prone,
          animTrims,
        }
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
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      router.replace('/world');
    } catch {
      setError(t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showPicker && (
        <AssetPickerModal onSelect={handleSelectAsset} onClose={() => setShowPicker(false)} />
      )}

      <div style={{
        width: '100vw', minHeight: '100vh',
        background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex', gap: 28, alignItems: 'flex-start',
          background: 'rgba(255,255,255,0.05)', borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.1)', padding: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}>

          {/* 3D 프리뷰 */}
          <div style={{
            width: 360, height: 500, borderRadius: 16, overflow: 'hidden', flexShrink: 0,
            background: 'linear-gradient(160deg,#1e293b,#0f172a)',
            border: '1px solid rgba(255,255,255,0.1)',
            position: 'relative',
          }}>
            <Canvas camera={{ position: [0, 0.5, 4.2], fov: 35 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 8, 5]} intensity={1.5} />
              {/* 사용자가 마우스로 자유 회전·줌 */}
              <OrbitControls
                target={[0, -0.2, 0]}
                enablePan={false}
                minDistance={2}
                maxDistance={8}
                minPolarAngle={Math.PI * 0.15}
                maxPolarAngle={Math.PI * 0.85}
              />
              {/* 바닥 기준 — 캐릭터 발이 여기 맞아야 함 */}
              {modelUrl && <GroundRef />}
              {modelUrl
                ? <CustomPreview
                    url={modelUrl}
                    userScale={modelScale}
                    rotX={modelRotX}
                    offsetY={modelOffsetY}
                    previewAnim={animMap[previewSlot]}
                    previewTrim={animTrims[previewSlot]}
                    onAnimationsLoaded={setAvailableAnims}
                    onPlayingClip={setPlayingClip}
                  />
                : <BlockPreview appearance={appearance} />
              }
            </Canvas>
            {/* 디버그: 현재 재생 중인 clip 이름 */}
            {modelUrl && (
              <div style={{
                position: 'absolute', bottom: 8, left: 8,
                background: 'rgba(0,0,0,0.7)', color: '#fff',
                fontSize: 10, padding: '4px 8px', borderRadius: 4,
                fontFamily: 'monospace',
                pointerEvents: 'none',
              }}>
                ▶ {playingClip || '(정지)'} · slot: {previewSlot}
              </div>
            )}
          </div>

          {/* 설정 패널 */}
          <div style={{ width: 300 }}>
            <h2 style={{ color: '#fff', margin: '0 0 18px', fontSize: 20, fontWeight: 800 }}>{t('title')}</h2>

            {/* 이름 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 5 }}>{t('name')}</div>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={30}
                placeholder={t('namePlaceholder')}
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
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 8 }}>{t('model3d')}</div>

              {modelUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>📦</span>
                  <span style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelName}</span>
                  <button onClick={() => { setModelUrl(''); setModelName(''); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 8 }}>
                  {t('noModelHint')}
                </div>
              )}

              <button onClick={() => setShowPicker(true)} style={{
                width: '100%', padding: '7px', borderRadius: 8, border: '1px dashed rgba(99,102,241,0.5)',
                background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
                {modelUrl ? t('selectOther') : t('selectFromAssets')}
              </button>

              {/* 스케일 / 회전 조정 */}
              {modelUrl && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{t('sizeLabel')}</span>
                      <span style={{ color: '#a5b4fc', fontSize: 11 }}>{modelScale.toFixed(2)}x</span>
                    </div>
                    <input type="range" min={0.1} max={3.0} step={0.05}
                      value={modelScale} onChange={e => setModelScale(Number(e.target.value))}
                      style={{ width: '100%' }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{t('rotationXLabel')}</span>
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
                  {/* Y 오프셋 — 발 높이 미세 조정 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{t('offsetYLabel')}</span>
                      <span style={{ color: '#a5b4fc', fontSize: 11 }}>{modelOffsetY >= 0 ? '+' : ''}{modelOffsetY.toFixed(2)}m</span>
                    </div>
                    <input type="range" min={-2} max={2} step={0.01}
                      value={modelOffsetY} onChange={e => setModelOffsetY(Number(e.target.value))}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                      <button onClick={() => setModelOffsetY(modelOffsetY - 0.01)}
                        title="−1cm"
                        style={btnTiny(false)}>−</button>
                      <input type="number" step={0.01} min={-5} max={5}
                        value={modelOffsetY.toFixed(2)}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setModelOffsetY(v);
                        }}
                        style={{
                          flex: 1, padding: '3px 6px', fontSize: 11, textAlign: 'center',
                          background: 'rgba(0,0,0,0.4)', color: '#fff',
                          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, outline: 'none',
                        }} />
                      <button onClick={() => setModelOffsetY(modelOffsetY + 0.01)}
                        title="+1cm"
                        style={btnTiny(false)}>+</button>
                      <button onClick={() => setModelOffsetY(0)}
                        style={btnTiny(Math.abs(modelOffsetY) < 0.005)}>0</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 애니메이션 매핑 (FBX에 애니메이션이 있을 때만) */}
            {modelUrl && availableAnims.length > 0 && (
              <div style={{
                marginBottom: 16, padding: '12px 14px',
                background: 'rgba(16,185,129,0.08)', borderRadius: 12,
                border: '1px solid rgba(16,185,129,0.2)',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 8 }}>
                  {t('animMapping', { count: availableAnims.length })}
                </div>

                {/* 유휴 선택 */}
                {/* 6가지 상태 슬롯 */}
                {([
                  ['idle',   t('idleAnimLabel')],
                  ['walk',   t('walkAnimLabel')],
                  ['run',    t('runAnimLabel')],
                  ['jump',   t('jumpAnimLabel')],
                  ['crouch', t('crouchAnimLabel')],
                  ['prone',  t('proneAnimLabel')],
                ] as const).map(([slot, label]) => {
                  const animName = animMap[slot];
                  const animMeta = availableAnims.find(a => a.name === animName);
                  const duration = animMeta?.duration ?? 0;
                  const trim     = animTrims[slot] ?? { start: 0, end: duration };
                  return (
                    <div key={slot} style={{
                      marginBottom: 8, padding: 6,
                      background: previewSlot === slot ? 'rgba(16,185,129,0.08)' : 'transparent',
                      borderRadius: 6, border: previewSlot === slot ? '1px solid rgba(16,185,129,0.25)' : '1px solid transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 2 }}>{label}</div>
                          <select
                            value={animName}
                            onChange={e => {
                              const name = e.target.value;
                              setAnimMap(prev => ({ ...prev, [slot]: name }));
                              // 새 애니메이션 선택 시 트림 리셋
                              const dur = availableAnims.find(a => a.name === name)?.duration ?? 0;
                              setAnimTrims(prev => ({ ...prev, [slot]: { start: 0, end: dur } }));
                              setPreviewSlot(slot);
                            }}
                            onFocus={() => setPreviewSlot(slot)}
                            style={{
                              width: '100%', background: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                              color: '#fff', fontSize: 11, padding: '5px 8px', outline: 'none',
                            }}
                          >
                            <option value="">{t('noneOption')}</option>
                            {availableAnims.map(a => (
                              <option key={a.name} value={a.name}>{a.name} ({a.duration.toFixed(1)}s)</option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => setPreviewSlot(slot)}
                          title={t('previewLabel')}
                          style={{
                            marginTop: 12, padding: '5px 8px', borderRadius: 5, border: 'none',
                            background: previewSlot === slot ? '#10b981' : 'rgba(255,255,255,0.08)',
                            color: '#fff', cursor: 'pointer', fontSize: 10, flexShrink: 0,
                          }}>▶</button>
                      </div>

                      {/* 트림 (애니메이션 선택된 경우) */}
                      {animName && duration > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, width: 26 }}>{t('trimStart')}</span>
                          <input type="number" step={0.05} min={0} max={duration}
                            value={trim.start.toFixed(2)}
                            onChange={e => {
                              const s = Math.max(0, Math.min(duration, Number(e.target.value) || 0));
                              setAnimTrims(prev => ({ ...prev, [slot]: { start: s, end: Math.max(s + 0.05, trim.end) } }));
                            }}
                            style={{ width: 50, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#fff', fontSize: 10, padding: '2px 4px', outline: 'none', textAlign: 'right' }}
                          />
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, width: 18 }}>{t('trimEnd')}</span>
                          <input type="number" step={0.05} min={0} max={duration}
                            value={trim.end.toFixed(2)}
                            onChange={e => {
                              const eVal = Math.max(trim.start + 0.05, Math.min(duration, Number(e.target.value) || duration));
                              setAnimTrims(prev => ({ ...prev, [slot]: { start: trim.start, end: eVal } }));
                            }}
                            style={{ width: 50, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#fff', fontSize: 10, padding: '2px 4px', outline: 'none', textAlign: 'right' }}
                          />
                          <button onClick={() => setAnimTrims(prev => ({ ...prev, [slot]: { start: 0, end: duration } }))}
                            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 9, padding: '3px 6px', borderRadius: 3, cursor: 'pointer' }}>
                            {t('trimFull')}
                          </button>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginLeft: 'auto' }}>{(trim.end - trim.start).toFixed(2)}{t('trimSec')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 블록 캐릭터 색상 (모델 없을 때만) */}
            {!modelUrl && (
              <>
                <ColorPicker label={t('bodyColor')}  colors={BODY_COLORS}  value={appearance.bodyColor}  onChange={setColor('bodyColor')} />
                <ColorPicker label={t('skinColor')}  colors={SKIN_COLORS}  value={appearance.skinColor}  onChange={setColor('skinColor')} />
                <ColorPicker label={t('hairColor')}  colors={HAIR_COLORS}  value={appearance.hairColor}  onChange={setColor('hairColor')} />
                <ColorPicker label={t('pantsColor')} colors={PANTS_COLORS} value={appearance.pantsColor} onChange={setColor('pantsColor')} />
              </>
            )}

            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{error}</div>}

            <button onClick={handleSave} disabled={saving} style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1, marginTop: 4,
            }}>
              {saving ? t('saving') : t('enterWorld')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
