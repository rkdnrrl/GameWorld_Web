'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';
import CreatorNav from '@/components/creator/CreatorNav';
import * as THREE from 'three';
import { retargetClipsToModel, hasSkeleton } from '@/lib/character/mixamoRig';
import { loadPlatformAnimationStateClips } from '@/lib/character/platformAnimations';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 에셋 타입 ─────────────────────────────── */
interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl: string | null;
  tags?: string[];
}

interface MyCharacter {
  id: string;
  name: string;
  appearance: Record<string, unknown>;
  isActive: boolean;
  isPublic?: boolean;
  shareSlug?: string | null;
  updatedAt?: string;
}

interface PublicCharacter {
  id: string;
  name: string;
  appearance: Record<string, unknown>;
  creatorName?: string | null;
  shareSlug?: string | null;
  updatedAt?: string;
}

/* ── 애니메이션 이름 → 슬롯 자동 매칭 ──
   각 슬롯의 키워드 후보를 우선순위 순으로 매칭.
   - 정확히 일치 > 단어 경계 일치 > 부분 일치 순
   - 한 애니메이션은 한 슬롯에만 (이미 다른 슬롯에서 잡은 건 제외)
*/
const ANIM_SLOT_KEYWORDS: Record<string, string[]> = {
  idle:        ['idle', 'stand', 'standing', 'wait', 'rest'],
  walk:        ['walk', 'walking', 'stroll'],
  run:         ['run', 'running', 'sprint', 'jog'],
  jump:        ['jump', 'jumping', 'hop', 'leap'],
  fall:        ['fall', 'falling', 'drop'],
  crouch:      ['crouch', 'crouching', 'squat', 'duck'],
  crouch_walk: ['crouch_walk', 'crouchwalk', 'sneak', 'sneaking'],
  prone:       ['prone', 'lying', 'lie', 'lay'],
  prone_move:  ['prone_move', 'pronemove', 'crawl', 'crawling'],
};

// 코어 슬롯 — 물리엔진이 자동 트리거 (항상 표시)
const CORE_SLOTS = ['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'crouch_walk', 'prone', 'prone_move'] as const;
type CoreSlot = typeof CORE_SLOTS[number];
// 하위 호환용
const ANIM_SLOTS = CORE_SLOTS;

function autoMatchAnims(
  anims: { name: string; duration: number }[],
  slotsToMatch: string[] = Object.keys(ANIM_SLOT_KEYWORDS),
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const s of slotsToMatch) result[s] = '';
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

  for (const slot of slotsToMatch) {
    const keywords = ANIM_SLOT_KEYWORDS[slot];
    if (!keywords) continue;
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function sanitizeRotX(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return -Math.PI / 2;
  const rad = Math.abs(n) > Math.PI * 2 ? (n * Math.PI) / 180 : n;
  return clamp(rad, -Math.PI, Math.PI);
}

function sanitizeOffsetY(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, -5, 5);
}

function getRenderableBounds(obj: THREE.Object3D) {
  const worldBox = new THREE.Box3();
  const tmp = new THREE.Box3();
  let hasMesh = false;

  obj.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    tmp.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (!hasMesh) {
      worldBox.copy(tmp);
      hasMesh = true;
    } else {
      worldBox.union(tmp);
    }
  });

  if (!hasMesh) worldBox.setFromObject(obj);
  return worldBox;
}

function autoNormalize(obj: THREE.Object3D, rotX = 0, targetHeight = 1.8) {
  // 1. 회전 없이 원본 크기 측정 — 회전이 스케일에 영향 주지 않도록
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);

  const box0 = getRenderableBounds(obj);
  const size0 = box0.getSize(new THREE.Vector3());
  // 최대 치수를 기준 높이로 사용 → 회전해도 스케일 불변
  const h = Math.max(size0.x, size0.y, size0.z);
  if (h > 0) {
    obj.scale.setScalar(targetHeight / h);
    obj.updateMatrixWorld(true);
  }

  // 2. 회전 적용
  obj.rotation.set(rotX, 0, 0);
  obj.updateMatrixWorld(true);

  // 3. 발 -> y=0 정렬
  const box1 = getRenderableBounds(obj);
  obj.position.y -= box1.min.y;
}

/** FBX 의 원래 up-axis 자동 감지 — 회전 4 후보 중 Y(높이) 가 가장 큰 회전 반환.
 *  신규 업로드 (appearance.fbxRotX 미설정) 일 때 초기값으로 사용. */
function detectBestRotX(obj: THREE.Object3D): number {
  const candidates = [0, -Math.PI / 2, Math.PI / 2, Math.PI];
  let best = 0, bestY = -Infinity;
  const origRot = obj.rotation.clone();
  for (const r of candidates) {
    obj.rotation.set(r, 0, 0);
    obj.updateMatrixWorld(true);
    const box = getRenderableBounds(obj);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > bestY) { bestY = size.y; best = r; }
  }
  obj.rotation.copy(origRot);
  obj.updateMatrixWorld(true);
  return best;
}

/** 애니메이션 클립에서 root/hip bone 의 position 트랙 제거 — preview 시 모델이 이동해버리는 root motion 방지.
 *  rotation 트랙은 유지 → 실루엣/모션 유지. 게임 런타임은 별도라 영향 X. */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const filtered = clip.tracks.filter(track => {
    // "BoneName.position" 또는 "BoneName.position[0]" 형태
    const m = track.name.match(/^([^.]+)\.position(\[\d\])?$/);
    if (!m) return true; // position 트랙 아님 → 유지
    const bone = m[1].toLowerCase();
    // root motion 의 root 후보 — hips / root / armature / mixamorig hips
    return !/^(mixamorig:?)?(hips|root|rootnode|armature|character)$/.test(bone);
  });
  // 트랙 변화 없으면 원본 그대로 (clone 비용 절약)
  if (filtered.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, filtered);
}

/* ── 커스텀 모델 프리뷰 (명령형 로드) ───── */
type ObjectPose = {
  obj: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

function captureObjectPose(root: THREE.Object3D): ObjectPose[] {
  const poses: ObjectPose[] = [];
  root.traverse((obj) => {
    poses.push({
      obj,
      position: obj.position.clone(),
      quaternion: obj.quaternion.clone(),
      scale: obj.scale.clone(),
    });
  });
  return poses;
}

function restoreObjectPose(poses: ObjectPose[]) {
  poses.forEach(({ obj, position, quaternion, scale }) => {
    obj.position.copy(position);
    obj.quaternion.copy(quaternion);
    obj.scale.copy(scale);
  });
}

function CustomPreview({
  url, userScale, rotX, offsetY = 0, previewAnim, previewTrim, previewIsOneShot, onAnimationsLoaded, onPlayingClip, onNoSkeleton,
  extraSlotUrls, onAutoRotXDetected,
}: {
  url: string;
  userScale: number;
  rotX: number;
  offsetY?: number;
  previewAnim?: string;
  previewTrim?: { start?: number; end?: number };
  /** true면 LoopOnce로 재생 (한번만 재생) */
  previewIsOneShot?: boolean;
  onAnimationsLoaded?: (anims: { name: string; duration: number }[]) => void;
  /** 디버그용 — 실제로 mixer에 들어간 clip 이름 알림 */
  onPlayingClip?: (name: string | null) => void;
  /** 스켈레톤 없는 메시 감지 시 호출 */
  onNoSkeleton?: () => void;
  /** 슬롯별 외부 FBX URL (유저가 각 슬롯에 직접 지정) */
  extraSlotUrls?: Record<string, string>;
  /** FBX 가 이미 Y-up 직립이라 -π/2 가 잘못된 경우, 자동 감지된 회전 값을 부모에 알림 (저장 시 DB 에 반영용) */
  onAutoRotXDetected?: (rotX: number) => void;
}) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const g     = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const animClips = useRef<THREE.AnimationClip[]>([]);
  const restPose = useRef<ObjectPose[]>([]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const onLoaded = async (loaded: THREE.Object3D, anims: THREE.AnimationClip[] = []) => {
      if (cancelled) return;
      // 뼈 없으면 미리보기 불가 — Mixamo 안내는 항상 표시 (모델 선택 시 무조건)
      if (!hasSkeleton(loaded)) {
        onNoSkeleton?.();
        return;
      }
      onNoSkeleton?.();
      // 신규 모델 (appearance.fbxRotX 가 정확히 -π/2 default 이고 fbx 가 이미 Y-up 직립)
      // 인 경우 자동 감지로 보정. 사용자가 명시적으로 다른 값 설정했으면 그대로.
      let effectiveRotX = rotX;
      if (Math.abs(rotX - (-Math.PI / 2)) < 0.001) {
        const detected = detectBestRotX(loaded);
        if (Math.abs(detected - rotX) > 0.001) {
          // 감지 결과가 stored 값과 다르면 부모에 알림 — DB 에 저장되어 월드/시뮬에서도 정상.
          onAutoRotXDetected?.(detected);
        }
        effectiveRotX = detected;
      }
      autoNormalize(loaded, effectiveRotX, 1.8);
      const platformClips = await loadPlatformAnimationStateClips(loaded);
      if (cancelled) return;
      const compatibleAnims = retargetClipsToModel(anims, loaded);
      // root motion 제거 — preview 시 모델이 화면 밖으로 이동하는 버그 방지
      const combinedAnims = [...platformClips.values(), ...compatibleAnims].map(stripRootMotion);
      animClips.current = combinedAnims;
      restPose.current = captureObjectPose(loaded);
      if (combinedAnims.length) {
        mixer.current = new THREE.AnimationMixer(loaded);
      }
      onAnimationsLoaded?.(combinedAnims.map(a => ({ name: a.name, duration: a.duration })));
      setObj(loaded);
    };

    // FBX만 지원
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        void onLoaded(fbx, (fbx as unknown as { animations: THREE.AnimationClip[] }).animations ?? []);
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
    // 본 위치를 바인드 포즈로 복원 (uncacheRoot 제거 — 클립 전환 시 쓰면 안 됨)
    restoreObjectPose(restPose.current);
    if (!previewAnim) { onPlayingClip?.(null); return; }
    const src = animClips.current.find(c => c.name === previewAnim);
    if (!src) {
      console.warn('[preview] clip not found:', previewAnim, 'available:', animClips.current.map(c => c.name));
      restoreObjectPose(restPose.current);
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
    if (previewIsOneShot) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    action.reset();
    action.play();
    onPlayingClip?.(clip.name);
    // oneShot: finished 이벤트로 명시적 정지
    if (previewIsOneShot && mixer.current) {
      const mx = mixer.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onDone = (e: any) => {
        if (e.action === action) {
          action.paused = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mx.removeEventListener('finished', onDone as any);
        }
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mx.addEventListener('finished', onDone as any);
    }
  }, [previewAnim, previewTrim, previewIsOneShot, obj, onPlayingClip]);

  // 슬롯별 외부 FBX 로드 — 유저가 각 슬롯에 직접 지정한 에셋
  const extraSlotUrlsKey = JSON.stringify(extraSlotUrls || {});
  useEffect(() => {
    if (!obj) return;
    const urls = JSON.parse(extraSlotUrlsKey) as Record<string, string>;
    const entries = Object.entries(urls).filter(([, u]) => !!u);
    const base = animClips.current.filter(c => !c.name.startsWith('EXT_'));
    if (!entries.length) {
      animClips.current = base;
      onAnimationsLoaded?.(base.map(a => ({ name: a.name, duration: a.duration })));
      return;
    }
    let cancelled = false;
    (async () => {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const extClips: THREE.AnimationClip[] = [];
      for (const [slot, u] of entries) {
        if (cancelled || !u) continue;
        try {
          const fbx = await new Promise<THREE.Object3D>((resolve, reject) =>
            new FBXLoader().load(u, resolve, undefined, reject)
          );
          const anims = (fbx as unknown as { animations?: THREE.AnimationClip[] }).animations || [];
          if (!anims.length) continue;
          const retargeted = retargetClipsToModel([anims[0]], obj);
          if (!retargeted.length) continue;
          const clip = stripRootMotion(retargeted[0].clone());
          clip.name = `EXT_${slot}`;
          extClips.push(clip);
        } catch (e) {
          console.warn(`[ext-anim] ${slot}:`, e);
        }
      }
      if (cancelled) return;
      animClips.current = [...base, ...extClips];
      onAnimationsLoaded?.(animClips.current.map(a => ({ name: a.name, duration: a.duration })));
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraSlotUrlsKey, obj]);

  // 자동 회전 제거 — OrbitControls 로 사용자가 직접 회전 (충돌 방지)
  useFrame((_, dt) => {
    mixer.current?.update(dt);
  });

  if (!obj) return null;
  // rotX 와 발 정렬은 autoNormalize 가 obj 안에서 처리.
  // 외곽 group y=-1 은 카메라(y=0.5)에서 적당한 시야 위치 잡으려고 유지.
  // offsetY 는 사용자가 발 높이 미세조정 (m)
  return (
    <group ref={g}>
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
    <group>
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
    <group ref={g}>
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

/** 에셋 카드 썸네일 — modelUrl 이 FBX 면 lazy 3D 프리뷰 생성, 보이는 동안에만 큐 처리 */
function PickerThumb({ asset, isOfficial }: { asset: Asset; isOfficial: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (asset.thumbnailUrl) return;          // 서버 썸네일 우선
    if (!/\.fbx(\?|$)/i.test(asset.modelUrl)) return;  // FBX 만 3D 썸 생성
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    visibleRef.current = false;

    const run = () => {
      if (cancelled || !visibleRef.current) return;
      import('@/lib/assets/modelThumb').then(({ requestThumb }) => {
        if (cancelled || !visibleRef.current) return;
        requestThumb(asset.modelUrl, null, () => !cancelled && visibleRef.current)
          .then(d => {
            if (cancelled) return;
            if (d) setThumb(d);
            else if (visibleRef.current) setTimeout(run, 60);
          })
          .catch(() => {});
      });
    };

    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting && !thumb) run();
    }, { threshold: 0.01 });
    io.observe(el);

    return () => { cancelled = true; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.modelUrl, asset.thumbnailUrl]);

  if (asset.thumbnailUrl) {
    return <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {thumb
        ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 32 }}>{isOfficial ? '⭐' : '📦'}</span>}
    </div>
  );
}

function AssetPickerModal({ onSelect, onClose, officialChars }: {
  onSelect: (asset: Asset) => void;
  onClose: () => void;
  officialChars?: PublicCharacter[];
}) {
  const t = useTranslations('Character');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 첫 로드 시 'character' 태그 가진 에셋이 있으면 자동 필터
  const initialized = useRef(false);

  useEffect(() => {
    // 공식 캐릭터를 synthetic Asset 형태로 변환 (modelUrl 이 있는 것만)
    const officialAssets: Asset[] = (officialChars || [])
      .map((c) => {
        const url = String((c.appearance as { modelUrl?: string })?.modelUrl || '');
        if (!url || !/\.fbx(\?|$)/i.test(url)) return null;
        return {
          id: `official:${c.id}`,
          name: c.name,
          modelUrl: url,
          thumbnailUrl: null,
          tags: ['official', 'character'],
        } as Asset;
      })
      .filter((a): a is Asset => a !== null);

    fetch(`${API}/api/assets/my`, {
      headers: { Authorization: `Bearer ${session.getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        const list: Asset[] = d.assets || [];
        // FBX 만 (kind === 'model' or 확장자)
        const fbxOnly = list.filter(a => /\.fbx(\?|$)/i.test(a.modelUrl));
        // 공식 캐릭터는 항상 맨 앞에 (id 중복 방지를 위해 official: prefix 사용)
        const merged = [...officialAssets, ...fbxOnly];
        setAssets(merged);
        // 추천 태그가 1개 이상 매칭되면 자동 활성화
        if (!initialized.current) {
          const hasSuggested = merged.some(a => (a.tags || []).includes(SUGGESTED_TAG));
          if (hasSuggested) setSelectedTags([SUGGESTED_TAG]);
          initialized.current = true;
        }
      })
      .catch(() => {
        // 에셋 fetch 실패해도 공식 캐릭터는 보여주기
        setAssets(officialAssets);
      })
      .finally(() => setLoading(false));
  }, [officialChars]);

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
          {filtered.map(a => {
            const isOfficial = a.id.startsWith('official:');
            return (
            <button key={a.id} onClick={() => onSelect(a)} style={{
              background: isOfficial ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.05)',
              border: isOfficial ? '2px solid rgba(251,191,36,0.45)' : '2px solid rgba(255,255,255,0.08)',
              borderRadius: 12, cursor: 'pointer', overflow: 'hidden', padding: 0,
              transition: 'border-color .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = isOfficial ? '#fbbf24' : '#6366f1')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = isOfficial ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.08)')}
            >
              <div style={{
                width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                <PickerThumb asset={a} isOfficial={isOfficial} />
                <span style={{
                  position: 'absolute', top: 6, left: 6, fontSize: 9, fontWeight: 800,
                  background: isOfficial ? '#fbbf24' : '#f59e0b', color: '#fff',
                  padding: '2px 5px', borderRadius: 3,
                }}>{isOfficial ? '공식' : ext}</span>
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
            );
          })}
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
  // 애니메이션 매핑 — 코어 슬롯 + 유저 정의 커스텀 슬롯
  const [availableAnims, setAvailableAnims] = useState<{ name: string; duration: number }[]>([]);
  const [animMap, setAnimMap] = useState<Record<string, string>>({
    idle: '', walk: '', run: '', jump: '', crouch: '', prone: '',
  });
  const [autoMapBlocked, setAutoMapBlocked] = useState<Record<string, boolean>>({});
  // 운영자가 서버에 등록한 슬롯 목록 (서버에서 로드)
  const [operatorSlots, setOperatorSlots] = useState<string[]>([]);
  // 슬롯별 외부 FBX URL (유저가 직접 지정한 에셋)
  const [animSlotUrls, setAnimSlotUrls] = useState<Record<string, string>>({});
  // 에셋 피커를 열 슬롯 (null = 3D 모델 피커)
  const [slotPickerFor, setSlotPickerFor] = useState<string | null>(null);
  // 커스텀 슬롯 목록 (유저 정의: sleep, swim, skydive 등)
  const [customSlots, setCustomSlots] = useState<string[]>([]);
  const [newSlotName, setNewSlotName] = useState('');
  // 한번만 재생할 슬롯 목록 (나머지는 루프)
  const [animOneShot, setAnimOneShot] = useState<string[]>([]);
  // 각 슬롯의 트림 구간 (초)
  const [animTrims, setAnimTrims] = useState<Record<string, { start: number; end: number }>>({});
  const [previewSlot, setPreviewSlot] = useState<string>('idle');
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showMixamoGuide, setShowMixamoGuide] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [myChars, setMyChars]     = useState<MyCharacter[]>([]);
  // 공식 캐릭터 (운영자가 등록) — 모델 피커에서 후보로 노출
  const [officialChars, setOfficialChars] = useState<PublicCharacter[]>([]);
  const [selectingId, setSelectingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [sharingId, setSharingId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  const setColor = (key: string) => (val: string) =>
    setAppearance(prev => ({ ...prev, [key]: val }));

  const applyCharacterToEditor = (ch: MyCharacter) => {
    const ap = (ch.appearance || {}) as Record<string, unknown>;
    setName(ch.name || '');
    setAppearance({
      bodyColor: String(ap.bodyColor || '#4f46e5'),
      skinColor: String(ap.skinColor || '#fcd9b0'),
      hairColor: String(ap.hairColor || '#1e293b'),
      pantsColor: String(ap.pantsColor || '#1e293b'),
    });
    setModelUrl(String(ap.modelUrl || ''));
    setModelName(ch.name || '');
    setModelScale(clamp(Number(ap.modelScale ?? 1.0) || 1.0, 0.1, 3));
    setModelRotX(sanitizeRotX(ap.fbxRotX));
    setModelOffsetY(sanitizeOffsetY(ap.fbxOffsetY));
    // 새 포맷(animSlots) 우선, 없으면 이전 개별 필드에서 읽기
    const savedSlots = ap.animSlots as Record<string, string> | undefined;
    const baseMap: Record<string, string> = Object.fromEntries(operatorSlots.map(s => [s, '']));
    const nextAnimMap: Record<string, string> = savedSlots
      ? { ...baseMap, ...savedSlots }
      : {
          ...baseMap,
          idle: String(ap.idleAnim || ''),
          walk: String(ap.walkAnim || ''),
          run: String(ap.runAnim || ''),
          jump: String(ap.jumpAnim || ''),
          crouch: String(ap.crouchAnim || ''),
          prone: String(ap.proneAnim || ''),
        };
    setAnimMap(nextAnimMap);

    // 커스텀 슬롯 복원 (운영자 슬롯 + 코어 슬롯 제외한 나머지)
    const operatorSet = new Set([...operatorSlots, ...(CORE_SLOTS as readonly string[])]);
    const loadedCustom = Object.keys(nextAnimMap).filter(k => !operatorSet.has(k));
    setCustomSlots(loadedCustom);

    const savedBlocked = Array.isArray(ap.animAutoMapBlocked) ? ap.animAutoMapBlocked.map(String) : [];
    const blocked: Record<string, boolean> = {};
    for (const slot of Object.keys(nextAnimMap)) {
      blocked[slot] = savedBlocked.includes(slot) || !nextAnimMap[slot];
    }
    setAutoMapBlocked(blocked);
    setAnimTrims((ap.animTrims as Record<string, { start: number; end: number }>) || {});
    setAnimOneShot(Array.isArray(ap.animOneShot) ? (ap.animOneShot as unknown[]).map(String) : []);
    setAnimSlotUrls((ap.animSlotUrls as Record<string, string>) || {});
    setCreatingNew(false);
  };

  const resetEditorForNewCharacter = () => {
    setName('');
    setAppearance({
      bodyColor: '#4f46e5',
      skinColor: '#fcd9b0',
      hairColor: '#1e293b',
      pantsColor: '#1e293b',
    });
    setModelUrl('');
    setModelName('');
    setModelScale(1.0);
    setModelRotX(-Math.PI / 2);
    setModelOffsetY(0);
    setAvailableAnims([]);
    setAnimMap(Object.fromEntries(operatorSlots.map(s => [s, ''])));
    setAutoMapBlocked({});
    setAnimTrims({});
    setCustomSlots([]);
    setNewSlotName('');
    setAnimOneShot([]);
    setAnimSlotUrls({});
    setCreatingNew(true);
  };

  const loadCharacters = async () => {
    const token = session.getToken();
    if (!token) return;
    const res = await fetch(`${API}/api/characters`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const list: MyCharacter[] = data.characters || [];
    setMyChars(list);
    const active = list.find((c) => c.isActive) || list[0];
    if (active) applyCharacterToEditor(active);
  };

  // 공식 캐릭터 로드 — 인증 불필요
  const loadOfficialCharacters = async () => {
    try {
      const res = await fetch(`${API}/api/characters/official`);
      if (!res.ok) return;
      const data = await res.json();
      // 서버는 user 필드만 줘서 PublicCharacter 형식과 약간 다름 — 정규화
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (data.characters || []).map((c: any) => ({
        id: c.id, name: c.name, appearance: c.appearance,
        creatorName: c.user?.username || null,
      })) as PublicCharacter[];
      setOfficialChars(list);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    // 운영자가 등록한 슬롯 로드 (공개 엔드포인트, 인증 불필요)
    fetch(`${API}/api/character-animations`)
      .then(r => r.json())
      .then((data: { order?: string[] }) => {
        const slots = data.order && data.order.length > 0
          ? data.order
          : ['idle', 'walk', 'run', 'jump', 'crouch', 'prone'];
        setOperatorSlots(slots);
      })
      .catch(() => {
        setOperatorSlots(['idle', 'walk', 'run', 'jump', 'crouch', 'prone']);
      });
    loadCharacters().catch(() => {});
    loadOfficialCharacters().catch(() => {});
  }, []);

  const handleSelectAsset = (asset: Asset) => {
    setModelUrl(asset.modelUrl);
    setModelName(asset.name);
    setShowPicker(false);
    setShowMixamoGuide(false);
    setModelScale(1.0);
    setModelRotX(-Math.PI / 2);
    setModelOffsetY(0);
    setAvailableAnims([]);
    setAnimMap(Object.fromEntries(operatorSlots.map(s => [s, ''])));
    setAutoMapBlocked({});
    setAnimTrims({});
    setAnimSlotUrls({});
  };

  // availableAnims 가 새로 로드되면 이름 기반 자동 매칭
  // (단, 사용자가 이미 직접 슬롯을 채워둔 게 있으면 그건 유지)
  useEffect(() => {
    if (availableAnims.length === 0) return;
    setAnimMap(prev => {
      const matched = autoMatchAnims(availableAnims, operatorSlots);
      const next: Record<string, string> = { ...prev };
      let changed = false;
      for (const slot of Object.keys(matched)) {
        // 비어있을 때만 자동 채움 (사용자 선택 보존)
        if (!prev[slot] && matched[slot] && !autoMapBlocked[slot]) {
          next[slot] = matched[slot];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // 새로 채워진 슬롯에 대해 트림도 default 로 (start=0, end=duration)
    setAnimTrims(prev => {
      const matched = autoMatchAnims(availableAnims, operatorSlots);
      const next = { ...prev };
      let changed = false;
      for (const slot of Object.keys(matched)) {
        const name = matched[slot];
        if (name && !prev[slot] && !autoMapBlocked[slot]) {
          const dur = availableAnims.find(a => a.name === name)?.duration ?? 0;
          next[slot] = { start: 0, end: dur };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availableAnims, autoMapBlocked, operatorSlots]);

  const handleSave = async () => {
    if (!name.trim()) { setError(t('nameRequired')); return; }
    setSaving(true);
    setError('');
    const fullAppearance = modelUrl
      ? {
          ...appearance, modelUrl, modelScale, fbxRotX: modelRotX, fbxOffsetY: modelOffsetY,
          rig: 'mixamo-compatible',
          // 신포맷: animSlots에 코어 + 커스텀 슬롯 모두 저장
          animSlots: animMap,
          animAutoMapBlocked: Object.keys(animMap).filter(slot => autoMapBlocked[slot]),
          animTrims,
          animOneShot,
          animSlotUrls: Object.keys(animSlotUrls).length ? animSlotUrls : undefined,
        }
      : appearance;
    try {
      const token = session.getToken();
      const active = myChars.find((c) => c.isActive);
      const targetUrl = active
        ? (creatingNew ? `${API}/api/characters` : `${API}/api/characters/${encodeURIComponent(active.id)}`)
        : `${API}/api/characters`;
      const method = active ? (creatingNew ? 'POST' : 'PATCH') : 'POST';
      const res = await fetch(targetUrl, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), appearance: fullAppearance }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      await loadCharacters();
      setCreatingNew(false);
      router.replace('/world');
    } catch {
      setError(t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectCharacter = async (id: string) => {
    setSelectingId(id);
    setError('');
    try {
      const token = session.getToken();
      const res = await fetch(`${API}/api/characters/${encodeURIComponent(id)}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      await loadCharacters();
    } catch {
      setError(t('networkError'));
    } finally {
      setSelectingId('');
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    const target = myChars.find((c) => c.id === id);
    if (!target) return;
    if (!window.confirm(t('confirmDeleteCharacter', { name: target.name }))) return;

    setDeletingId(id);
    setError('');
    try {
      const token = session.getToken();
      const res = await fetch(`${API}/api/characters/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      await loadCharacters();
    } catch {
      setError(t('networkError'));
    } finally {
      setDeletingId('');
    }
  };

  const handleToggleShareCharacter = async (id: string, isPublic: boolean) => {
    setSharingId(id);
    setError('');
    try {
      const token = session.getToken();
      const res = await fetch(`${API}/api/characters/${encodeURIComponent(id)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      await loadCharacters();
    } catch {
      setError(t('networkError'));
    } finally {
      setSharingId('');
    }
  };

  return (
    <>
      {showPicker && (
        <AssetPickerModal onSelect={handleSelectAsset} onClose={() => setShowPicker(false)} officialChars={officialChars} />
      )}
      {slotPickerFor !== null && (
        <AssetPickerModal
          onSelect={(asset) => {
            setAnimSlotUrls(prev => ({ ...prev, [slotPickerFor]: asset.modelUrl }));
            setAnimMap(prev => ({ ...prev, [slotPickerFor]: `EXT_${slotPickerFor}` }));
            setSlotPickerFor(null);
          }}
          onClose={() => setSlotPickerFor(null)}
        />
      )}

      <div style={{
        width: '100vw', minHeight: '100vh',
        background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
        fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        boxSizing: 'border-box',
      }}>
        <CreatorNav />
        <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px',
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
            position: 'relative', alignSelf: 'flex-start',
          }}>
            <Canvas camera={{ position: [0, 0.5, 4.2], fov: 35 }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 8, 5]} intensity={1.5} />
              {/* 사용자가 마우스로 자유 회전·줌 */}
              <OrbitControls
                target={[0, -0.2, 0]}
                minDistance={2}
                maxDistance={8}
                minPolarAngle={Math.PI * 0.15}
                maxPolarAngle={Math.PI * 0.85}
                panSpeed={0.8}
              />
              {/* 바닥 기준 — 캐릭터 발이 여기 맞아야 함 */}
              {modelUrl && <GroundRef />}
              {modelUrl
                ? <CustomPreview
                    url={modelUrl}
                    userScale={modelScale}
                    rotX={modelRotX}
                    offsetY={modelOffsetY}
                    previewAnim={
                      animMap[previewSlot] ||
                      (availableAnims.some(a => a.name === `ALP_${previewSlot}`) ? `ALP_${previewSlot}` : undefined)
                    }
                    previewTrim={animMap[previewSlot] && !animMap[previewSlot].startsWith('EXT_') ? animTrims[previewSlot] : undefined}
                    previewIsOneShot={animOneShot.includes(previewSlot)}
                    onNoSkeleton={() => setShowMixamoGuide(true)}
                    onAnimationsLoaded={setAvailableAnims}
                    onPlayingClip={setPlayingClip}
                    extraSlotUrls={animSlotUrls}
                    onAutoRotXDetected={(r) => setModelRotX(r)}
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
            {/* Mixamo 리깅 안내 — 프리뷰 내 상단 오버레이 */}
            {showMixamoGuide && (
              <div style={{
                position: 'absolute', top: 8, left: 8, right: 8,
                padding: '5px 8px', borderRadius: 6,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', gap: 6,
                pointerEvents: 'auto',
              }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flex: 1, lineHeight: 1.4 }}>
                  💡 {t('mixamoGuideDesc')}
                </span>
                <a
                  href="https://www.mixamo.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0, fontSize: 10, color: '#a5b4fc', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  {t('mixamoGoButton')} ↗
                </a>
              </div>
            )}
          </div>

          {/* 설정 패널 — 독립 스크롤 */}
          <div style={{ width: 300, overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
            <h2 style={{ color: '#fff', margin: '0 0 18px', fontSize: 20, fontWeight: 800 }}>{t('title')}</h2>

            {myChars.length > 0 && (
              <div style={{
                marginBottom: 16, padding: '12px 14px',
                background: 'rgba(16,185,129,0.08)', borderRadius: 12,
                border: '1px solid rgba(16,185,129,0.2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{t('myCharacters')}</div>
                  <button
                    onClick={resetEditorForNewCharacter}
                    style={{
                      border: '1px solid rgba(99,102,241,0.45)',
                      background: creatingNew ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)',
                      color: '#c7d2fe',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      padding: '4px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    {t('newCharacter')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {myChars.map((ch) => (
                    <div
                      key={ch.id}
                      style={{
                        display: 'flex', gap: 6, alignItems: 'center',
                      }}
                    >
                      <button
                        onClick={() => { applyCharacterToEditor(ch); handleSelectCharacter(ch.id); }}
                        disabled={selectingId === ch.id || deletingId === ch.id}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none',
                          background: ch.isActive ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)',
                          color: '#fff', fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
                        <span style={{ opacity: 0.8, fontSize: 11 }}>
                          {selectingId === ch.id ? t('saving') : (ch.isActive ? t('activeCharacter') : t('selectCharacter'))}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteCharacter(ch.id)}
                        disabled={deletingId === ch.id || selectingId === ch.id}
                        style={{
                          border: '1px solid rgba(239,68,68,0.45)',
                          background: 'rgba(239,68,68,0.15)',
                          color: '#fecaca',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '8px 8px',
                          cursor: 'pointer',
                          minWidth: 44,
                        }}
                      >
                        {deletingId === ch.id ? t('saving') : t('deleteCharacter')}
                      </button>
                      <button
                        onClick={() => handleToggleShareCharacter(ch.id, !!ch.isPublic)}
                        disabled={sharingId === ch.id || deletingId === ch.id || selectingId === ch.id}
                        style={{
                          border: '1px solid rgba(59,130,246,0.45)',
                          background: ch.isPublic ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)',
                          color: '#bfdbfe',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '8px 8px',
                          cursor: 'pointer',
                          minWidth: 56,
                        }}
                      >
                        {sharingId === ch.id
                          ? t('saving')
                          : (ch.isPublic ? t('sharedOn') : t('shareCharacter'))}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {/* 애니메이션 매핑 */}
            {modelUrl && availableAnims.length > 0 && operatorSlots.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {t('animMapping', { count: availableAnims.filter(a => !a.name.startsWith('ALP_')).length })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {operatorSlots.map(slot => {
                    const knownLabels: Record<string, string> = {
                      idle: t('idleAnimLabel'), walk: t('walkAnimLabel'), run: t('runAnimLabel'),
                      jump: t('jumpAnimLabel'), crouch: t('crouchAnimLabel'), prone: t('proneAnimLabel'),
                    };
                    const label = knownLabels[slot] ?? slot;
                    const animName = animMap[slot] ?? '';
                    const animMeta = availableAnims.find(a => a.name === animName);
                    const duration = animMeta?.duration ?? 0;
                    const trim     = animTrims[slot] ?? { start: 0, end: duration };
                    const active   = previewSlot === slot;
                    return (
                      <div key={slot}>
                        {/* 한 줄: 라벨 + 드롭다운 + 재생 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            width: 46, fontSize: 10, color: active ? '#10b981' : 'rgba(255,255,255,0.4)',
                            flexShrink: 0, fontWeight: active ? 700 : 400,
                          }}>{label}</span>
                          <select
                            value={animName}
                            onChange={e => {
                              const name = e.target.value;
                              setAnimMap(prev => ({ ...prev, [slot]: name }));
                              setAutoMapBlocked(prev => ({ ...prev, [slot]: name === '' }));
                              const dur = availableAnims.find(a => a.name === name)?.duration ?? 0;
                              setAnimTrims(prev => ({ ...prev, [slot]: { start: 0, end: dur } }));
                              setPreviewSlot(slot);
                            }}
                            onFocus={() => setPreviewSlot(slot)}
                            style={{
                              flex: 1, background: 'rgba(0,0,0,0.35)',
                              border: active ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 6px', outline: 'none',
                            }}
                          >
                            <option value="">{t('noneOption')}</option>
                            {availableAnims.filter(a => !a.name.startsWith('ALP_')).map(a => (
                              <option key={a.name} value={a.name}>{a.name} ({a.duration.toFixed(1)}s)</option>
                            ))}
                          </select>
                          <button onClick={() => setPreviewSlot(slot)} title={t('previewLabel')} style={{
                            width: 26, height: 26, borderRadius: 4, border: 'none', flexShrink: 0,
                            background: active ? '#10b981' : 'rgba(255,255,255,0.07)',
                            color: '#fff', cursor: 'pointer', fontSize: 9,
                          }}>▶</button>
                          {/* 에셋 피커 버튼 */}
                          <button
                            title="내 에셋에서 FBX 선택"
                            onClick={() => setSlotPickerFor(slot)}
                            style={{
                              width: 26, height: 26, borderRadius: 4, border: 'none', flexShrink: 0,
                              background: animSlotUrls[slot] ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)',
                              color: animSlotUrls[slot] ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                              cursor: 'pointer', fontSize: 11,
                            }}
                          >📂</button>
                          {animSlotUrls[slot] && (
                            <button
                              title="외부 에셋 해제"
                              onClick={() => {
                                setAnimSlotUrls(prev => { const n = { ...prev }; delete n[slot]; return n; });
                                if (animMap[slot] === `EXT_${slot}`) setAnimMap(prev => ({ ...prev, [slot]: '' }));
                              }}
                              style={{ width: 18, height: 26, borderRadius: 4, border: 'none', flexShrink: 0, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer', fontSize: 9 }}
                            >✕</button>
                          )}
                        </div>
                        {/* 트림 — 활성 슬롯 + 애니메이션 선택 시만 표시 */}
                        {active && animName && duration > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, paddingLeft: 50 }}>
                            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{t('trimStart')}</span>
                            <input type="number" step={0.05} min={0} max={duration} value={trim.start.toFixed(2)}
                              onChange={e => { const s = Math.max(0, Math.min(duration, Number(e.target.value) || 0)); setAnimTrims(prev => ({ ...prev, [slot]: { start: s, end: Math.max(s + 0.05, trim.end) } })); }}
                              style={{ width: 44, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#fff', fontSize: 9, padding: '2px 4px', outline: 'none', textAlign: 'right' }} />
                            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>{t('trimEnd')}</span>
                            <input type="number" step={0.05} min={0} max={duration} value={trim.end.toFixed(2)}
                              onChange={e => { const ev = Math.max(trim.start + 0.05, Math.min(duration, Number(e.target.value) || duration)); setAnimTrims(prev => ({ ...prev, [slot]: { start: trim.start, end: ev } })); }}
                              style={{ width: 44, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#fff', fontSize: 9, padding: '2px 4px', outline: 'none', textAlign: 'right' }} />
                            <button onClick={() => setAnimTrims(prev => ({ ...prev, [slot]: { start: 0, end: duration } }))}
                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 9, padding: '0 4px', cursor: 'pointer' }}>
                              {t('trimFull')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 커스텀 슬롯 — 유저 정의 (sleep, swim, skydive 등) */}
            {modelUrl && availableAnims.filter(a => !a.name.startsWith('ALP_')).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {t('customSlotsLabel')}
                </div>

                {/* 기존 커스텀 슬롯 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {customSlots.map(slot => {
                    const animName = animMap[slot] ?? '';
                    const active = previewSlot === slot;
                    return (
                      <div key={slot}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            width: 46, fontSize: 10, color: active ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                            flexShrink: 0, fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }} title={slot}>{slot}</span>
                          <select
                            value={animName}
                            onChange={e => {
                              const name = e.target.value;
                              setAnimMap(prev => ({ ...prev, [slot]: name }));
                              setPreviewSlot(slot);
                            }}
                            onFocus={() => setPreviewSlot(slot)}
                            style={{
                              flex: 1, background: 'rgba(0,0,0,0.35)',
                              border: active ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 6px', outline: 'none',
                            }}
                          >
                            <option value="">{t('noneOption')}</option>
                            {availableAnims.filter(a => !a.name.startsWith('ALP_')).map(a => (
                              <option key={a.name} value={a.name}>{a.name} ({a.duration.toFixed(1)}s)</option>
                            ))}
                          </select>
                          <button onClick={() => setPreviewSlot(slot)} style={{
                            width: 26, height: 26, borderRadius: 4, border: 'none', flexShrink: 0,
                            background: active ? '#7c3aed' : 'rgba(255,255,255,0.07)',
                            color: '#fff', cursor: 'pointer', fontSize: 9,
                          }}>▶</button>
                          <button
                            title="내 에셋에서 FBX 선택"
                            onClick={() => setSlotPickerFor(slot)}
                            style={{
                              width: 26, height: 26, borderRadius: 4, border: 'none', flexShrink: 0,
                              background: animSlotUrls[slot] ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)',
                              color: animSlotUrls[slot] ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                              cursor: 'pointer', fontSize: 11,
                            }}
                          >📂</button>
                          {animSlotUrls[slot] && (
                            <button
                              title="외부 에셋 해제"
                              onClick={() => {
                                setAnimSlotUrls(prev => { const n = { ...prev }; delete n[slot]; return n; });
                                if (animMap[slot] === `EXT_${slot}`) setAnimMap(prev => ({ ...prev, [slot]: '' }));
                              }}
                              style={{ width: 18, height: 26, borderRadius: 4, border: 'none', flexShrink: 0, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer', fontSize: 9 }}
                            >✕</button>
                          )}
                          <button
                            onClick={() => {
                              setCustomSlots(prev => prev.filter(s => s !== slot));
                              setAnimMap(prev => { const n = { ...prev }; delete n[slot]; return n; });
                              setAnimOneShot(prev => prev.filter(s => s !== slot));
                            }}
                            style={{ width: 22, height: 26, borderRadius: 4, border: 'none', flexShrink: 0, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 새 슬롯 추가 */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={newSlotName}
                    onChange={e => setNewSlotName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder={t('customSlotPlaceholder')}
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.15)',
                      borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 8px', outline: 'none',
                    }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      const name = newSlotName.trim();
                      if (!name || customSlots.includes(name) || (CORE_SLOTS as readonly string[]).includes(name)) return;
                      setCustomSlots(prev => [...prev, name]);
                      setAnimMap(prev => ({ ...prev, [name]: '' }));
                      setNewSlotName('');
                    }}
                  />
                  <button
                    onClick={() => {
                      const name = newSlotName.trim();
                      if (!name || customSlots.includes(name) || (CORE_SLOTS as readonly string[]).includes(name)) return;
                      setCustomSlots(prev => [...prev, name]);
                      setAnimMap(prev => ({ ...prev, [name]: '' }));
                      setNewSlotName('');
                    }}
                    style={{
                      padding: '4px 10px', borderRadius: 5, border: 'none', fontSize: 11,
                      background: 'rgba(99,102,241,0.25)', color: '#c7d2fe', cursor: 'pointer',
                    }}
                  >+ {t('customSlotAdd')}</button>
                </div>
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
              {saving ? t('saving') : t('saveAndEnterWorld')}
            </button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
