'use client';
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky, Environment, Edges } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { buildFolderTree, normalizeFolder } from '@/lib/assets/folders';
import type { FolderNode } from '@/lib/assets/folders';
import { getKind } from '@/lib/assets/registry';
import '@/lib/assets/kinds'; // kind 핸들러(Thumbnail/Preview) 등록 — 사이드이펙트
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';
import type { Asset as RegistryAsset } from '@/lib/assets/types';
import PostFX, { derivePostFX, collectPostFXZones, collectWaterPostFX, type PostFXZone, type WaterPostFX } from '@/lib/world/PostFX';
import Particles, { deriveParticleSettings } from '@/lib/world/Particles';
import SignText from '@/lib/world/SignText';
import { devLog } from '@/lib/devLog';
import { PerfManager } from '@/lib/world/PerfManager';
import { FlashlightLight } from '@/lib/world/FlashlightLight';
import { computeSunDir } from '@/lib/world/CsmSun';
import { SoundEmitter } from '@/lib/world/SoundEmitter';
import { UIRenderer } from '@/lib/world/UIRenderer';
import { UIWorldRenderer } from '@/lib/world/UIWorldRenderer';
import { TerrainMesh } from '@/lib/world/TerrainMesh';
import { CarvedMesh, type CsgCut } from '@/lib/world/CarvedMesh';
import { VoxelTerrainMesh } from '@/lib/world/VoxelTerrainMesh';
import { ChunkedVoxelTerrain } from '@/lib/world/ChunkedVoxelTerrain';
import { TerrainSculptMesh, type TerrainTool } from '@/lib/world/TerrainSculptMesh';
import { makeFlatTerrain, generateNoiseTerrain, type TerrainData } from '@/lib/world/terrain';
import { makeDefaultUiData, parseAiUiRoot, AI_UI_PROMPT_GUIDE, type UiElementType, type UiData, type RectTransform, type AiUiRoot } from '@/lib/world/uiObjects';
import { UiInspector } from './UiInspector';
import { createGameRuntime } from '@/lib/world/gameRuntime';
import { execUiButtonScript } from '@/lib/world/uiButtonScript';
import GameHud from '@/components/world/GameHud';
import WorldDevConsole from '@/components/world/WorldDevConsole';
import { VideoScreenMaterial, YouTubeMeshMaterial, YouTubeMaybeOverlay, VideoScreenCtx, parseYouTubeId, parseUrlKind, normalizeMediaUrl, ImageMaterial, GenericIframeOverlay, VideoRemotePanel, VideoDistanceUpdater, VideoInitialStateApplier, type VideoRegistry, type VideoHandle } from '@/components/world/VideoScreen';
import AiGuideModal from './AiGuideModal';
import StudioTopBar from './StudioTopBar';
import StudioShortcutsModal from './StudioShortcutsModal';
import ScriptComponentsModal from './ScriptComponentsModal';
import ScriptAssetEditor from '@/components/assets/ScriptAssetEditor';
import StudioMarketModal from '@/components/studio/StudioMarketModal';
import { MAP_APPLY_EVENT } from '@/lib/assets/kinds/map';
import { COMPONENT_DEFS, getComponentDef, findComponent, getProp, computeBuoyancyVolumes, computeAmbientSoundZones, findDayNightComponent, computeSeats, type ComponentInstance, type ComponentType, type BuoyancyVolume, type ComponentPropDef, type AmbientSoundZone, type SeatSpot } from '@/lib/world/components';
import AmbientSoundsPlayer from '@/lib/world/AmbientSounds';
import DayNightCycle from '@/lib/world/DayNightCycle';
import SeatController from '@/lib/world/SeatController';
import { sampleKeyframeAnim, normalizeKeyframeAnim, applySampledTRS, composeSampledWorld, type KeyframeAnim, type KeyFrame } from '@/lib/world/keyframeAnim';
import { Player, type PlayerControl } from '@/components/world/WorldCanvas';

const KIND_LABELS: Record<string, string> = { cube: '큐브', sphere: '구체', cylinder: '실린더', plane: '평면', water: '물', asset: '에셋', pointlight: '포인트 라이트', spotlight: '스폿 라이트', dirlight: '방향광', spawn: '스폰 포인트', empty: '빈 오브젝트', terrain: '지형', voxel: '복셀 지형' };
const KIND_ICONS:  Record<string, string> = { cube: '📦', sphere: '⚪', cylinder: '🥫', plane: '▭', asset: '🎲', pointlight: '💡', spotlight: '🔦', dirlight: '☀', spawn: '🎯', empty: '🔵', terrain: '🗻', voxel: '⛏' };
/** 레이어 0~9 색상 — 유니티 식 (0=Default, 1~9 사용자 레이어). 트리 배지 + 패널 색칠 공용. */
const LAYER_COLORS: Record<number, string> = { 0: '#475569', 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e', 5: '#14b8a6', 6: '#3b82f6', 7: '#8b5cf6', 8: '#ec4899', 9: '#64748b' };

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

/** 외부 모델(GLB/FBX) 머티리얼 보정 — 검정/투명하게 나오는 문제 해결.
 *  - 정점 색(vertex color) 속성이 있으면 켠다 (Quaternius 류 저폴리 모델의 색 표현).
 *  - 알파 블렌드인데 불투명도 1 인 머티리얼(잎/풀 컷아웃)은 alphaTest + 양면으로 바꿔
 *    통째로 투명하게 사라지는 것 방지. (불투명도 < 1 인 진짜 반투명(유리)은 그대로 둠) */
function fixModelMaterials(mesh: THREE.Mesh) {
  const hasVColor = !!mesh.geometry?.getAttribute?.('color');
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => {
    const mat = m as THREE.MeshStandardMaterial;
    if (!mat) return;
    if (hasVColor && !mat.vertexColors) mat.vertexColors = true;
    // colormap 텍스처가 linear 로 잡혀 어둡게 나오는 것 보정 → sRGB
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    // 텍스처가 있는데 베이스색이 너무 어두우면(검게 곱해짐) 흰색으로
    if (mat.map && mat.color && mat.color.getHex() < 0x202020) mat.color.set('#ffffff');
    if (mat.transparent && (mat.opacity ?? 1) >= 0.99) {
      mat.transparent = false;
      mat.alphaTest = 0.5;
      mat.side = THREE.DoubleSide;
      mat.depthWrite = true;
    }
    mat.needsUpdate = true;
  });
}

/* ── TransformControls 기즈모 핸들 hover/drag 상태 (전역 가드) ──
   화살표/링 위에 마우스가 있을 땐 그 뒤의 메시가 선택되지 않도록 막는 용도
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tcRef: { current: any } = { current: null };
// BoxResizeGizmo drag 상태 — 마퀴 selection / 다른 클릭 처리가 무시하도록 외부 flag.
const boxResizeActive: { current: boolean } = { current: false };
function isGizmoActive(): boolean {
  const tc = tcRef.current;
  if (boxResizeActive.current) return true;
  if (!tc) return false;
  return !!tc.axis || !!tc.dragging;
}
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { session, api } from '@/lib/api';
import type { Prefab, ScriptComponent, ScriptComponentPropDef } from '@/lib/api';
import { extractScriptVars } from '@/lib/world/jsRuntime';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitRef = any;

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

/* ── 데이터 모델 ───────────────────────────── */
import type { ObjectKind } from '@/lib/world/objectKinds';

type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

interface MapObject {
  id: string;
  label?: string;
  locked?: boolean;
  hidden?: boolean;
  /** 유니티 식 레이어 (0-9). 미설정 시 0(Default). 레이어별로 트리/렌더 표시·숨김 가능. */
  layer?: number;
  parentId?: string | null;
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
  videoUrl?:         string;   // 표면에 재생할 영상(TV 화면). 설정 시 텍스처 대신 비디오 재질.
  // 조명 전용
  lightColor?:     string;
  lightIntensity?: number;
  lightDistance?:  number;
  lightAngle?:     number;   // 스폿 각도 (degrees)
  lightPenumbra?:  number;   // 스폿 경계 부드러움 0-1
  castShadow?:     boolean;
  // 물리
  physics?: 'none' | 'fixed' | 'dynamic';
  // 1인칭 grab 가능 여부 — 레거시 (components 의 grab 으로 대체)
  grabbable?: boolean;
  // Unity 스타일 컴포넌트 — Grab / AutoRotate 등
  components?: import('@/lib/world/components').ComponentInstance[];
  // 키프레임 애니메이션 (타임라인에서 제작 — 위치/회전/스케일 트랙)
  keyframeAnim?: import('@/lib/world/keyframeAnim').KeyframeAnim;
  // JavaScript 스크립트
  script?: string;
  // 스크립트 인스펙터 변수 오버라이드 (유니티 직렬화 필드처럼) — 코드의 top-level 변수 기본값을 덮어씀
  scriptVars?: Record<string, number | string | boolean>;
  // UI 오브젝트 (kind === 'ui' 일 때만) — Canvas / Image / Text / Button / Panel
  ui?: import('@/lib/world/uiObjects').UiData;
  // Terrain 데이터 (kind === 'terrain' 일 때만) — heightmap 기반 지면
  terrain?: import('@/lib/world/terrain').TerrainData;
  // CSG 절삭 (kind === 'cube' 일 때) — 깎여서 구멍/홈 생김
  csgCuts?: import('@/lib/world/CarvedMesh').CsgCut[];
  // 복셀 지형 (kind === 'voxel' 일 때) — 아스트로니어식 파기/쌓기
  voxel?: import('@/lib/world/voxelVolume').VoxelVolumeData;
  // Sound 오브젝트 (kind === 'sound' 일 때만) — 위치 기반 사운드
  soundUrl?: string;        // 오디오 파일 URL
  soundVolume?: number;     // 0~1
  soundLoop?: boolean;
  soundAutoplay?: boolean;  // 시작 시 자동 재생
  soundRadius?: number;     // 거리 감쇠 반경 (m), 0 = 거리 무관 (전역)
}

interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  folder?: string | null;
  kind?: string | null;     // asset_kinds.id — 'model' | 'script' | 'image' | ...
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  materialConfig?: any;     // 구버전 (DEPRECATED)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;           // 신규 — metadata.materialConfig
}

/** assetUrl → 모델 내장 애니메이션 클립 이름 목록. AssetMesh 가 로드 시 채움. Animator 인스펙터 드롭다운용. */
const _assetClipCache = new Map<string, string[]>();
/** 키프레임 시뮬 키네마틱 + 편집 미리보기 합성용 재사용 임시 객체 */
const _simKfPos = { x: 0, y: 0, z: 0 };
const _simKfQuat = { x: 0, y: 0, z: 0, w: 1 };
const _kfPreviewObj = new THREE.Object3D();
/** (x,y,z)가 물(buoyancy) 부피 안이면 잠긴 깊이(m), 아니면 0. 스크립트 world.isUnderwater/getDepth 용. */
function studioWaterDepthAt(vols: BuoyancyVolume[] | undefined, x: number, y: number, z: number): number {
  if (!vols) return 0;
  for (const bv of vols) {
    if (Math.abs(x - bv.cx) > bv.hx || Math.abs(z - bv.cz) > bv.hz) continue;
    const surf = bv.cy + bv.offset;
    if (y <= surf && y >= bv.cy - bv.scaleY) return surf - y;
  }
  return 0;
}

/* ── Unity 스타일 컴포넌트 섹션 (인스펙터) ──
   부착된 컴포넌트 카드 + "+ 컴포넌트 추가" 버튼. 각 카드는 props 편집 input 포함. */
function ComponentsSection({
  selected, setObjects, pushHistory, allObjects, openPicker, scriptComponents, officialScriptComponents, onColliderAutoFit, onEditScriptComponent, onSelectId, onAttachFromAsset,
}: {
  selected: MapObject;
  setObjects: (updater: (prev: MapObject[]) => MapObject[]) => void;
  pushHistory: (objs: MapObject[]) => void;
  allObjects: MapObject[];
  openPicker: () => void;
  scriptComponents: ScriptComponent[];
  officialScriptComponents: ScriptComponent[];
  onColliderAutoFit: (compIdx: number) => void;
  onEditScriptComponent: (scriptComponentId: string) => void;
  /** target 리스트 row 클릭 시 그 id 를 씬 트리에서 선택 */
  onSelectId: (id: string) => void;
  /** 에셋 그리드에서 드래그된 스크립트 에셋을 컴포넌트로 부착 */
  onAttachFromAsset: (assetId: string) => void;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const list = selected.components ?? [];
  const [dropOver, setDropOver] = useState(false);
  // Animator 클립 캐시 갱신 시 리렌더 (모델 비동기 로드 후 드롭다운 채우기)
  const [, setClipVer] = useState(0);
  useEffect(() => {
    const h = () => setClipVer(v => v + 1);
    window.addEventListener('alp-clips-loaded', h);
    return () => window.removeEventListener('alp-clips-loaded', h);
  }, []);
  // 레거시: grabbable 플래그도 가상 컴포넌트로 표시 (제거 시 plain false)
  const legacyGrab = !!selected.grabbable && !list.some(c => c.type === 'grab');

  const removeComponent = (idx: number) => {
    setObjects(prev => prev.map(o => o.id === selected.id
      ? { ...o, components: (o.components ?? []).filter((_, i) => i !== idx) }
      : o));
    pushHistory(allObjects);
  };

  const updateProp = (idx: number, key: string, value: number | string | boolean) => {
    setObjects(prev => prev.map(o => {
      if (o.id !== selected.id) return o;
      const next = [...(o.components ?? [])];
      const cur = next[idx];
      next[idx] = { ...cur, props: { ...(cur.props ?? {}), [key]: value } };
      return { ...o, components: next };
    }));
  };

  const removeLegacyGrab = () => {
    setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, grabbable: false } : o));
    pushHistory(allObjects);
  };

  return (
    <div
      style={{
        marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', marginBottom: 10,
        outline: dropOver ? '2px dashed #34d399' : 'none',
        background: dropOver ? 'rgba(52,211,153,0.06)' : 'transparent',
        borderRadius: dropOver ? 6 : 0,
        transition: 'outline 0.1s, background 0.1s',
      }}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('text/plain')) return;
        e.preventDefault();
        // dropEffect 는 소스의 effectAllowed 와 호환돼야 — 'move' 로 맞춤 (StudioAssetCard 가 'move' 로 설정)
        e.dataTransfer.dropEffect = 'move';
        if (!dropOver) setDropOver(true);
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false); }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation();
        setDropOver(false);
        const id = e.dataTransfer.getData('text/plain');
        devLog('[ComponentsSection.drop] assetId=', id);
        if (id) onAttachFromAsset(id);
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: 0.5 }}>COMPONENTS</div>
        <button type="button" onClick={openPicker}
          style={{ background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.45)', color: '#a5b4fc', borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
          {tCanvas("btn_add_component")}
        </button>
      </div>
      {/* 레거시 grabbable 표시 */}
      {legacyGrab && (
        <ComponentCard
          icon="✋" name={tCanvas("comp_grab_legacy")}
          onRemove={removeLegacyGrab}
        />
      )}
      {list.map((c, idx) => {
        // user: 접두사 → 유저 정의 컴포넌트 카드 (자유 props 편집)
        // 내 컴포넌트 또는 공식 컴포넌트에서 찾기
        if (c.type.startsWith('user:')) {
          const userId = c.type.slice(5);
          const sc = scriptComponents.find(s => s.id === userId)
                  ?? officialScriptComponents.find(s => s.id === userId);
          // 내가 만든 컴포넌트(scriptComponents)면 코드 편집 가능. 공식 컴포넌트는 불가.
          const isOwn = scriptComponents.some(s => s.id === userId);
          return (
            <UserComponentCard
              key={idx}
              instance={c}
              scriptComponent={sc}
              onEdit={isOwn ? () => onEditScriptComponent(userId) : undefined}
              objectId={selected.id}
              componentIdx={idx}
              allObjects={allObjects}
              onSelectId={onSelectId}
              onRemove={() => removeComponent(idx)}
              onPropsChange={(props) => {
                setObjects(prev => prev.map(o => {
                  if (o.id !== selected.id) return o;
                  const next = [...(o.components ?? [])];
                  next[idx] = { ...next[idx], props };
                  return { ...o, components: next };
                }));
              }}
              onPropsCommit={() => pushHistory(allObjects)}
            />
          );
        }
        // Collider — 전용 카드 (크기 입력 + 자동 맞춤 버튼)
        if (c.type === 'collider') {
          return (
            <ColliderCard
              key={idx}
              instance={c}
              onRemove={() => removeComponent(idx)}
              onChange={(key, val) => updateProp(idx, key, val)}
              onCommit={() => pushHistory(allObjects)}
              onAutoFit={() => onColliderAutoFit(idx)}
            />
          );
        }
        const def = getComponentDef(c.type);
        if (!def) return null;
        return (
          <ComponentCard
            key={idx}
            icon={def.icon}
            name={def.name}
            onRemove={() => removeComponent(idx)}
          >
            {(() => {
            const renderField = (p: ComponentPropDef) => {
              const val = c.props?.[p.key] ?? p.default;
              // 미디어 리모컨의 target prop — 리스트 UI (각 row 클릭 시 그 오브젝트 선택, × 로 삭제, 드래그 드롭으로 추가)
              if (def.type === 'videoRemote' && p.key === 'target') {
                const raw = String(val).trim();
                const tokens = raw ? raw.split(/[,\s]+/).filter(Boolean) : [];
                const writeTokens = (next: string[]) => {
                  updateProp(idx, p.key, next.join(', '));
                  pushHistory(allObjects);
                };
                const tokenLabel = (t: string) => {
                  const o = allObjects.find(x => x.id === t);
                  return o ? (o.label || (o as { name?: string }).name || o.id) : t;
                };
                const tokenExists = (t: string) => allObjects.some(x => x.id === t);
                return (
                  <div key={p.key} style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>{p.label}</div>
                    <div
                      data-videoremote-target={`${selected.id}|${idx}`}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 3,
                        background: 'rgba(0,0,0,0.25)', border: '1px dashed rgba(255,255,255,0.18)',
                        borderRadius: 5, padding: 4, minHeight: 24,
                      }}
                    >
                      {tokens.length === 0 && (
                        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center', padding: '4px 0' }}>
                          {tCanvas("vr_target_empty_hint")}
                        </div>
                      )}
                      {tokens.map(t => {
                        const exists = tokenExists(t);
                        return (
                          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, background: exists ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${exists ? 'rgba(99,102,241,0.35)' : 'rgba(239,68,68,0.35)'}`, borderRadius: 4, padding: '3px 6px' }}>
                            <button type="button"
                              onClick={() => { if (exists) onSelectId(t); }}
                              disabled={!exists}
                              title={exists ? tCanvas("tooltip_select_in_tree", { id: t }) : tCanvas("tooltip_missing_token", { id: t })}
                              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: exists ? '#c7d2fe' : '#fca5a5', fontSize: 10, cursor: exists ? 'pointer' : 'default', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tokenLabel(t)}
                            </button>
                            <button type="button" onClick={() => writeTokens(tokens.filter(x => x !== t))}
                              title={tCanvas("btn_delete")}
                              style={{ background: 'rgba(239,68,68,0.25)', border: 'none', color: '#fca5a5', borderRadius: 3, padding: '0 5px', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1.6 }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              if (p.type === 'number') {
                return (
                  <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75, marginTop: 4 }}>
                    {p.label}
                    <NumField value={Number(val)}
                      onChange={n => updateProp(idx, p.key, n)}
                      onCommit={() => pushHistory(allObjects)}
                      step={p.step ?? 0.1}
                      style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
                  </label>
                );
              }
              if (p.type === 'boolean') {
                return (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, opacity: 0.75, marginTop: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!val}
                      onChange={e => { updateProp(idx, p.key, e.target.checked); pushHistory(allObjects); }} />
                    {p.label}
                  </label>
                );
              }
              if (p.type === 'enum' && p.options && p.options.length > 0) {
                return (
                  <div key={p.key} style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>{p.label}</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {p.options.map(opt => {
                        const active = String(val) === opt;
                        return (
                          <button key={opt} type="button"
                            onClick={() => { updateProp(idx, p.key, opt); pushHistory(allObjects); }}
                            style={{
                              flex: '1 0 auto', minWidth: 30,
                              background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${active ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
                              color: active ? '#c7d2fe' : 'rgba(255,255,255,0.65)',
                              borderRadius: 4, padding: '4px 6px', fontSize: 10, fontWeight: active ? 700 : 500, cursor: 'pointer',
                            }}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              if (p.type === 'color') {
                return (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10, opacity: 0.75, marginTop: 4 }}>
                    {p.label}
                    <input type="color" value={String(val)}
                      onChange={e => updateProp(idx, p.key, e.target.value)}
                      onBlur={() => pushHistory(allObjects)}
                      style={{ width: 36, height: 22, padding: 0, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
                  </label>
                );
              }
              // Animator clip — 모델 내장 클립 드롭다운 (로드되면 목록, 아니면 텍스트 입력)
              if (def.type === 'animator' && p.key === 'clip') {
                const clips = (selected.assetUrl && _assetClipCache.get(selected.assetUrl)) || [];
                return (
                  <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75, marginTop: 4 }}>
                    {p.label}
                    {clips.length > 0 ? (
                      <select value={String(val)} onChange={e => { updateProp(idx, p.key, e.target.value); pushHistory(allObjects); }}
                        style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }}>
                        <option value="">(첫 번째 클립)</option>
                        {clips.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={String(val)} onChange={e => updateProp(idx, p.key, e.target.value)} onBlur={() => pushHistory(allObjects)}
                        placeholder="클립 이름 (모델을 뷰포트에 띄우면 목록 표시)"
                        style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
                    )}
                  </label>
                );
              }
              // string — 씬 트리에서 오브젝트 드래그해 드롭하면 라벨/이름이 콤마로 추가됨 (target prop 편의).
              return (
                <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75, marginTop: 4 }}>
                  {p.label}
                  <input type="text" value={String(val)}
                    onChange={e => updateProp(idx, p.key, e.target.value)}
                    onBlur={() => pushHistory(allObjects)}
                    onDragOver={e => {
                      if (e.dataTransfer.types.includes('application/x-alp-asset-url') || e.dataTransfer.types.includes('application/x-alp-objid') || e.dataTransfer.types.includes('application/x-alp-objlabel')) {
                        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
                      }
                    }}
                    onDrop={e => {
                      // 내 에셋에서 드래그한 에셋 URL → 단일 URL 교체 (수영 애니 등)
                      const assetUrl = e.dataTransfer.getData('application/x-alp-asset-url');
                      if (assetUrl) { e.preventDefault(); updateProp(idx, p.key, assetUrl); pushHistory(allObjects); return; }
                      // 씬 트리 오브젝트 id/label → 콤마로 추가 (target prop 편의)
                      const dropped = e.dataTransfer.getData('application/x-alp-objid') || e.dataTransfer.getData('application/x-alp-objlabel');
                      if (!dropped) return;
                      e.preventDefault();
                      const cur = String(val).trim();
                      const tokens = cur ? cur.split(/[,\s]+/).filter(Boolean) : [];
                      if (!tokens.includes(dropped)) tokens.push(dropped);
                      updateProp(idx, p.key, tokens.join(', '));
                      pushHistory(allObjects);
                    }}
                    placeholder={p.label.includes('URL') ? tCanvas("placeholder_drag_asset_or_url") : (p.label.includes('드래그') || p.key === 'target' ? tCanvas("placeholder_drag_object_from_tree") : undefined)}
                    style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
                </label>
              );
            };
            const allP = def.props ?? [];
            const basics = allP.filter(p => p.group !== 'advanced');
            const advs = allP.filter(p => p.group === 'advanced');
            return (
              <>
                {basics.map(renderField)}
                {advs.length > 0 && (
                  <details style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
                    <summary style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', padding: '2px 0' }}>
                      ⚙ {tCanvas("advanced_settings")}
                    </summary>
                    <div style={{ paddingLeft: 2 }}>{advs.map(renderField)}</div>
                  </details>
                )}
              </>
            );
            })()}
          </ComponentCard>
        );
      })}
      {list.length === 0 && !legacyGrab && (
        <div style={{ fontSize: 10, opacity: 0.35, textAlign: 'center', padding: '8px 0' }}>{tCanvas("msg_no_components")}</div>
      )}
    </div>
  );
}

/* 유저 정의 컴포넌트 카드 — schema 가 있으면 타입별 input, 없으면 자유 key:value 편집 */
function UserComponentCard({
  instance, scriptComponent, onRemove, onPropsChange, onPropsCommit, objectId, componentIdx, allObjects, onEdit, onSelectId,
}: {
  instance: ComponentInstance;
  scriptComponent: ScriptComponent | undefined;
  onRemove: () => void;
  onPropsChange: (props: Record<string, number | string | boolean>) => void;
  onPropsCommit: () => void;
  objectId: string;
  componentIdx: number;
  allObjects: MapObject[];
  /** 내가 만든 컴포넌트면 코드 편집 — 있으면 헤더에 edit 버튼 노출 */
  onEdit?: () => void;
  /** 오브젝트 참조 슬롯에 표시된 ref 라벨 클릭 시 그 오브젝트를 씬 트리에서 선택 */
  onSelectId?: (id: string) => void;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const props = (instance.props ?? {}) as Record<string, number | string | boolean>;
  const [open, setOpen] = useState(true);
  const propsSchema = scriptComponent?.propsSchema ?? [];
  // 유니티식 — 코드에 선언한 top-level 변수(let x = 5)를 자동 감지해 인스펙터에 노출.
  // 수동 propsSchema 에 이미 있는 키는 그쪽(라벨·min/max 등 풍부) 우선, 없는 것만 자동 추가.
  const autoVars = useMemo(() => scriptComponent?.code ? extractScriptVars(scriptComponent.code) : [], [scriptComponent?.code]);
  // 오브젝트 참조 변수(let x = null) 는 드롭 슬롯으로 따로 렌더, 나머지(숫자/문자/불리언)만 schema 로.
  const objectVars = autoVars.filter(v => v.type === 'object');
  const schema: ScriptComponentPropDef[] = [
    ...propsSchema,
    ...autoVars
      .filter(v => v.type !== 'object' && !propsSchema.some(p => p.key === v.key))
      .map(v => ({ key: v.key, label: v.key, type: v.type as ScriptComponentPropDef['type'], default: v.default as (number | string | boolean) }) as ScriptComponentPropDef),
  ];
  const hasSchema = schema.length > 0;
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const setProp = (key: string, raw: string) => {
    // 값 자동 타입 추론: number → number, true/false → boolean, else → string
    let val: number | string | boolean = raw;
    if (raw === 'true') val = true;
    else if (raw === 'false') val = false;
    else if (raw !== '' && !isNaN(Number(raw))) val = Number(raw);
    onPropsChange({ ...props, [key]: val });
  };

  const setPropTyped = (key: string, val: number | string | boolean) => {
    onPropsChange({ ...props, [key]: val });
  };

  return (
    <div style={{
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)',
      borderRadius: 6, padding: '6px 8px', marginBottom: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <button type="button" onClick={() => setOpen(o => !o)} title={open ? tCanvas("tooltip_collapse") : tCanvas("tooltip_expand")}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 9, width: 8, flexShrink: 0, opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scriptComponent?.icon || '🧩'} {scriptComponent?.name || tCanvas("msg_deleted_component")}
          </span>
        </button>
        {onEdit && (
          <button type="button" onClick={onEdit} title={tCanvas("tooltip_edit_code")}
            style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, lineHeight: 1, flexShrink: 0 }}>
            ✎ edit
          </button>
        )}
        <button type="button" onClick={onRemove} title={tCanvas("tooltip_remove")}
          style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', fontSize: 12, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>
          ✕
        </button>
      </div>
      {open && (<>
      {!scriptComponent && (
        <div style={{ fontSize: 9, opacity: 0.5, marginTop: 3, color: '#fca5a5' }}>
          {tCanvas("msg_component_orphaned")}
        </div>
      )}

      {/* ── schema 가 있으면 타입별 input ── */}
      {hasSchema && schema.map(p => {
        const cur = props[p.key] ?? p.default;
        if (p.type === 'boolean') {
          return (
            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, opacity: 0.85, marginTop: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!cur}
                onChange={e => { setPropTyped(p.key, e.target.checked); onPropsCommit(); }} />
              {p.label}
            </label>
          );
        }
        if (p.type === 'number') {
          return (
            <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75, marginTop: 5 }}>
              {p.label}
              <input type="text" inputMode="text" defaultValue={Number(cur)}
                onBlur={e => { setPropTyped(p.key, Number(e.target.value)); onPropsCommit(); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
            </label>
          );
        }
        if (p.type === 'enum' && p.options && p.options.length > 0) {
          return (
            <div key={p.key} style={{ marginTop: 5 }}>
              <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>{p.label}</div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {p.options.map(opt => {
                  const active = String(cur) === opt;
                  return (
                    <button key={opt} type="button"
                      onClick={() => { setPropTyped(p.key, opt); onPropsCommit(); }}
                      style={{
                        flex: 1, minWidth: 32,
                        background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${active ? '#818cf8' : 'rgba(255,255,255,0.12)'}`,
                        color: active ? '#c7d2fe' : 'rgba(255,255,255,0.65)',
                        borderRadius: 4, padding: '4px 6px', fontSize: 10, fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                      }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        // string (default)
        return (
          <label key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75, marginTop: 5 }}>
            {p.label}
            <input type="text" defaultValue={String(cur)}
              onBlur={e => { setPropTyped(p.key, e.target.value); onPropsCommit(); }}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
          </label>
        );
      })}

      {/* ── 오브젝트 참조 변수(let x = null) — 씬 오브젝트를 드래그해 지정하는 드롭 슬롯.
           SceneListNode 의 HTML5 dragstart 가 application/x-alp-objid 설정 (미디어 리모컨과 동일).
           data-objvar 는 pointer-based custom drag (onTreePointerUp) 호환을 위해 유지. ── */}
      {objectVars.map(v => {
        const refId = props[v.key];
        const refObj = typeof refId === 'string' ? allObjects.find(o => o.id === refId) : undefined;
        // 오브젝트가 아니고 URL 문자열이면 = 에셋 참조 (애니메이션 FBX 등 드래그됨)
        const isAssetUrl = !refObj && typeof refId === 'string' && /^https?:\/\//.test(refId);
        const assetName = isAssetUrl ? (refId as string).split('/').pop()?.split('?')[0] || 'asset' : '';
        const filled = !!refObj || isAssetUrl;
        return (
          <div key={v.key} style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 3 }}>🔗 {v.key}</div>
            <div
              data-objvar={`${objectId}|${componentIdx}|${v.key}`}
              title={tCanvas("tooltip_drop_object_slot")}
              onDragOver={e => {
                if (e.dataTransfer.types.includes('application/x-alp-asset-url')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
              }}
              onDrop={e => {
                const url = e.dataTransfer.getData('application/x-alp-asset-url');
                if (!url) return;
                e.preventDefault();
                onPropsChange({ ...props, [v.key]: url });
                onPropsCommit();
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 5, minHeight: 22,
                border: `1px dashed ${filled ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.2)'}`,
                background: filled ? 'rgba(99,102,241,0.14)' : 'rgba(0,0,0,0.25)', fontSize: 10,
              }}>
              {refObj ? (
                <>
                  <button type="button"
                    onClick={() => onSelectId?.(refObj.id)}
                    title={tCanvas("tooltip_select_in_tree_short")}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', color: '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: 10 }}>
                    {KIND_ICONS[refObj.kind] ?? '📦'} {refObj.label || refObj.kind}
                  </button>
                  <button type="button" title={tCanvas("tooltip_unlink")}
                    onClick={() => { const next = { ...props }; delete next[v.key]; onPropsChange(next); onPropsCommit(); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.75)', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                </>
              ) : isAssetUrl ? (
                <>
                  <span style={{ flex: 1, minWidth: 0, color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎬 {assetName}</span>
                  <button type="button" title={tCanvas("tooltip_unlink")}
                    onClick={() => { const next = { ...props }; delete next[v.key]; onPropsChange(next); onPropsCommit(); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.75)', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                </>
              ) : (
                <span style={{ flex: 1, color: 'rgba(255,255,255,0.4)' }}>{tCanvas("msg_drop_object_here")}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* ── schema·오브젝트변수 둘 다 없으면 free-form key:value 입력 ── */}
      {!hasSchema && objectVars.length === 0 && (
        <>
          {Object.entries(props).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span style={{ fontSize: 10, opacity: 0.6, minWidth: 60 }}>{k}</span>
              <input type="text" defaultValue={String(v)}
                onBlur={e => { setProp(k, e.target.value); onPropsCommit(); }}
                style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
              <button type="button" onClick={() => {
                const next = { ...props };
                delete next[k];
                onPropsChange(next);
                onPropsCommit();
              }} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.6)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            <input type="text" placeholder="key" value={newKey} onChange={e => setNewKey(e.target.value)}
              style={{ width: 60, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
            <input type="text" placeholder="value" value={newValue} onChange={e => setNewValue(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' }} />
            <button type="button" onClick={() => {
              if (!newKey.trim()) return;
              setProp(newKey.trim(), newValue);
              setNewKey(''); setNewValue('');
              onPropsCommit();
            }} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>+</button>
          </div>
        </>
      )}
      </>)}
    </div>
  );
}

/* 컴포넌트 카드 — collapsible 헤더 + props 영역 */
function ComponentCard({
  icon, name, onRemove, children,
}: {
  icon: string;
  name: string;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const [open, setOpen] = useState(true);
  const hasBody = !!children;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '6px 8px', marginBottom: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <button type="button" onClick={() => { if (hasBody) setOpen(o => !o); }}
          title={hasBody ? (open ? tCanvas("tooltip_collapse") : tCanvas("tooltip_expand")) : undefined}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#e2e8f0', cursor: hasBody ? 'pointer' : 'default', padding: 0, textAlign: 'left' }}>
          <span style={{ fontSize: 9, width: 8, flexShrink: 0, opacity: hasBody ? 0.6 : 0 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{icon} {name}</span>
        </button>
        <button type="button" onClick={onRemove}
          title={tCanvas("tooltip_remove")}
          style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', fontSize: 12, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>
          ✕
        </button>
      </div>
      {open && children}
    </div>
  );
}

/* ── Collider 컴포넌트 전용 카드 — X/Y/Z 크기 입력 + "자동 맞춤" 버튼 ── */
function ColliderCard({ instance, onRemove, onChange, onCommit, onAutoFit }: {
  instance: ComponentInstance;
  onRemove: () => void;
  onChange: (key: string, val: number | boolean) => void;
  onCommit: () => void;
  onAutoFit: () => void;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const trig = !!instance.props?.trigger;
  const sx = Number(instance.props?.sizeX ?? 1);
  const sy = Number(instance.props?.sizeY ?? 1);
  const sz = Number(instance.props?.sizeZ ?? 1);
  const ox = Number(instance.props?.offsetX ?? 0);
  const oy = Number(instance.props?.offsetY ?? 0);
  const oz = Number(instance.props?.offsetZ ?? 0);
  const fieldStyle: React.CSSProperties = { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 6px', borderRadius: 4, outline: 'none' };
  return (
    <ComponentCard icon="🟩" name={tCanvas("comp_collider_name")} onRemove={onRemove}>
      <div style={{ fontSize: 9, opacity: 0.5, marginTop: 4 }}>{tCanvas("label_size")}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 2 }}>
        {([['sizeX', 'X', sx], ['sizeY', 'Y', sy], ['sizeZ', 'Z', sz]] as const).map(([key, label, val]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75 }}>
            {label}
            <NumField value={val} onChange={n => onChange(key, n)} onCommit={onCommit} style={fieldStyle} />
          </label>
        ))}
      </div>
      <div style={{ fontSize: 9, opacity: 0.5, marginTop: 6 }}>{tCanvas("label_offset_position")}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 2 }}>
        {([['offsetX', 'X', ox], ['offsetY', 'Y', oy], ['offsetZ', 'Z', oz]] as const).map(([key, label, val]) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, opacity: 0.75 }}>
            {label}
            <NumField value={val} onChange={n => onChange(key, n)} onCommit={onCommit} style={fieldStyle} />
          </label>
        ))}
      </div>
      <button type="button" onClick={onAutoFit}
        style={{ marginTop: 6, width: '100%', background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.4)', color: '#6ee7b7', fontSize: 10, fontWeight: 700, padding: '4px', borderRadius: 5, cursor: 'pointer' }}>
        {tCanvas("btn_collider_auto_fit")}
      </button>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, opacity: 0.85, marginTop: 8, cursor: 'pointer', lineHeight: 1.3 }}>
        <input type="checkbox" checked={trig} style={{ marginTop: 1 }}
          onChange={e => { onChange('trigger', e.target.checked); onCommit(); }} />
        <span>{tCanvas("label_collider_trigger")}</span>
      </label>
    </ComponentCard>
  );
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

/** rootId 의 모든 자손 id (재귀). 부모→자식 전파(hide/lock/삭제/복제)에 공용. */
function collectDescendants(rootId: string, objs: { id: string; parentId?: string | null }[]): Set<string> {
  const out = new Set<string>();
  let frontier = new Set<string>([rootId]);
  while (frontier.size) {
    const next = new Set<string>();
    for (const o of objs) {
      if (o.parentId && frontier.has(o.parentId) && !out.has(o.id)) { out.add(o.id); next.add(o.id); }
    }
    frontier = next;
  }
  return out;
}
/** tid 가 anc 의 자손인가 — 부모 체인을 올라가며 검사 (reparent 순환 방지). */
function isDescendantOf(tid: string | null | undefined, anc: string, objs: { id: string; parentId?: string | null }[]): boolean {
  let p = tid;
  const guard = new Set<string>();
  while (p && !guard.has(p)) { if (p === anc) return true; guard.add(p); p = objs.find(o => o.id === p)?.parentId; }
  return false;
}

// 시뮬레이션 중 동적 오브젝트가 스폰 높이 기준 이만큼 아래로 떨어지면 원위치 복귀
const OBJ_FALL_RESET = 50;

/* ── 단일 축 숫자 입력 ──
   모바일에서 음수(-)를 못 치던 문제 수정: type="text"(전체 키보드) + 로컬 문자열 상태로
   입력 도중의 "-", "-." 같은 미완성 값이 0으로 버려지지 않게 함. */
function AxisField({ color, axis, value, onChange, onCommit, step = 0.1 }: {
  color: string;
  axis: string;
  value: number;
  onChange: (value: number) => void;
  onCommit: () => void;
  step?: number;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const scrub = useRef<{ active: boolean; acc: number }>({ active: false, acc: 0 });
  // 외부(기즈모 드래그·선택 변경)에서 값이 바뀌면 포커스/스크럽 중이 아닐 때만 동기화
  useEffect(() => { if (!focused.current && !scrub.current.active) setText(String(value)); }, [value]);

  // 유니티식 라벨 드래그 스크럽 — 좌우로 끌면 값 증감 (Shift = 정밀)
  const onLabelDown = (e: React.PointerEvent) => {
    e.preventDefault();
    scrub.current = { active: true, acc: value };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onLabelMove = (e: React.PointerEvent) => {
    if (!scrub.current.active) return;
    const sens = e.shiftKey ? step * 0.1 : step;
    scrub.current.acc += e.movementX * sens;
    const n = Math.round(scrub.current.acc * 1000) / 1000;
    setText(String(n));
    onChange(n);
  };
  const onLabelUp = (e: React.PointerEvent) => {
    if (!scrub.current.active) return;
    scrub.current.active = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    onCommit();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '2px 4px' }}>
      <span
        onPointerDown={onLabelDown}
        onPointerMove={onLabelMove}
        onPointerUp={onLabelUp}
        onPointerCancel={onLabelUp}
        title={tCanvas("tooltip_drag_to_scrub")}
        style={{ color, fontSize: 10, fontWeight: 700, width: 12, textAlign: 'center', cursor: 'ew-resize', userSelect: 'none', touchAction: 'none' }}>{axis}</span>
      <input
        type="text"
        inputMode="text"
        value={text}
        onFocus={() => { focused.current = true; }}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          const n = parseFloat(v);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          focused.current = false;
          const n = parseFloat(text);
          setText(Number.isFinite(n) ? String(n) : String(value));
          onCommit();
        }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{
          width: '100%', minWidth: 0,
          background: 'transparent', border: 'none',
          color: '#fff', fontSize: 11, padding: '2px 0',
          outline: 'none', textAlign: 'right',
        }}
      />
    </div>
  );
}

/* ── X/Y/Z 숫자 입력 행 ──────────────────── */
function AxisInputRow({ label, values, step, onChange, onCommit }: {
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
          <AxisField
            key={axis}
            axis={axis}
            color={['#f87171','#4ade80','#60a5fa'][i]}
            value={values[i]}
            step={step}
            onChange={v => onChange(i, v)}
            onCommit={onCommit}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 음수 입력 가능한 단일 숫자 입력 ──
   AxisField 와 동일 원리: type="text"(모바일 전체 키보드) + 로컬 문자열 상태. */
function NumField({ value, onChange, onCommit, style, step = 0.1 }: {
  value: number;
  onChange: (n: number) => void;
  onCommit: () => void;
  style?: React.CSSProperties;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  // 필드 가로 드래그 = 값 스크럽 (유니티식). 클릭(이동 없음)은 평소처럼 타이핑.
  const scrub = useRef<{ down: boolean; active: boolean; acc: number }>({ down: false, active: false, acc: 0 });
  useEffect(() => { if (!focused.current && !scrub.current.active) setText(String(value)); }, [value]);

  const onDown = (e: React.PointerEvent) => {
    if (focused.current) return;               // 타이핑 중엔 스크럽 안 함
    scrub.current = { down: true, active: false, acc: value };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s.down) return;
    if (!s.active) {
      if (Math.abs(e.movementX) < 1) return;   // 살짝 움직임 무시 (클릭 보호)
      s.active = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
      (e.currentTarget as HTMLInputElement).blur();
    }
    const sens = e.shiftKey ? step * 0.1 : step;
    s.acc += e.movementX * sens;
    const n = Math.round(s.acc * 1000) / 1000;
    setText(String(n));
    onChange(n);
  };
  const onUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (s.active) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
      onCommit();
    }
    scrub.current = { down: false, active: false, acc: 0 };
  };

  return (
    <input
      type="text"
      inputMode="text"
      value={text}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onFocus={() => { focused.current = true; }}
      onChange={e => {
        const v = e.target.value;
        setText(v);
        const n = parseFloat(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        focused.current = false;
        if (scrub.current.active) return;       // 스크럽 시작 시의 blur는 commit 생략(중복 방지)
        if (!Number.isFinite(parseFloat(text))) setText(String(value));
        onCommit();
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={style}
    />
  );
}

/* 에셋의 kind id 추정 — kind 필드 우선, 없으면 확장자로 */
function inferKindId(a: Asset): string {
  const k = (a as { kind?: string | null }).kind;
  if (k) return k;
  const u = a.modelUrl || '';
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(u)) return 'image';
  if (/\.(mp3|wav|ogg|aac)$/i.test(u)) return 'audio';
  if (/\.(mp4|webm|mov)$/i.test(u)) return 'video';
  return 'model';
}

/* ── 에셋 카드 (우측 그리드) — 썸네일 + 호버 미리보기 ─────────────── */
function StudioAssetCard({ asset, onDelete, onRename, onPreview, selected }: {
  asset: Asset;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onPreview: (a: Asset) => void;
  selected?: boolean;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const Thumb = getKind(inferKindId(asset))?.Thumbnail;

  function confirmRename() {
    const v = editVal.trim();
    if (v && v !== asset.name) onRename(asset.id, v);
    setEditing(false);
  }

  return (
    <div
      data-asset-id={asset.id}
      style={{ position: 'relative', borderRadius: 8,
        outline: selected ? '2px solid #818cf8' : 'none', outlineOffset: 1,
        background: selected ? 'rgba(129,140,248,0.18)' : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        tabIndex={0}
        draggable={!editing}
        title={asset.name}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          // 선택(포커스) 후 F2 → 이름 변경
          if (e.key === 'F2' && !editing) { e.preventDefault(); e.stopPropagation(); setEditVal(asset.name); setEditing(true); }
        }}
        onDragStart={e => {
          e.dataTransfer.setData('text/plain', asset.id);
          // 스크립트 변수(let x = null) 슬롯에 드롭 시 이 URL 이 변수값이 됨 (예: 애니메이션 FBX → world.playEmote(x)).
          if (asset.modelUrl) {
            e.dataTransfer.setData('application/x-alp-asset-url', asset.modelUrl);
            e.dataTransfer.setData('application/x-alp-asset-name', asset.name || '');
          }
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        style={{
          background: hovered || focused ? 'rgba(129,140,248,0.16)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${focused ? '#818cf8' : 'rgba(255,255,255,0.09)'}`,
          borderRadius: 8, color: '#e2e8f0', fontSize: 11, padding: 6,
          cursor: editing ? 'default' : 'grab',
          display: 'flex', flexDirection: 'column', gap: 5,
          userSelect: 'none', transition: 'background 0.12s',
        }}>
        {/* 썸네일 (클릭=미리보기) */}
        <div
          onClick={e => { e.stopPropagation(); onPreview(asset); }}
          title={tCanvas("tooltip_click_to_preview")}
          style={{
            width: '100%', aspectRatio: '1', borderRadius: 6, overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 35%, #232c44, #0e1424)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in',
          }}>
          {Thumb
            ? <Thumb asset={asset as unknown as RegistryAsset} />
            : <span style={{ fontSize: 30, opacity: 0.4 }}>📄</span>}
        </div>
        {editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false); }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid #6366f1',
              borderRadius: 4, color: '#fff', fontSize: 11, padding: '2px 4px',
              outline: 'none', textAlign: 'center',
            }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); setEditVal(asset.name); setEditing(true); }}
            title={asset.name}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', fontWeight: 500 }}>
            {asset.name}
          </span>
        )}
      </div>
      {hovered && !editing && (
        <>
          {/* 미리보기 버튼 — 좌상단 */}
          <button
            onClick={e => { e.stopPropagation(); onPreview(asset); }}
            title={tCanvas("tooltip_preview")}
            style={{
              position: 'absolute', top: 3, left: 3,
              background: 'rgba(15,23,42,0.85)', border: 'none', borderRadius: 4,
              color: '#fff', fontSize: 11, cursor: 'pointer', padding: '2px 5px', lineHeight: 1, backdropFilter: 'blur(4px)',
            }}>👁</button>
          {/* 삭제 버튼 — 우상단 */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(asset.id); }}
            title={tCanvas("tooltip_delete_asset")}
            style={{
              position: 'absolute', top: 3, right: 3,
              background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 4,
              color: '#fff', fontSize: 10, cursor: 'pointer', padding: '2px 5px', lineHeight: 1,
            }}>🗑</button>
        </>
      )}
    </div>
  );
}

/* ── 에셋 미리보기 — image/audio/video 는 kind Preview, model 등은 3D 뷰어 ── */
function PreviewModel({ url }: { url: string }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('@/lib/world/modelLoader').then(({ loadStaticModel }) =>
      loadStaticModel(url).then(model => {
        if (cancelled) return;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z) || 1;
        // 원점 중심 + 1 단위로 정규화
        model.scale.setScalar(1 / h);
        model.position.set(-center.x / h, -center.y / h, -center.z / h);
        model.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; fixModelMaterials(m); } });
        setObj(model);
      }).catch(e => console.error('[studio preview] 모델 로드 실패:', e)),
    );
    return () => { cancelled = true; };
  }, [url]);
  if (!obj) return null;
  return <primitive object={obj} />;
}

function StudioAssetPreview({ asset, allAssets, onClose, onSaved }: {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
  onSaved: (a: Asset) => void;
}) {
  const handler = getKind(inferKindId(asset));
  const regAsset = asset as unknown as RegistryAsset;
  // 모델 — 머티리얼 에디터(/assets 와 동일: 재질·텍스처 편집 + 저장, 텍스처 입혀진 채 표시)
  if (handler?.Editor) {
    const E = handler.Editor;
    return (
      <E
        asset={regAsset}
        allAssets={allAssets as unknown as RegistryAsset[]}
        onClose={onClose}
        onSaved={(u) => onSaved(u as unknown as Asset)}
      />
    );
  }
  // image/audio/video — 등록된 Preview(라이트박스/플레이어) 사용
  if (handler?.Preview) {
    const P = handler.Preview;
    return <P asset={regAsset} onClose={onClose} />;
  }
  // 그 외(3D 모델) — 회전 가능한 3D 뷰어
  return (
    <AssetPreviewModal asset={regAsset} onClose={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: 'min(78vw, 720px)', height: 'min(70vh, 540px)', borderRadius: 12, overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 35%, #1e2740, #0b1020)', border: '1px solid rgba(255,255,255,0.12)',
        }}>
        <Canvas camera={{ position: [1.8, 1.3, 1.8], fov: 45 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[4, 6, 3]} intensity={1.0} />
          <PreviewModel url={asset.modelUrl} />
          <OrbitControls enablePan={false} autoRotate autoRotateSpeed={1.6} minDistance={0.8} maxDistance={6} />
        </Canvas>
      </div>
    </AssetPreviewModal>
  );
}

/* ── 폴더 노드 검색 헬퍼 ─────────────────── */
function findFolderNode(nodes: FolderNode[], path: string): FolderNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    const found = findFolderNode(n.children, path);
    if (found) return found;
  }
  return null;
}

/* ── 그리드용 폴더 카드 ──────────────────── */
function StudioFolderCard({ name, path, onNavigate, onFolderDrop, onAssetDrop }: {
  name: string;
  path: string;
  onNavigate: (path: string) => void;
  onFolderDrop: (fromPath: string, toPath: string) => void;
  onAssetDrop: (assetId: string, toPath: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      data-folder-card=""
      draggable
      onDragStart={e => { e.dataTransfer.setData('folderPath', path); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setDragOver(false);
        // 에셋 파일 카드를 폴더 위에 놓으면 그 폴더로 이동
        const assetId = e.dataTransfer.getData('text/plain');
        if (assetId) { onAssetDrop(assetId, path); return; }
        // 폴더를 폴더 위에 놓으면 폴더 이동 (자기 자신/자기 하위로는 금지)
        const fromPath = e.dataTransfer.getData('folderPath');
        if (fromPath && fromPath !== path && !path.startsWith(fromPath + '/')) onFolderDrop(fromPath, path);
      }}
      onClick={() => onNavigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: dragOver ? 'rgba(52,211,153,0.2)' : hovered ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.05)',
        border: dragOver ? '1px dashed #34d399' : '1px solid rgba(255,255,255,0.09)',
        borderRadius: 8, color: '#e2e8f0', fontSize: 11, padding: '8px 6px',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        userSelect: 'none', transition: 'background 0.12s',
      }}>
      <span style={{ fontSize: 22 }}>📁</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', fontWeight: 500 }}>
        {name}
      </span>
    </div>
  );
}

/* ── FBX 폴더 트리 노드 ──────────────────── */
function FbxFolderNode({ node, depth, openFolders, selectedFolder, onSelect, onToggle, onDrop, onFolderDrop, dragOverPath, setDragOverPath, onDeleteFolder, onRenameFolder }: {
  node: FolderNode;
  depth: number;
  openFolders: Set<string>;
  selectedFolder: string | null;
  onSelect: (path: string | null) => void;
  onToggle: (path: string) => void;
  onDrop: (assetId: string, path: string | null) => void;
  onFolderDrop: (fromPath: string, toPath: string) => void;
  dragOverPath: string | undefined;
  setDragOverPath: (p: string | undefined) => void;
  onDeleteFolder: (path: string) => void;
  onRenameFolder: (oldPath: string, newSegment: string) => void;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const isOpen = openFolders.has(node.path);
  const isSelected = selectedFolder === node.path;
  const hasChildren = node.children.length > 0;
  const isDragOver = dragOverPath === node.path;

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <div
          draggable
          onDragStart={e => { e.dataTransfer.setData('folderPath', node.path); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); }}
          onClick={() => { onSelect(node.path); if (hasChildren) onToggle(node.path); }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverPath(node.path); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { e.stopPropagation(); setDragOverPath(undefined); } }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation();
            const assetId = e.dataTransfer.getData('text/plain');
            const fromFolder = e.dataTransfer.getData('folderPath');
            if (assetId) onDrop(assetId, node.path);
            else if (fromFolder && fromFolder !== node.path && !node.path.startsWith(fromFolder + '/')) onFolderDrop(fromFolder, node.path);
            setDragOverPath(undefined);
          }}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 4,
            paddingLeft: depth * 14 + 6, paddingTop: 5, paddingBottom: 5, paddingRight: 4,
            cursor: 'pointer', borderRadius: 5, userSelect: 'none' as const,
            background: isDragOver ? 'rgba(52,211,153,0.18)' : isSelected ? 'rgba(129,140,248,0.22)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: isDragOver ? '#6ee7b7' : isSelected ? '#c7d2fe' : '#cbd5e1',
            outline: isDragOver ? '1px dashed #34d399' : 'none',
          }}
        >
          <span style={{ width: 12, textAlign: 'center', fontSize: 9, flexShrink: 0, color: 'rgba(255,255,255,0.35)' }}>
            {hasChildren ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span style={{ fontSize: 13, flexShrink: 0 }}>📁</span>
          {editing ? (
            <input
              autoFocus
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { const v = editVal.trim(); if (v && v !== node.name) onRenameFolder(node.path, v); setEditing(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { const v = editVal.trim(); if (v && v !== node.name) onRenameFolder(node.path, v); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.5)', border: '1px solid #6366f1', borderRadius: 4, color: '#fff', fontSize: 11, padding: '1px 5px', outline: 'none' }}
            />
          ) : (
            <span
              onDoubleClick={e => { e.stopPropagation(); setEditVal(node.name); setEditing(true); }}
              title={tCanvas("tooltip_double_click_rename")}
              style={{ fontSize: 12, fontWeight: isSelected ? 700 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDeleteFolder(node.path); }}
          title={tCanvas("tooltip_delete_folder")}
          style={{
            opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
            background: 'none', border: 'none', color: 'rgba(239,68,68,0.75)',
            fontSize: 12, cursor: 'pointer', padding: '2px 6px', flexShrink: 0, lineHeight: 1,
          }}>🗑</button>
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map(child => (
            <FbxFolderNode key={child.path} node={child} depth={depth + 1}
              openFolders={openFolders} selectedFolder={selectedFolder}
              onSelect={onSelect} onToggle={onToggle}
              onDrop={onDrop} onFolderDrop={onFolderDrop} dragOverPath={dragOverPath} setDragOverPath={setDragOverPath}
              onDeleteFolder={onDeleteFolder} onRenameFolder={onRenameFolder} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 텍스처 선택 모달 ────────────────────── */
function TexturePickerModal({ assets, onSelect, onClose, title, mode = 'image' }: {
  assets: Asset[];
  onSelect: (url: string) => void;
  onClose: () => void;
  title: string;
  mode?: 'image' | 'video';
}) {
  const t = useTranslations('Studio');
  const images = mode === 'video'
    ? assets.filter(a => /\.(mp4|webm|mov)$/i.test(a.modelUrl))
    : assets.filter(a => /\.(png|jpe?g|webp)$/i.test(a.modelUrl));
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
                {mode === 'video'
                  ? <div style={{ width: '100%', aspectRatio: '1', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>📺</div>
                  : <div style={{ width: '100%', aspectRatio: '1', background: `url(${a.modelUrl}) center/cover` }} />}
                <div style={{ padding: '4px 6px', fontSize: 10, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 물 입체 지오메트리 — 파도치는 윗면(NxN 그리드) + 옆벽 + 바닥이 한 메쉬.
 * 옆벽 윗변이 윗면 가장자리 정점을 공유 → 파도와 옆면이 틈 없이 이어짐.
 * 로컬: 윗면 y=0, 바닥 y=-1 (그룹 Y 스케일 = 수심). 윗면 정점만 매 frame 파도 변위.
 */
function buildWaterVolumeGeometry(N: number): { geom: THREE.BufferGeometry; topCount: number } {
  const verts: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) verts.push(i / N - 0.5, 0, j / N - 0.5);
  const topCount = (N + 1) * (N + 1);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) verts.push(i / N - 0.5, -1, j / N - 0.5);
  const ti = (i: number, j: number) => j * (N + 1) + i;
  const bi = (i: number, j: number) => topCount + j * (N + 1) + i;
  const idx: number[] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    idx.push(ti(i, j), ti(i, j + 1), ti(i + 1, j + 1), ti(i, j), ti(i + 1, j + 1), ti(i + 1, j));
    idx.push(bi(i, j), bi(i + 1, j + 1), bi(i, j + 1), bi(i, j), bi(i + 1, j), bi(i + 1, j + 1));
  }
  for (let i = 0; i < N; i++) {
    idx.push(ti(i, 0), bi(i, 0), bi(i + 1, 0), ti(i, 0), bi(i + 1, 0), ti(i + 1, 0));
    idx.push(ti(i, N), ti(i + 1, N), bi(i + 1, N), ti(i, N), bi(i + 1, N), bi(i, N));
  }
  for (let j = 0; j < N; j++) {
    idx.push(ti(0, j), ti(0, j + 1), bi(0, j + 1), ti(0, j), bi(0, j + 1), bi(0, j));
    idx.push(ti(N, j), bi(N, j), bi(N, j + 1), ti(N, j), bi(N, j + 1), ti(N, j + 1));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return { geom, topCount };
}

/** 물 선택 외곽선 — 단위 박스 모서리(직육면체). 그룹 스케일로 물 부피 경계 표시 (크기 가늠용). */
const WATER_BOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

/* ── Water mesh — 입체(파도 윗면+옆벽+바닥). 데스크탑 viewer.js 의 isWater 공식과 동일 파도. */
function WaterMesh({ color, selected, strength = 1, speed = 1, frequency = 1, scaleY = 1 }: { color: string; selected: boolean; strength?: number; speed?: number; frequency?: number; scaleY?: number }) {
  const N = 12;
  const { geom, topCount } = useMemo(() => buildWaterVolumeGeometry(N), []);
  const baseRef = useRef<Float32Array | null>(null);
  const params = useRef({ strength, speed, frequency, scaleY });
  params.current = { strength, speed, frequency, scaleY };

  useFrame(({ clock }) => {
    const pos = geom.attributes.position as THREE.BufferAttribute;
    if (!baseRef.current) baseRef.current = (pos.array as Float32Array).slice() as Float32Array;
    const base = baseRef.current;
    const arr = pos.array as Float32Array;
    const t = clock.elapsedTime;
    const { strength: amp, speed: spd, frequency: freq, scaleY: sy } = params.current;
    const a = 0.04 * amp / Math.max(0.01, sy);   // 물결 높이를 Y 스케일(수심)과 무관하게 보정
    for (let v = 0; v < topCount; v++) {
      const ix = v * 3, x = base[ix], z = base[ix + 2];
      arr[ix + 1] = Math.sin(x * 5 * freq + t * 2 * spd) * a + Math.cos(z * 5 * freq + t * 1.5 * spd) * a;
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return (
    <group>
      <mesh geometry={geom} receiveShadow>
        <meshStandardMaterial color={color} transparent opacity={0.78}
          roughness={0.15} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
      {/* 선택 표시 — 물 부피 경계를 깔끔한 직육면체 외곽선으로 (크기 가늠용). 수면 y=0 ~ 바닥 y=-1 */}
      {selected && (
        <lineSegments geometry={WATER_BOX_EDGES} position={[0, -0.5, 0]} raycast={() => null}>
          <lineBasicMaterial color="#22d3ee" />
        </lineSegments>
      )}
    </group>
  );
}

/* ── 단일 오브젝트 렌더링 ────────────────── */
function Mesh3D({ obj, selected, onClick, assetConfig, noTransform = false, sculpt, worldPos }: {
  obj: MapObject;
  selected: boolean;
  onClick: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetConfig?: any;
  noTransform?: boolean;
  /** 터레인 조각 설정 — 활성이고 이 터레인이 선택됐을 때 sculpt 메시로 교체. */
  sculpt?: { tool: import('@/lib/world/TerrainSculptMesh').TerrainTool; radius: number; strength: number; onCommit: (heights: number[]) => void; onActiveChange?: (a: boolean) => void };
  /** 터레인 조각 좌표 변환용 월드 위치 (SceneNode wpos). */
  worldPos?: [number, number, number];
}) {
  const ref = useRef<THREE.Mesh>(null);
  const handle = (e: { stopPropagation: () => void; button?: number }) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (isGizmoActive()) return;
    if (obj.locked) return;
    e.stopPropagation();
    onClick();
  };

  if (obj.kind === 'asset') return <AssetMesh obj={obj} selected={selected} onClick={handle} assetConfig={assetConfig} noTransform={noTransform} />;

  // 스폰 포인트 — 시각화용 (캡슐 + forward 화살표). 월드 플레이 시엔 안 보임.
  if (obj.kind === 'spawn') {
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        {/* 사람 모양 캡슐 */}
        <mesh position={[0, 0, 0]}>
          <capsuleGeometry args={[0.3, 1.2, 8, 16]} />
          <meshStandardMaterial color={selected ? '#fbbf24' : '#34d399'} transparent opacity={0.6} emissive={selected ? '#fbbf24' : '#10b981'} emissiveIntensity={0.5} />
        </mesh>
        {/* forward 방향 화살표 (Z- 방향) */}
        <mesh position={[0, 0, -1.0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.5, 8]} />
          <meshStandardMaterial color={selected ? '#fbbf24' : '#34d399'} emissive={selected ? '#fbbf24' : '#10b981'} emissiveIntensity={1} />
        </mesh>
      </group>
    );
  }

  // 빈 오브젝트 — 컴포넌트 홀더(예: World Physics). 에디터에서만 작은 와이어 구체로 표시, 플레이 시 안 보임.
  if (obj.kind === 'empty') {
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <mesh>
          <sphereGeometry args={[0.35, 16, 12]} />
          <meshBasicMaterial color={selected ? '#fbbf24' : '#60a5fa'} wireframe transparent opacity={0.8} />
        </mesh>
      </group>
    );
  }

  // Terrain — heightmap 기반 지면. 에디트 모드에서도 실제 지형으로 렌더 (시뮬 모드와 동일).
  // 데이터에 obj.terrain 이 없으면 (마이그레이션 안 된 옛 데이터) 렌더 X — null 반환.
  if (obj.kind === 'terrain') {
    if (!obj.terrain) return null;
    // 조각 도구 활성 + 이 터레인 선택 → 브러시로 지형 올리고/내리기 (TerrainMesh 대신).
    if (sculpt?.tool && selected) {
      return (
        <group
          position={noTransform ? undefined : obj.position}
          rotation={noTransform ? undefined : obj.rotation}
          scale={noTransform ? undefined : obj.scale}
          userData={noTransform ? undefined : { id: obj.id }}>
          <TerrainSculptMesh terrain={obj.terrain} worldPos={worldPos ?? obj.position}
            tool={sculpt.tool} radius={sculpt.radius} strength={sculpt.strength}
            onCommit={sculpt.onCommit} onActiveChange={sculpt.onActiveChange} />
        </group>
      );
    }
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <TerrainMesh terrain={obj.terrain} selected={selected} castShadow receiveShadow />
      </group>
    );
  }

  // 복셀 지형 (아스트로니어식) — 에디트 미리보기
  if (obj.kind === 'voxel' && obj.voxel) {
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <VoxelTerrainMesh data={obj.voxel} color={obj.materialColor || obj.color || '#7a6b55'} castShadow receiveShadow />
      </group>
    );
  }

  // CSG 깎인 큐브 — 구멍/홈 파인 메시 (에디트 미리보기)
  if (obj.kind === 'cube' && obj.csgCuts && obj.csgCuts.length > 0) {
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <CarvedMesh cuts={obj.csgCuts} color={obj.materialColor || obj.color || '#ffffff'} castShadow receiveShadow />
      </group>
    );
  }

  // Portal — 토러스 ring + 안쪽 반투명 disc. 데스크탑 에디터와 동일 디자인.
  if (obj.kind === 'portal') {
    const col = obj.color || '#3b82f6';
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.9, 0.12, 12, 32]} />
          <meshStandardMaterial color={col} emissive={col} emissiveIntensity={selected ? 0.9 : 0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.85, 32]} />
          <meshBasicMaterial color={col} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  // Water — 반투명 파란 plane + sin/cos 웨이브 애니메이션 (데스크탑 에디터와 동일 공식).
  if (obj.kind === 'water') {
    // 'wave' 컴포넌트로 물결 강도/속도/촘촘함 조절 (없으면 기본값).
    const wv = obj.components?.find(c => c.type === 'wave')?.props;
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        <WaterMesh color={obj.color || '#1e88e5'} selected={selected}
          strength={wv ? Number(wv.strength ?? 1) : 1}
          speed={wv ? Number(wv.speed ?? 1) : 1}
          frequency={wv ? Number(wv.frequency ?? 1) : 1}
          scaleY={Math.abs(obj.scale?.[1] ?? 1)} />
      </group>
    );
  }

  // Particle — 작은 sphere 12개 클러스터 (fire/smoke/spark 색조). 정적.
  if (obj.kind === 'particle') {
    const ptype = (obj as MapObject & { particleType?: string }).particleType || 'fire';
    const palette: Record<string, string[]> = {
      fire:  ['#ff8800', '#ff4400', '#fbbf24'],
      smoke: ['#666666', '#888888', '#444444'],
      spark: ['#ffffff', '#fbbf24', '#ffcc00'],
    };
    const cols = palette[ptype] || palette.fire;
    const seeds = [0.12, 0.47, 0.83, 0.21, 0.65, 0.39, 0.92, 0.05, 0.71, 0.34, 0.58, 0.88];
    return (
      <group
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle}
        userData={noTransform ? undefined : { id: obj.id }}>
        {seeds.map((s, i) => (
          <mesh key={i} position={[
            (s - 0.5) * 0.6,
            ((s * 7) % 1) * 0.8,
            ((s * 13) % 1 - 0.5) * 0.6,
          ]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color={cols[i % cols.length]} transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
    );
  }

  const geometry =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;
  const vidSide = obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
  const normUrl = obj.videoUrl ? normalizeMediaUrl(obj.videoUrl) : '';
  const urlKind = obj.videoUrl ? parseUrlKind(obj.videoUrl) : 'none';
  const ytId = urlKind === 'youtube' ? parseYouTubeId(normUrl) : null;
  return (
    <>
      <mesh ref={ref}
        position={noTransform ? undefined : obj.position}
        rotation={noTransform ? undefined : obj.rotation}
        scale={noTransform ? undefined : obj.scale}
        onPointerDown={handle} castShadow receiveShadow
        userData={noTransform ? {} : { id: obj.id }}>
        {geometry}
        {/* 선택 표시 — 표면 색을 가리지 않게 외곽선만 (cyan). 색 구별 유지. */}
        {selected && <Edges threshold={15} color="#22d3ee" />}
        {urlKind === 'youtube' && ytId
          ? <YouTubeMeshMaterial videoId={ytId} selected={selected} side={vidSide} />
          : urlKind === 'videoFile'
            ? <VideoScreenMaterial url={normUrl} objId={obj.id} selected={selected} side={vidSide} />
            : urlKind === 'image'
              ? <ImageMaterial url={normUrl} selected={selected} side={vidSide} />
              : urlKind === 'iframe'
                ? <meshBasicMaterial color="#000" side={vidSide} />
                : <PrimitiveMaterial obj={obj} selected={selected} />}
      </mesh>
      {ytId && <YouTubeMaybeOverlay videoId={ytId} objId={obj.id} planeW={obj.scale[0]} planeH={obj.scale[1]} />}
      {urlKind === 'iframe' && <GenericIframeOverlay url={normUrl} planeW={obj.scale[0]} planeH={obj.scale[1]} />}
    </>
  );
}

function PrimitiveMaterial({ obj, selected }: { obj: MapObject; selected?: boolean }) {
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

  // 양면(DoubleSide) — 큐브로 방/천장을 만들면 안쪽에서 봤을 때 뒷면이 컬링돼 뚫려 보이던 버그(밝은 바깥이 비침) 수정.
  const side = THREE.DoubleSide;
  // 선택 표시는 외곽선(Edges)으로 — 표면 색을 cyan 으로 덮지 않아 색 구별 가능.
  void selected;
  if (matRef.current) {
    matRef.current.side = side;
    return <primitive object={matRef.current} attach="material" />;
  }
  return <meshStandardMaterial color={obj.color} side={side} />;
}

function AssetMesh({ obj, selected, onClick, assetConfig, noTransform = false }: {
  obj: MapObject;
  selected: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetConfig?: any;
  noTransform?: boolean;
}) {
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const originalMatsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const appliedMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!obj.assetUrl) return;
    let cancelled = false;
    // 범용 로더 — fbx / glb / gltf / dae / obj 지원 (SketchUp export 등)
    import('@/lib/world/modelLoader').then(({ loadStaticModel }) =>
      loadStaticModel(obj.assetUrl!).then(model => {
        if (cancelled) return;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z);
        // 데스크탑 에디터 finalizeFbx 와 동일 — 최대 치수 2m 기준 정규화.
        // (이전 1m 기준이면 데스크탑/웹 크기 2배 차이 남.)
        if (h > 0) model.scale.multiplyScalar(2 / h);
        const origMap = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        model.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            // 스킨드(캐릭터) 메시 컬링 버그 방지 — 화면 안인데도 사라지는 문제 (플레이/시뮬과 일치)
            m.frustumCulled = false;
            fixModelMaterials(m);
            origMap.set(m, m.material);
          }
        });
        originalMatsRef.current = origMap;
        // Animator 인스펙터용 — 내장 클립 이름 캐시 + 알림
        if (obj.assetUrl) {
          const names = ((model.animations || []) as THREE.AnimationClip[]).map(a => a.name).filter(Boolean);
          _assetClipCache.set(obj.assetUrl, names);
          window.dispatchEvent(new CustomEvent('alp-clips-loaded'));
        }
        setModel(model);
      }).catch(err => console.error('[studio] 모델 로드 실패:', err))
    );
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

  // Animator — 모델 내장 클립 미리보기 (편집/시뮬 둘 다). animator 컴포넌트 있을 때만.
  const animComp = obj.components?.find(c => c.type === 'animator');
  const animClip  = animComp ? String(animComp.props?.clip ?? '') : '';
  const animAuto  = animComp ? animComp.props?.autoplay !== false : false;
  const animLoop  = animComp ? animComp.props?.loop !== false : true;
  const animSpeed = animComp ? Number(animComp.props?.speed ?? 1) : 1;
  useEffect(() => {
    if (!model || !animComp) { mixerRef.current = null; return; }
    const clips = (model.animations || []) as THREE.AnimationClip[];
    if (!clips.length) return;
    const clip = (animClip && clips.find(c => c.name === animClip)) || clips[0];
    if (!clip) return;
    const mixer = new THREE.AnimationMixer(model);
    mixerRef.current = mixer;
    const action = mixer.clipAction(clip);
    action.setLoop(animLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !animLoop;
    action.timeScale = animSpeed;
    if (animAuto) action.play();
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(model); mixerRef.current = null; };
  }, [model, animComp, animClip, animAuto, animLoop, animSpeed]);
  useFrame((_, dt) => { mixerRef.current?.update(dt); });

  if (!model) return null;
  // noTransform=true: 위치/userData는 외부 SceneNode group이 담당
  return (
    <group
      position={noTransform ? undefined : obj.position}
      rotation={noTransform ? undefined : obj.rotation}
      scale={noTransform ? undefined : obj.scale}
      onPointerDown={onClick}
      userData={noTransform ? {} : { id: obj.id }}>
      <primitive object={model} />
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

/* ── 조명 기즈모 (선택 표시 + 클릭 타겟) ─── */
function LightGizmo({ obj, selected, onClick }: { obj: MapObject; selected: boolean; onClick: () => void }) {
  const col = obj.lightColor || '#ffff88';
  const handle = (e: { stopPropagation: () => void; button?: number }) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (isGizmoActive() || obj.locked) return;
    e.stopPropagation();
    onClick();
  };
  return (
    <group>
      {/* 클릭 가능한 구체 */}
      <mesh onPointerDown={handle}>
        <sphereGeometry args={[0.18, 14, 10]} />
        <meshBasicMaterial color={col} />
      </mesh>
      {/* 스팟라이트 — 방향 표시 원뿔 */}
      {obj.kind === 'spotlight' && (
        <mesh rotation={[Math.PI, 0, 0]} position={[0, -0.3, 0]}>
          <coneGeometry args={[0.22, 0.45, 8, 1, true]} />
          <meshBasicMaterial color={col} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* 선택 외곽선 */}
      {selected && (
        <mesh>
          <sphereGeometry args={[0.24, 14, 10]} />
          <meshBasicMaterial color="#22d3ee" wireframe />
        </mesh>
      )}
    </group>
  );
}

/* ── 스폿 라이트 (회전 기준 방향으로 조준) ─ */
function SpotLightWithTarget({ color, intensity, distance, angle, penumbra, castShadow }: {
  color: string; intensity: number; distance: number;
  angle: number; penumbra: number; castShadow: boolean;
}) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  });

  return (
    <>
      <spotLight ref={lightRef}
        color={color} intensity={intensity} distance={distance}
        angle={angle} penumbra={penumbra} decay={1} castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.1}
        shadow-camera-far={distance > 0 ? distance : 100}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {/* 그룹이 같은 parent group 안에 있으므로 회전이 적용된 local -Y 방향을 target으로 사용 */}
      <group ref={targetRef} position={[0, -5, 0]} />
    </>
  );
}

/* ── 씬 노드 (부모→자식 재귀 렌더링) ─────── */
function SceneNode({ obj, wpos, wrot, wscale, selectedId, multiSelectedIds, onObjectClick, myAssets, sculpt }: {
  obj: MapObject;
  wpos: [number, number, number];
  wrot: [number, number, number];
  wscale: [number, number, number];
  selectedId: string | null;
  multiSelectedIds: Set<string>;
  onObjectClick: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  myAssets: any[];
  /** 터레인 조각 설정 (선택 터레인일 때만 전달). */
  sculpt?: { tool: TerrainTool; radius: number; strength: number; onCommit: (heights: number[]) => void; onActiveChange?: (a: boolean) => void };
}) {
  const isSelected = obj.id === selectedId || multiSelectedIds.has(obj.id);
  // 평탄(flat) 렌더 — 각 오브젝트를 자기 "월드 TRS" 로 직접 렌더. 중첩 group 을 안 쓰므로
  // 비균등 스케일 부모 밑 자식이 회전해도 전단(shear)이 생기지 않음 (sim/world 와 동일 방식).

  // 조명 오브젝트 (스케일 무시)
  if (obj.kind === 'pointlight' || obj.kind === 'spotlight' || obj.kind === 'dirlight') {
    return (
      <group position={wpos} rotation={wrot} scale={[1, 1, 1]} userData={{ id: obj.id }}>
        {obj.kind === 'dirlight' && (
          <directionalLight
            ref={(dl) => { if (dl) { dl.target.position.set(0.5, -1, 0.5); if (dl.target.parent !== dl) dl.add(dl.target); } }}
            color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1}
            castShadow={obj.castShadow ?? false}
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-80} shadow-camera-right={80}
            shadow-camera-top={80} shadow-camera-bottom={-80}
            shadow-camera-near={0.1} shadow-camera-far={200}
            shadow-bias={-0.0005}
            shadow-normalBias={0.04}
          />
        )}
        {obj.kind === 'pointlight' && (
          <pointLight
            color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1}
            distance={obj.lightDistance ?? 0}
            decay={1}
            castShadow={obj.castShadow ?? false}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-near={0.1}
            shadow-camera-far={(obj.lightDistance ?? 0) > 0 ? obj.lightDistance! : 100}
            shadow-bias={-0.0005}
            shadow-normalBias={0.02}
          />
        )}
        {obj.kind === 'spotlight' && (
          <SpotLightWithTarget
            color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1}
            distance={obj.lightDistance ?? 0}
            angle={(obj.lightAngle ?? 45) * Math.PI / 180}
            penumbra={obj.lightPenumbra ?? 0.2}
            castShadow={obj.castShadow ?? false}
          />
        )}
        <LightGizmo obj={obj} selected={isSelected} onClick={() => onObjectClick(obj.id)} />
      </group>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetConfig: any = obj.kind === 'asset' && obj.assetUrl
    ? (myAssets.find((a: any) => a.modelUrl === obj.assetUrl)?.metadata?.materialConfig ??
       myAssets.find((a: any) => a.modelUrl === obj.assetUrl)?.materialConfig ?? null)
    : undefined;

  // Collider 컴포넌트 — 선택 시 충돌 박스를 초록 와이어프레임으로 표시 (크기 확인/조절용)
  const colliderComp = obj.components?.find(c => c.type === 'collider');

  // Terrain — 데이터 rotation 무시 (TerrainMesh 가 내부에서 -π/2 X 회전 적용).
  // 옛 .alp (rotation [-π/2,0,0]) 와 새 .alp (rotation [0,0,0]) 모두 호환.
  const effectiveRot: [number, number, number] = obj.kind === 'terrain' ? [0, 0, 0] : wrot;

  return (
    /* userData.id는 이 group에 → TransformControls이 이 group(월드 TRS)을 조작 */
    <group position={wpos} rotation={effectiveRot} scale={wscale} userData={{ id: obj.id }}>
      <Mesh3D obj={obj} selected={isSelected} onClick={() => onObjectClick(obj.id)} assetConfig={assetConfig} noTransform sculpt={isSelected ? sculpt : undefined} worldPos={wpos} />
      {isSelected && colliderComp && (
        <mesh userData={{ __collider: true }} raycast={() => null}
          position={[
            Number(colliderComp.props?.offsetX ?? 0),
            Number(colliderComp.props?.offsetY ?? 0),
            Number(colliderComp.props?.offsetZ ?? 0),
          ]}>
          <boxGeometry args={[
            Math.max(0.01, Number(colliderComp.props?.sizeX ?? 1)),
            Math.max(0.01, Number(colliderComp.props?.sizeY ?? 1)),
            Math.max(0.01, Number(colliderComp.props?.sizeZ ?? 1)),
          ]} />
          <meshBasicMaterial color="#34d399" wireframe transparent opacity={0.85} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

/* ── 씬 목록 노드 (UI 계층 트리) ──────────── */
/** 트리 노드 접힘 상태 — 재귀 트리라 prop 스레딩 대신 컨텍스트로 공유.
 *  collapsed 에 든 id = 접힘. 자식 선택 시 조상을 펼치려고 외부에서 제어. */
const TreeCollapseCtx = createContext<{ collapsed: Set<string>; toggle: (id: string) => void }>({ collapsed: new Set(), toggle: () => {} });

function SceneListNode({ obj, allObjects, depth, selectedId, multiSelectedIds, editingLabelId, editingLabelValue, setEditingLabelId, setEditingLabelValue, setObjects, selectedCallback, pushHistory, dragActive, overId, overMode, onNodePointerDown, onFocusObject, onContextMenu }: {
  obj: MapObject;
  allObjects: MapObject[];
  depth: number;
  selectedId: string | null;
  multiSelectedIds: Set<string>;
  editingLabelId: string | null;
  editingLabelValue: string;
  setEditingLabelId: (id: string | null) => void;
  setEditingLabelValue: (v: string) => void;
  setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
  selectedCallback: (id: string) => void;
  pushHistory: (objs: MapObject[]) => void;
  dragActive: boolean;
  overId: string | null;
  overMode: 'reorder' | 'reparent' | null;
  onNodePointerDown: (id: string, e: React.PointerEvent) => void;
  onFocusObject: (id: string) => void;
  onContextMenu: (objId: string, x: number, y: number) => void;
}) {
  const tCanvas = useTranslations('Studio.canvas');
  const { collapsed, toggle } = useContext(TreeCollapseCtx);
  const open = !collapsed.has(obj.id);   // 기본 펼침, collapsed 에 있으면 접힘
  const children = allObjects.filter(c => c.parentId === obj.id);
  const hasChildren = children.length > 0;
  const isSel = obj.id === selectedId || multiSelectedIds.has(obj.id);
  const i = allObjects.findIndex(o => o.id === obj.id);
  // 커스텀 포인터 드래그 — 드롭 표시는 부모가 내려준 overId/overMode 로 판단
  const insertBefore = overMode === 'reorder' && overId === obj.id;
  const dragOver = overMode === 'reparent' && overId === obj.id;

  return (
    <div>
      {/* 순서 변경 드롭존 — 이 노드 "위"에 놓으면 형제로 앞에 삽입 (target 이 루트면 루트로 빼냄).
          드래그 중엔 옅은 선으로 위치 표시, 호버 시 굵은 초록선. data-reorder-before 로 히트테스트.
          native drop 도 받음 (pointer drag 가 dragstart 후 작동 안 하므로). */}
      <div
        data-reorder-before={obj.id}
        style={{ height: 12, margin: '-6px 0', display: 'flex', alignItems: 'center', position: 'relative', zIndex: 2, pointerEvents: dragActive ? 'auto' : 'none' }}
      >
        <div style={{
          height: insertBefore ? 4 : 2, width: '100%', borderRadius: 2,
          marginLeft: depth * 14, transition: 'all 0.08s',
          background: insertBefore ? '#34d399' : (dragActive ? 'rgba(52,211,153,0.3)' : 'transparent'),
          boxShadow: insertBefore ? '0 0 6px rgba(52,211,153,0.8)' : 'none',
        }} />
      </div>
      <div
        data-node-id={obj.id}
        onPointerDown={e => onNodePointerDown(obj.id, e)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(obj.id, e.clientX, e.clientY); }}
        onClick={() => { if (editingLabelId !== obj.id) selectedCallback(obj.id); }}
        onDoubleClick={() => { if (editingLabelId !== obj.id) onFocusObject(obj.id); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: depth * 14 + 4, paddingTop: 4, paddingBottom: 4, paddingRight: 6,
          borderRadius: 6, cursor: 'pointer',
          background: dragOver ? 'rgba(52,211,153,0.18)' : isSel ? 'rgba(99,102,241,0.25)' : 'transparent',
          border: dragOver ? '1px dashed #34d399' : `1px solid ${isSel ? 'rgba(99,102,241,0.5)' : 'transparent'}`,
          opacity: obj.hidden ? 0.4 : 1,
          outline: dragOver ? '1px dashed #34d399' : 'none',
        }}
        onMouseEnter={e => { if (!isSel && !dragOver) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={e => { if (!isSel && !dragOver) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      >
        {/* 펼치기/접기 */}
        <button
          onClick={e => { e.stopPropagation(); if (hasChildren) toggle(obj.id); }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 9, cursor: hasChildren ? 'pointer' : 'default', padding: 0, width: 12, flexShrink: 0, lineHeight: 1 }}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </button>
        <span style={{ fontSize: 12, flexShrink: 0 }}>{KIND_ICONS[obj.kind] ?? '❓'}</span>
        {/* 이름 (더블클릭 편집) */}
        {editingLabelId === obj.id ? (
          <input autoFocus value={editingLabelValue}
            onChange={e => setEditingLabelValue(e.target.value)}
            onBlur={() => { const v = editingLabelValue.trim(); if (v) setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, label: v } : o)); setEditingLabelId(null); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingLabelId(null); }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid #6366f1', borderRadius: 4, color: '#fff', fontSize: 11, padding: '1px 5px', outline: 'none' }} />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); setEditingLabelId(obj.id); setEditingLabelValue(obj.label || `${KIND_LABELS[obj.kind] ?? obj.kind} ${i + 1}`); }}
            title={tCanvas("tooltip_node_rename_parent")}
            style={{ flex: 1, fontSize: 11, fontWeight: isSel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSel ? '#a5b4fc' : '#e2e8f0' }}>
            {obj.label || `${KIND_LABELS[obj.kind] ?? obj.kind} ${i + 1}`}
          </span>
        )}
        {/* 레이어 배지 — Default(0) 는 생략, 1~9 만 색상 표시 */}
        {(obj.layer ?? 0) > 0 && (
          <span title={`Layer ${obj.layer}`}
            style={{ flexShrink: 0, minWidth: 14, height: 14, padding: '0 4px', borderRadius: 7, background: LAYER_COLORS[obj.layer as number] ?? '#475569', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {obj.layer}
          </span>
        )}
        {/* 아이콘 버튼들 — 부모를 hide/lock 하면 자손도 다같이 (cascade) */}
        <button onClick={e => { e.stopPropagation(); const nv = !obj.hidden; const ids = new Set([obj.id, ...collectDescendants(obj.id, allObjects)]); setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, hidden: nv } : o)); }}
          style={{ background: 'none', border: 'none', color: obj.hidden ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>
          {obj.hidden ? '🙈' : '👁'}
        </button>
        <button onClick={e => { e.stopPropagation(); const nv = !obj.locked; const ids = new Set([obj.id, ...collectDescendants(obj.id, allObjects)]); setObjects(prev => prev.map(o => ids.has(o.id) ? { ...o, locked: nv } : o)); }}
          style={{ background: 'none', border: 'none', color: obj.locked ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>
          {obj.locked ? '🔒' : '🔓'}
        </button>
        <button onClick={e => { e.stopPropagation(); setObjects(prev => { const next = prev.filter(o => o.id !== obj.id); pushHistory(next); return next; }); }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 14, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
      </div>
      {/* 자식 노드들 */}
      {open && hasChildren && children.map(child => (
        <SceneListNode key={child.id} obj={child} allObjects={allObjects} depth={depth + 1}
          selectedId={selectedId} multiSelectedIds={multiSelectedIds}
          editingLabelId={editingLabelId} editingLabelValue={editingLabelValue}
          setEditingLabelId={setEditingLabelId} setEditingLabelValue={setEditingLabelValue}
          setObjects={setObjects} selectedCallback={selectedCallback}
          pushHistory={pushHistory}
          dragActive={dragActive} overId={overId} overMode={overMode} onNodePointerDown={onNodePointerDown}
          onFocusObject={onFocusObject} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}

/* ── 시뮬레이션: 씬 레퍼런스 캡처 ── */
function SceneRefCapture({ target }: { target: { current: THREE.Scene | null } }) {
  const { scene } = useThree();
  target.current = scene as THREE.Scene;
  return null;
}

/* ── 노출(toneMapping) + HDRI IBL 강도 라이브 업데이트
   gl prop / Environment prop 은 초기 마운트만 적용되므로 매 렌더마다 직접 세팅한다. */
/** 스튜디오 메인 태양광 — 카메라 위치 따라가서 shadow frustum 안에 항상 오브젝트가 들어오게.
 *  방향은 첫 dirlight 오브젝트(있으면)의 회전, 없으면 기본 각도. 단일 그림자맵(cascade 없음 → 경계 이음새 없음). */
function FollowingStudioSun({ intensity, dir }: { intensity: number; dir: [number, number, number] }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const cam = state.camera.position;
    // dir = 빛이 나아가는 방향. 광원은 그 반대쪽 위에 두고, 타겟은 카메라 앞 dir 방향.
    ref.current.position.set(cam.x - dir[0] * 40, cam.y - dir[1] * 40, cam.z - dir[2] * 40);
    ref.current.target.position.set(cam.x + dir[0], cam.y + dir[1], cam.z + dir[2]);
    ref.current.target.updateMatrixWorld();
    // 유저 dirlight 억제 — 이 카메라추적 태양이 유일 그림자 광원(고정위치 dirlight 는 그림자 frustum 이 씬을 못 덮어
    // 빛이 지형/큐브를 뚫는 문제가 있음). 유저 dirlight 는 방향(회전)·강도 핸들로만 쓰고 실제 빛/그림자는 여기서.
    const me = ref.current, tgt = ref.current.target;
    state.scene.traverse((o) => {
      const dl = o as THREE.DirectionalLight;
      if (dl.isDirectionalLight && dl !== me && dl !== tgt) {
        if (dl.intensity !== 0) dl.intensity = 0;
        if (dl.castShadow) dl.castShadow = false;
      }
    });
  });
  return (
    <directionalLight
      ref={ref}
      intensity={intensity}
      castShadow
      shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-50} shadow-camera-right={50}
      shadow-camera-top={50} shadow-camera-bottom={-50}
      shadow-camera-near={0.5} shadow-camera-far={200}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

function ExposureUpdater({ exposure, hdriIntensity }: { exposure: number; hdriIntensity: number }) {
  const { gl, scene } = useThree();
  gl.toneMappingExposure = exposure;
  // scene.environmentIntensity 는 Three.js r155+ 지원. HDRI 가 머티리얼에 주는 빛 세기를 곱함.
  (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = hdriIntensity;
  return null;
}

/* drei <Html occlude="blending">(영상 화면)은 캔버스의 pointerEvents=none + position=absolute +
   거대한 z-index 를 설정하고, 언마운트돼도 복구하지 않는다. 안 풀면:
     - pointerEvents:none → 우클릭 회전/클릭 선택이 죽음
     - position:absolute + z-index → 시뮬 종료 후 캔버스가 모달(컴포넌트 추가 등) 위로 떠 가림
   pointerEvents 는 항상 auto 로. position/z-index 는 시뮬 중엔 영상 합성에 필요하니 두고,
   시뮬이 아닐 때(편집 모드)만 제거해 정상 레이아웃으로 복구. */
function CanvasPointerEventsKeeper({ simulating }: { simulating: boolean }) {
  const { gl } = useThree();
  useFrame(() => {
    const s = gl.domElement.style;
    if (s.pointerEvents === 'none') s.pointerEvents = 'auto';
    if (!simulating) {
      if (s.position === 'absolute') s.position = '';
      if (s.zIndex) s.zIndex = '';
    }
  });
  return null;
}

/* ── 시뮬레이션: 물리 씬 렌더러 (평면화 — 세계좌표 기준) ── */
type SimTransforms = Record<string, { pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number] }>;

/** Rapier 강체 — 우리가 호출하는 메서드만 추린 미니 인터페이스 (WorldCanvas와 동일) */
interface SimRapierBodyApi {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
  setTranslation(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
  setRotation(q: { x: number; y: number; z: number; w: number }, wakeUp: boolean): void;
  applyImpulse(v: { x: number; y: number; z: number }, wakeUp: boolean): void;
}
type SimBodyRefs = {
  body: React.MutableRefObject<SimRapierBodyApi | null>;
  group: React.MutableRefObject<THREE.Group | null>;
};

/** 콜라이더 충돌/트리거 이벤트 종류 */
type ColliderEventKind = 'triggerEnter' | 'triggerExit' | 'collisionEnter' | 'collisionExit';
type ColliderHit = { other: { rigidBodyObject?: THREE.Object3D | null } };
type ColliderEvents = {
  onIntersectionEnter?: (p: ColliderHit) => void; onIntersectionExit?: (p: ColliderHit) => void;
  onCollisionEnter?: (p: ColliderHit) => void; onCollisionExit?: (p: ColliderHit) => void;
};
/** rapier 충돌 페이로드에서 상대 오브젝트 id 추출 (오브젝트는 userData.objectId, 그 외=플레이어로 간주) */
function colliderOtherId(p: ColliderHit): string {
  // 오브젝트는 objectId, 플레이어는 playerId(시뮬은 '__sim_player__'), 둘 다 없으면 'player'.
  const ud = p.other.rigidBodyObject?.userData as { objectId?: string; playerId?: string } | undefined;
  return ud?.objectId ?? ud?.playerId ?? 'player';
}
/** trigger 면 intersection(센서) 이벤트, 아니면 collision 이벤트를 오브젝트 스크립트로 디스패치 */
function buildColliderEvents(objId: string, trig: boolean, onColliderEvent?: (objId: string, otherId: string, kind: ColliderEventKind) => void): ColliderEvents {
  if (!onColliderEvent) return {};
  return trig
    ? { onIntersectionEnter: (p) => onColliderEvent(objId, colliderOtherId(p), 'triggerEnter'),
        onIntersectionExit:  (p) => onColliderEvent(objId, colliderOtherId(p), 'triggerExit') }
    : { onCollisionEnter: (p) => onColliderEvent(objId, colliderOtherId(p), 'collisionEnter'),
        onCollisionExit:  (p) => onColliderEvent(objId, colliderOtherId(p), 'collisionExit') };
}

/** 오브젝트 1개 렌더 + body/light ref 등록 (스크립트에서 제어 가능하도록) */
function SimObject({ obj, transforms, myAssets, scriptBodyRefs, lightRefs, onColliderEvent, buoyancyRef }: {
  obj: MapObject;
  transforms: SimTransforms;
  myAssets: Asset[];
  scriptBodyRefs: React.MutableRefObject<Map<string, SimBodyRefs>>;
  lightRefs: React.MutableRefObject<Map<string, THREE.Light>>;
  onColliderEvent?: (objId: string, otherId: string, kind: ColliderEventKind) => void;
  buoyancyRef?: React.MutableRefObject<BuoyancyVolume[]>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    scriptBodyRefs.current.set(obj.id, { body: bodyRef, group: groupRef });
    return () => { scriptBodyRefs.current.delete(obj.id); };
  }, [obj.id, scriptBodyRefs]);

  // 월드 밖으로 일정 이상 떨어진 동적 오브젝트 → 원위치로 복귀 + 물 부력
  useFrame((rtState, dt) => {
    // 키프레임 애니메이션 — 시뮬 중 타임라인대로 움직임. 콜라이더 있으면 키네마틱 바디(충돌 플랫폼).
    const kf = obj.keyframeAnim;
    if (kf?.autoplay && kf.keys?.length) {
      const s = sampleKeyframeAnim(kf, rtState.clock.elapsedTime);
      if (s) {
        const hasCollider = !!obj.components?.find(c => c.type === 'collider');
        const isDyn2 = (() => { const pc = obj.components?.find(c => c.type === 'physics'); return pc ? String(pc.props?.mode ?? 'fixed') === 'dynamic' : obj.physics === 'dynamic'; })();
        const kine = hasCollider && !isDyn2;
        // 부모 그룹 월드행렬 (부모 종속 오브젝트 합성)
        let parentWorld: THREE.Matrix4 | null = null;
        if (obj.parentId) {
          const pg = scriptBodyRefs.current.get(obj.parentId)?.group.current;
          if (pg) { pg.updateMatrixWorld(); parentWorld = pg.matrixWorld; }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kb = bodyRef.current as any;
        if (kine && kb?.setNextKinematicTranslation) {
          composeSampledWorld(s, parentWorld, _simKfPos, _simKfQuat);
          kb.setNextKinematicTranslation(_simKfPos);
          kb.setNextKinematicRotation?.(_simKfQuat);
        } else if (groupRef.current) {
          applySampledTRS(groupRef.current, s, parentWorld);
        }
      }
    }
    const b = bodyRef.current;
    if (!b) return;
    const comp = obj.components?.find(c => c.type === 'physics');
    const isDyn = comp ? String(comp.props?.mode ?? 'fixed') === 'dynamic' : obj.physics === 'dynamic';
    if (!isDyn) return;
    const home = transforms[obj.id] ?? { pos: obj.position, rot: obj.rotation };
    const tr = b.translation();
    if (tr.y < home.pos[1] - OBJ_FALL_RESET) {
      b.setTranslation({ x: home.pos[0], y: home.pos[1], z: home.pos[2] }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel?.({ x: 0, y: 0, z: 0 }, true);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(home.rot[0], home.rot[1], home.rot[2]));
      b.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      return;
    }
    // 물 부력 — 무게에 따라 뜨기/가라앉기 (월드와 동일).
    const bvs = buoyancyRef?.current;
    if (bvs && bvs.length) {
      const weight = Math.max(0.1, Number(comp?.props?.weight ?? 1));
      const wt = rtState.clock.elapsedTime;
      for (let i = 0; i < bvs.length; i++) {
        const bv = bvs[i];
        if (Math.abs(tr.x - bv.cx) > bv.hx || Math.abs(tr.z - bv.cz) > bv.hz) continue;
        let surf = bv.cy + bv.offset;
        if (bv.waveStrength) {
          const lx = bv.hx ? (tr.x - bv.cx) / (2 * bv.hx) : 0;
          const ly = bv.hz ? -(tr.z - bv.cz) / (2 * bv.hz) : 0;
          const a = 0.04 * bv.waveStrength;
          surf += Math.sin(lx * 5 * bv.waveFreq + wt * 2 * bv.waveSpeed) * a + Math.cos(ly * 5 * bv.waveFreq + wt * 1.5 * bv.waveSpeed) * a;
        }
        if (tr.y > surf + 0.3 || tr.y < bv.cy - bv.scaleY - 1) continue;
        const vel = b.linvel();
        const k = 1 - Math.exp(-3 * dt);
        const sub = surf - tr.y;
        const tvy = weight <= 1 ? Math.max(-2, Math.min(3, sub * 5 / Math.max(0.3, weight))) : -0.4 * (weight - 1);
        b.setLinvel({ x: vel.x * (1 - 0.6 * k), y: vel.y + (tvy - vel.y) * k, z: vel.z * (1 - 0.6 * k) }, true);
        const av = b.angvel?.();
        if (av) b.setAngvel?.({ x: av.x * (1 - k), y: av.y * (1 - k), z: av.z * (1 - k) }, true);
        break;
      }
    }
  });

  const t = transforms[obj.id] ?? { pos: obj.position, rot: obj.rotation, scl: obj.scale };

  const lightRefCb = (light: THREE.Light | null) => {
    if (light) {
      lightRefs.current.set(obj.id, light);
      // dirlight: 타겟을 라이트 자식(로컬 -Y)으로 붙여 방향이 "회전"을 따르게 한다.
      // (기본 타겟은 원점 고정 → 위치만 방향에 영향, 회전은 무시되는 버그. 자식 타겟이면 그 반대.)
      if (obj.kind === 'dirlight') {
        const dl = light as THREE.DirectionalLight;
        dl.target.position.set(0.5, -1, 0.5);   // 비스듬한 기본 각도(수직 아니라 입체감) — 회전으로 추가 조절
        if (dl.target.parent !== dl) dl.add(dl.target);
      }
    } else {
      lightRefs.current.delete(obj.id);
    }
  };

  // Collider 컴포넌트 (트리거/충돌). 빈 오브젝트(트리거 존 등)도 콜라이더가 있으면 바디를 렌더한다.
  const colliderComp = obj.components?.find(c => c.type === 'collider');
  const trig = !!colliderComp?.props?.trigger;
  const colliderEvents = buildColliderEvents(obj.id, trig, onColliderEvent);
  const colliderBox = colliderComp ? {
    hx: Math.max(0.01, Number(colliderComp.props?.sizeX ?? 1)) / 2,
    hy: Math.max(0.01, Number(colliderComp.props?.sizeY ?? 1)) / 2,
    hz: Math.max(0.01, Number(colliderComp.props?.sizeZ ?? 1)) / 2,
    ox: Number(colliderComp.props?.offsetX ?? 0),
    oy: Number(colliderComp.props?.offsetY ?? 0),
    oz: Number(colliderComp.props?.offsetZ ?? 0),
  } : null;

  // UI 오브젝트 — 3D 씬에 렌더 X. 별도 UIRenderer 가 HTML overlay 로 처리.
  if (obj.kind === 'ui') return null;

  // Terrain — heightmap 기반 지면. rotation 은 TerrainMesh 내부에서 처리 (데이터 rotation 무시).
  // 물리: trimesh auto-collider — TerrainMesh 의 실제 geometry 로 정확한 충돌. fixed body.
  if (obj.kind === 'terrain' && obj.terrain) {
    return (
      <RigidBody ref={bodyRef} type="fixed" colliders="trimesh" userData={{ objectId: obj.id }}
        position={t.pos} rotation={[0, 0, 0]} scale={t.scl ?? obj.scale}>
        <TerrainMesh terrain={obj.terrain} castShadow receiveShadow />
      </RigidBody>
    );
  }
  // 복셀 지형 (아스트로니어식) — 시뮬: 청크별 trimesh 콜라이더. 파기 시 닿은 청크만 재빌드.
  if (obj.kind === 'voxel' && obj.voxel) {
    return (
      <ChunkedVoxelTerrain objectId={obj.id} data={obj.voxel}
        position={t.pos} rotation={t.rot ?? obj.rotation} scale={t.scl ?? obj.scale}
        color={obj.materialColor || obj.color || '#7a6b55'} />
    );
  }

  // 스폰·빈 오브젝트 — 메시는 없지만 콜라이더(트리거 존 등)가 있으면 콜라이더 바디만 렌더(트리거 발동용), 없으면 렌더 X.
  if (obj.kind === 'spawn' || obj.kind === 'empty') {
    if (!colliderBox) return null;
    return (
      <RigidBody ref={bodyRef} type="fixed" colliders={false} userData={{ objectId: obj.id }}
        position={t.pos} rotation={t.rot} scale={t.scl} {...colliderEvents}>
        <CuboidCollider args={[colliderBox.hx, colliderBox.hy, colliderBox.hz]} position={[colliderBox.ox, colliderBox.oy, colliderBox.oz]} sensor={trig} />
      </RigidBody>
    );
  }

  // 조명은 Three.js 라이트로 렌더링 (물리 없음)
  if (obj.kind === 'pointlight') return (
    <pointLight ref={lightRefCb} position={t.pos} color={obj.lightColor || '#ffffff'}
      intensity={obj.lightIntensity ?? 1} distance={obj.lightDistance ?? 0} decay={1} castShadow={obj.castShadow ?? false}
      shadow-mapSize={[1024, 1024]}
      shadow-camera-near={0.1}
      shadow-camera-far={(obj.lightDistance ?? 0) > 0 ? obj.lightDistance! : 100}
      shadow-bias={-0.0005}
      shadow-normalBias={0.02} />
  );
  if (obj.kind === 'dirlight') return (
    <directionalLight ref={lightRefCb} position={t.pos} rotation={t.rot ?? obj.rotation} color={obj.lightColor || '#ffffff'}
      intensity={obj.lightIntensity ?? 1} castShadow={obj.castShadow ?? false}
      shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-80} shadow-camera-right={80}
      shadow-camera-top={80} shadow-camera-bottom={-80}
      shadow-camera-near={0.1} shadow-camera-far={200}
      shadow-bias={-0.0005} shadow-normalBias={0.04} />
  );
  if (obj.kind === 'spotlight') return (
    <spotLight ref={lightRefCb} position={t.pos} color={obj.lightColor || '#ffffff'}
      intensity={obj.lightIntensity ?? 1} distance={obj.lightDistance ?? 0}
      angle={(obj.lightAngle ?? 45) * Math.PI / 180} penumbra={obj.lightPenumbra ?? 0.2}
      decay={1} castShadow={obj.castShadow ?? false}
      shadow-mapSize={[1024, 1024]}
      shadow-camera-near={0.1}
      shadow-camera-far={(obj.lightDistance ?? 0) > 0 ? obj.lightDistance! : 100}
      shadow-bias={-0.0005}
      shadow-normalBias={0.02} />
  );

  const assetConfig = getAssetMaterialConfig(myAssets.find(a => a.modelUrl === obj.assetUrl));
  const mesh = <Mesh3D obj={obj} selected={false} onClick={() => {}} assetConfig={assetConfig} noTransform />;
  // 물리: Physics 컴포넌트 우선 → 레거시 obj.physics → 없으면 'none' (콜라이더 X)
  const physicsComp = obj.components?.find(c => c.type === 'physics');
  const phys: 'none' | 'fixed' | 'dynamic' = physicsComp
    ? (String(physicsComp.props?.mode ?? 'fixed') === 'dynamic' ? 'dynamic' : 'fixed')
    : (obj.physics ?? 'none');
  // colliderComp / trig / colliderEvents / colliderBox 는 위(빈 오브젝트 처리 전)에서 이미 계산됨.
  // 물리도 콜라이더 컴포넌트도 없으면 충돌 X
  if (phys === 'none' && !colliderComp) {
    return <group ref={groupRef} position={t.pos} rotation={t.rot} scale={t.scl}>{mesh}</group>;
  }
  // 콜라이더만 있고 physics 가 없으면 고정(fixed) 바디. 키프레임+콜라이더면 키네마틱(충돌하는 이동 플랫폼).
  const kfAuto = !!obj.keyframeAnim?.autoplay && !!obj.keyframeAnim?.keys?.length;
  const isKinematicAnim = kfAuto && phys !== 'dynamic' && !!colliderComp;
  const bodyType: 'fixed' | 'dynamic' | 'kinematicPosition' =
    isKinematicAnim ? 'kinematicPosition' : (phys === 'dynamic' ? 'dynamic' : 'fixed');
  if (colliderComp && colliderBox) {
    return (
      <RigidBody ref={bodyRef} type={bodyType} colliders={false} userData={{ objectId: obj.id }}
        position={t.pos} rotation={t.rot} scale={t.scl} {...colliderEvents}>
        <CuboidCollider args={[colliderBox.hx, colliderBox.hy, colliderBox.hz]} position={[colliderBox.ox, colliderBox.oy, colliderBox.oz]} sensor={trig} />
        {mesh}
      </RigidBody>
    );
  }
  // Physics 만으로는 충돌체 X — Collider 컴포넌트가 있어야 충돌 (위 분기에서 처리). 여기는 자동 콜라이더 없이 바디만.
  return (
    <RigidBody ref={bodyRef} type={bodyType} colliders={false} userData={{ objectId: obj.id }}
      position={t.pos} rotation={t.rot} scale={t.scl}>
      {mesh}
    </RigidBody>
  );
}

/** 스크립트 onUpdate(dt) 호출 + worldElapsed 누적 — Canvas 내부에서만 useFrame 동작.
 *  메인 스크립트 + user 컴포넌트 VM 둘 다 dispatch. */
function SimScriptLoop({
  luaScripts, componentScripts, worldElapsed,
  allObjectsRef, scriptBodyRefs, lightRefs,
}: {
  luaScripts: React.MutableRefObject<Map<string, import('@/lib/world/jsRuntime').JsScript>>;
  componentScripts: React.MutableRefObject<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript }>>>;
  worldElapsed: React.MutableRefObject<number>;
  /** 전체 오브젝트 (saved + runtime) — parent transform propagation 용 */
  allObjectsRef: React.MutableRefObject<MapObject[]>;
  scriptBodyRefs: React.MutableRefObject<Map<string, SimBodyRefs>>;
  lightRefs: React.MutableRefObject<Map<string, THREE.Light>>;
}) {
  useFrame((_, dt) => {
    worldElapsed.current += dt;
    for (const vm of luaScripts.current.values()) vm.callUpdate(dt);
    for (const arr of componentScripts.current.values()) {
      for (const { vm } of arr) vm.callUpdate(dt);
    }

    // 부모 → 자식 transform propagation. spawn 제외, dynamic body 자식 제외. lights 는 lightRefs 갱신.
    const all = allObjectsRef.current;
    if (!all || all.length === 0) return;
    const childrenOf = new Map<string, MapObject[]>();
    for (const obj of all) {
      if (!obj.parentId) continue;
      if (obj.kind === 'spawn') continue;
      if (!childrenOf.has(obj.parentId)) childrenOf.set(obj.parentId, []);
      childrenOf.get(obj.parentId)!.push(obj);
    }
    if (childrenOf.size === 0) return;
    const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
    const propagate = (parentId: string, parentWorld: THREE.Matrix4) => {
      const kids = childrenOf.get(parentId);
      if (!kids) return;
      for (const child of kids) {
        const childLocal = new THREE.Matrix4().compose(
          new THREE.Vector3(child.position[0], child.position[1], child.position[2]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(child.rotation[0], child.rotation[1], child.rotation[2], 'XYZ')),
          new THREE.Vector3(child.scale[0], child.scale[1], child.scale[2]),
        );
        const childWorld = parentWorld.clone().multiply(childLocal);
        childWorld.decompose(_p, _q, _s);
        const isLight = child.kind === 'pointlight' || child.kind === 'spotlight' || child.kind === 'dirlight';
        if (isLight) {
          const lr = lightRefs.current.get(child.id);
          if (lr) {
            lr.position.set(_p.x, _p.y, _p.z);
            lr.quaternion.set(_q.x, _q.y, _q.z, _q.w);
          }
        } else {
          const ref = scriptBodyRefs.current.get(child.id);
          if (ref?.body.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bodyType = (ref.body.current as any).bodyType?.();
            if (bodyType !== 0) { // Dynamic 제외
              ref.body.current.setTranslation({ x: _p.x, y: _p.y, z: _p.z }, true);
              ref.body.current.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
            }
          } else if (ref?.group.current) {
            ref.group.current.position.set(_p.x, _p.y, _p.z);
            ref.group.current.quaternion.set(_q.x, _q.y, _q.z, _q.w);
            ref.group.current.scale.set(_s.x, _s.y, _s.z);
          }
        }
        propagate(child.id, childWorld);
      }
    };
    for (const parentId of childrenOf.keys()) {
      const ref = scriptBodyRefs.current.get(parentId);
      const parentWorld = new THREE.Matrix4();
      if (ref?.body.current) {
        const t = ref.body.current.translation();
        const r = ref.body.current.rotation();
        const parentObj = all.find(o => o.id === parentId);
        const sc = parentObj?.scale ?? [1, 1, 1];
        parentWorld.compose(
          new THREE.Vector3(t.x, t.y, t.z),
          new THREE.Quaternion(r.x, r.y, r.z, r.w),
          new THREE.Vector3(sc[0], sc[1], sc[2]),
        );
      } else if (ref?.group.current) {
        ref.group.current.updateMatrix();
        parentWorld.copy(ref.group.current.matrix);
      } else {
        continue;
      }
      propagate(parentId, parentWorld);
    }
  });
  return null;
}

/* 시뮬레이션 1인칭 시 카메라 near plane 을 키워서 머리/가까운 지오메트리 클리핑.
   free cam / 편집 모드에선 기본값(0.1)로 복귀. */
function SimCameraNear({ near }: { near: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = near;
    cam.updateProjectionMatrix();
    return () => { cam.near = 0.1; cam.updateProjectionMatrix(); };
  }, [camera, near]);
  return null;
}

function SimScene({ objects, transforms, myAssets, player, gameApi, gameStore }: {
  objects: MapObject[];
  transforms: SimTransforms;
  myAssets: Asset[];
  /** 게임 로직 레이어 — 스크립트의 game/ui/world.playSound 가 이 API 로 들어감. */
  gameApi: import('@/lib/world/gameRuntime').JsGameAPI;
  /** 게임 런타임 스토어 — UI 버튼 클릭 핸들러 등록용. */
  gameStore?: import('@/lib/world/gameRuntime').GameRuntimeStore;
  /** 시뮬레이션 플레이어 — 본인 캐릭터로 직접 플레이 (월드와 동일). null 이면 플레이어 없음. */
  player?: {
    character: Record<string, unknown>;
    cameraMode: 'first' | 'third';
    onToggleCameraMode: () => void;
    onGrabUiChange: (state: 'idle' | 'aim' | 'grab') => void;
    /** 'free' 자유시점 모드 — Player 입력/카메라 비활성 (외부 fly 카메라가 제어) */
    freeCam: boolean;
    /** 점프력 (맵 설정) */
    jumpPower: number;
    ownersRef: React.MutableRefObject<Map<string, string>>;
    grabbedStateRef: React.MutableRefObject<Map<string, string>>;
    grabbableIdsRef: React.MutableRefObject<Set<string>>;
    remoteGrabbedByRef: React.MutableRefObject<Map<string, string>>;
    spawnPos: [number, number, number];
    spawnRotY: number;
  };
}) {
  // 런타임 spawn된 오브젝트 (로컬, 시뮬레이션 종료 시 사라짐)
  const [runtimeObjects, setRuntimeObjects] = useState<MapObject[]>([]);
  // 런타임 깎기(world.carve) override — objectId → 절삭 목록. 저장본/런타임 둘 다 csgCuts 병합.
  const [simCarveOverrides, setSimCarveOverrides] = useState<Record<string, CsgCut[]>>({});
  // 런타임 복셀 변형(world.dig/build) override — 시뮬용
  const [simVoxelDeforms, setSimVoxelDeforms] = useState<Record<string, import('@/lib/world/voxelVolume').VoxelDeform[]>>({});
  const runtimeObjectsRef = useRef<MapObject[]>([]);
  useEffect(() => { runtimeObjectsRef.current = runtimeObjects; }, [runtimeObjects]);
  // ── 게임 컴포넌트 런타임 store (WorldCanvas 와 동일 패턴 — 시뮬에서도 작동) ──
  const healthStoreRef = useRef<Map<string, number>>(new Map());
  const healthInvulnRef = useRef<Map<string, number>>(new Map());
  const npcAttackRef = useRef<Map<string, number>>(new Map());
  const npcPatrolRef = useRef<Map<string, { tx: number; tz: number; nextAt: number; homeX: number; homeZ: number }>>(new Map());
  const damageAoeRef = useRef<Map<string, number>>(new Map());

  // 스크립트가 오브젝트를 제어하려고 참조하는 ref 레지스트리
  const scriptBodyRefs = useRef<Map<string, SimBodyRefs>>(new Map());
  // 플레이어 제어 — world.teleport/respawn/setSpawn. Player 가 텔레포트 함수 등록, spawnRef=리스폰 지점.
  const playerCtlRef = useRef<PlayerControl | null>(null);
  // 시뮬 플레이어 실시간 위치 — Player 가 매 frame 갱신. world.getPlayers() 가 본인 위치 반환용 (높이 체크 등).
  const simPlayerPoseRef = useRef<{ x: number; y: number; z: number; rotY: number }>({ x: 0, y: 0, z: 0, rotY: 0 });
  // 부력 볼륨 — water + buoyancy 컴포넌트. 시뮬 Player 가 수영/뜨기 물리에 사용. transforms 반영.
  const simBuoyancyRef = useRef<BuoyancyVolume[]>([]);
  useEffect(() => {
    const merged = objects.map(o => { const t = transforms[o.id]; return t ? { ...o, position: t.pos, scale: t.scl } : o; });
    simBuoyancyRef.current = computeBuoyancyVolumes(merged);
  }, [objects, transforms]);
  const simAmbientZones: AmbientSoundZone[] = useMemo(() => {
    const merged = objects.map(o => { const t = transforms[o.id]; return t ? { ...o, position: t.pos, scale: t.scl } : o; });
    return computeAmbientSoundZones(merged);
  }, [objects, transforms]);
  const simDayNightInst: ComponentInstance | null = useMemo(() => findDayNightComponent(objects), [objects]);
  const simSeats: SeatSpot[] = useMemo(() => {
    const merged = objects.map(o => { const t = transforms[o.id]; return t ? { ...o, position: t.pos, rotation: t.rot } : o; });
    return computeSeats(merged);
  }, [objects, transforms]);
  const spawnRef = useRef<[number, number, number]>([0, 4, 0]);
  useEffect(() => { if (player?.spawnPos) spawnRef.current = player.spawnPos; }, [player?.spawnPos]);
  // per-player 제어 명령을 시뮬 플레이어에 적용 (시뮬은 단일 플레이어라 항상 로컬).
  const applyPlayerCmd = useCallback((cmd: { t?: string; x?: number; y?: number; z?: number; slot?: string | null; dur?: number }) => {
    if (cmd.t === 'tp') playerCtlRef.current?.teleport(Number(cmd.x), Number(cmd.y), Number(cmd.z));
    else if (cmd.t === 'respawn') { const [x, y, z] = spawnRef.current; playerCtlRef.current?.teleport(x, y + 1, z); }
    else if (cmd.t === 'setspawn') spawnRef.current = [Number(cmd.x), Number(cmd.y), Number(cmd.z)];
    else if (cmd.t === 'emote') playerCtlRef.current?.setEmote(cmd.slot ?? null, cmd.dur);
  }, []);
  const lightRefs = useRef<Map<string, THREE.Light>>(new Map());
  const luaScripts = useRef<Map<string, import('@/lib/world/jsRuntime').JsScript>>(new Map());
  // user 컴포넌트 VM 들 — objectId → 배열 (오브젝트당 여러 부착 가능)
  const componentScripts = useRef<Map<string, Array<{ vm: import('@/lib/world/jsRuntime').JsScript }>>>(new Map());
  // 클릭 파티클 버스트 — objectId → nonce. 1인칭 클릭 시 +1, Particles(click 모드)가 폴링.
  const clickBurstRef = useRef<Map<string, number>>(new Map());
  const triggerClickBurst = useCallback((objectId: string) => {
    clickBurstRef.current.set(objectId, (clickBurstRef.current.get(objectId) ?? 0) + 1);
    // 시뮬은 단일 플레이어 — onClick 스크립트를 로컬에서 바로 실행 (월드는 호스트 권위로 처리)
    luaScripts.current.get(objectId)?.callClick('player');
    componentScripts.current.get(objectId)?.forEach(({ vm }) => vm.callClick('player'));
  }, []);
  // UI 버튼(ui.button) 클릭 → 스크립트 onUiClick(id) 디스패치
  useEffect(() => {
    gameStore?.setHudClickHandler((id) => {
      luaScripts.current.forEach(vm => vm.callUiClick(id));
      componentScripts.current.forEach(arr => arr.forEach(({ vm }) => vm.callUiClick(id)));
    });
    return () => gameStore?.setHudClickHandler(null);
  }, [gameStore]);
  // user 컴포넌트 코드 캐시 — id → ScriptComponent
  const scriptComponentDefsRef = useRef<Map<string, ScriptComponent>>(new Map());
  const [scriptCompsLoaded, setScriptCompsLoaded] = useState(0);
  const worldElapsed = useRef(0);

  // 시뮬레이션 시작 시점에 본인 + 공식 컴포넌트 fetch (캐시 갱신)
  useEffect(() => {
    const tok = session.getToken();
    const tasks: Array<Promise<unknown>> = [];
    tasks.push(
      api.listOfficialScriptComponents(tok || undefined)
        .then(r => { for (const c of r.components) scriptComponentDefsRef.current.set(c.id, c); })
        .catch(e => console.warn('[SimScene] official fetch fail', e))
    );
    if (tok) {
      tasks.push(
        api.listMyScriptComponents(tok)
          .then(r => { for (const c of r.components) scriptComponentDefsRef.current.set(c.id, c); })
          .catch(e => console.warn('[SimScene] my fetch fail', e))
      );
    }
    Promise.all(tasks).then(() => setScriptCompsLoaded(n => n + 1));
  }, []);

  const spawnObject = useCallback((opts: import('@/lib/world/jsRuntime').JsSpawnOpts): string => {
    const id = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const obj: MapObject = {
      id,
      kind:     opts.kind     ?? 'cube',
      assetUrl: opts.assetUrl,
      position: opts.position ?? [0, 5, 0],
      rotation: opts.rotation ?? [0, 0, 0],
      scale:    opts.scale    ?? [1, 1, 1],
      color:    opts.color    ?? '#ffffff',
      physics:  opts.physics  ?? 'dynamic',
      material: opts.material,
      materialColor: opts.materialColor,
    };
    setRuntimeObjects(prev => [...prev, obj]);
    return id;
  }, []);

  // 런타임 노이즈 지형 (PEAK 식 랜덤맵) — 시뮬용. 시드 결정적.
  const spawnTerrain = useCallback((params: { seed?: number; size?: number; segments?: number; amplitude?: number; scale?: number; baseColor?: string; x?: number; y?: number; z?: number; id?: string }): string => {
    const seed = Number(params.seed) || 1;
    const size = Number(params.size) || 80;
    const segments = Math.max(8, Math.min(192, Math.floor(Number(params.segments) || 64)));
    const amplitude = Number(params.amplitude) || 8;
    const scale = Number(params.scale) || 0.04;
    const baseColor = String(params.baseColor || '#5a8a4a');
    const x = Number(params.x) || 0, y = Number(params.y) || 0, z = Number(params.z) || 0;
    const id = params.id || `rtterr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const terrain = generateNoiseTerrain(size, segments, amplitude, scale, seed);
    terrain.baseColor = baseColor;
    const obj: MapObject = { id, kind: 'terrain', terrain, position: [x, y, z], rotation: [0, 0, 0], scale: [1, 1, 1], color: baseColor, physics: 'fixed' };
    setRuntimeObjects(prev => [...prev.filter(o => o.id !== id), obj]);
    return id;
  }, []);

  // 런타임 깎기(시뮬) — 큐브(id)에 절삭 추가. 시뮬은 단일 클라라 오브젝트 csgCuts 직접 갱신.
  const carveObject = useCallback((id: string, opts: { shape?: 'box' | 'sphere' | 'cylinder'; x?: number; y?: number; z?: number; size?: number; world?: boolean }): void => {
    if (!id) return;
    const shape: CsgCut['shape'] = (opts.shape === 'box' || opts.shape === 'cylinder') ? opts.shape : 'sphere';
    const sz = Math.max(0.02, Number(opts.size) || 0.4);
    let pos: [number, number, number] = [Number(opts.x) || 0, Number(opts.y) || 0, Number(opts.z) || 0];
    let size: [number, number, number] = [sz, sz, sz];
    if (opts.world) {
      const o = allObjectsRef.current.find(ob => ob.id === id);
      if (o) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(o.position[0], o.position[1], o.position[2]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0], o.rotation[1], o.rotation[2])),
          new THREE.Vector3(o.scale[0] || 1, o.scale[1] || 1, o.scale[2] || 1),
        );
        const p = new THREE.Vector3(pos[0], pos[1], pos[2]).applyMatrix4(m.invert());
        pos = [p.x, p.y, p.z];
        size = [sz / (o.scale[0] || 1), sz / (o.scale[1] || 1), sz / (o.scale[2] || 1)];
      }
    }
    const cut: CsgCut = { shape, pos, size };
    setSimCarveOverrides(prev => ({ ...prev, [id]: [...(prev[id] || []), cut] }));
  }, []);

  // 복셀 파기/쌓기 (시뮬) — 월드 좌표 → 복셀 로컬 변환 후 변형 추가
  const digVoxel = useCallback((id: string, opts: { x?: number; y?: number; z?: number; r?: number; dig?: boolean }): void => {
    if (!id) return;
    const o = allObjectsRef.current.find(ob => ob.id === id && ob.kind === 'voxel');
    if (!o || !o.voxel) return;
    const r = Math.max(0.2, Number(opts.r) || 1.5);
    const sx = o.scale[0] || 1, sy = o.scale[1] || 1, sz = o.scale[2] || 1;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(o.position[0], o.position[1], o.position[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0], o.rotation[1], o.rotation[2])),
      new THREE.Vector3(sx, sy, sz),
    );
    const p = new THREE.Vector3(Number(opts.x) || 0, Number(opts.y) || 0, Number(opts.z) || 0).applyMatrix4(m.invert());
    const def: import('@/lib/world/voxelVolume').VoxelDeform = {
      x: p.x, y: p.y, z: p.z, r: r / ((sx + sy + sz) / 3), dig: opts.dig !== false,
    };
    setSimVoxelDeforms(prev => ({ ...prev, [id]: [...(prev[id] || []), def] }));
  }, []);

  const destroyObject = useCallback((id: string) => {
    setRuntimeObjects(prev => prev.filter(o => o.id !== id));
    scriptBodyRefs.current.delete(id);
    lightRefs.current.delete(id);
  }, []);

  // 렌더 대상: 원본 + 런타임 spawn된 것
  const allObjects = useMemo(() => {
    let base = [...objects, ...runtimeObjects];
    if (Object.keys(simCarveOverrides).length > 0) {
      base = base.map(o => simCarveOverrides[o.id]
        ? { ...o, csgCuts: [...(o.csgCuts || []), ...simCarveOverrides[o.id]] } : o);
    }
    if (Object.keys(simVoxelDeforms).length > 0) {
      base = base.map(o => (o.voxel && simVoxelDeforms[o.id])
        ? { ...o, voxel: { ...o.voxel, deforms: [...o.voxel.deforms, ...simVoxelDeforms[o.id]] } } : o);
    }
    return base;
  }, [objects, runtimeObjects, simCarveOverrides, simVoxelDeforms]);
  // parent transform propagation 용 ref — useFrame 안에서 최신 list 접근
  const allObjectsRef = useRef<MapObject[]>([]);
  useEffect(() => { allObjectsRef.current = allObjects; }, [allObjects]);

  // ── Cutter 컴포넌트 (시뮬) — 박스가 지나간 자리를 대상 큐브에서 영구 깎기 ──
  const simCutterLast = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
  const simCutterAccum = useRef(0);
  useFrame((_s, dt) => {
    simCutterAccum.current += dt;
    if (simCutterAccum.current < 0.08) return;   // ~12Hz throttle
    simCutterAccum.current = 0;
    const all = allObjectsRef.current;
    const cutters = all.filter(o => o.components?.some(c => c.type === 'cutter'));
    if (cutters.length === 0) return;
    const matOf = (o: MapObject) => {
      const t = transforms[o.id];
      const p = t?.pos ?? o.position, r = t?.rot ?? o.rotation, s = t?.scl ?? o.scale;
      return new THREE.Matrix4().compose(
        new THREE.Vector3(p[0], p[1], p[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
        new THREE.Vector3(s[0] || 1, s[1] || 1, s[2] || 1));
    };
    for (const cutter of cutters) {
      const comp = cutter.components!.find(c => c.type === 'cutter')!;
      if (comp.props?.enabled === false) continue;
      const cpos = transforms[cutter.id]?.pos ?? cutter.position;
      const step = Math.max(0.05, Number(comp.props?.step ?? 0.3));
      const last = simCutterLast.current.get(cutter.id);
      if (last) {
        const dx = cpos[0] - last.x, dy = cpos[1] - last.y, dz = cpos[2] - last.z;
        if (dx * dx + dy * dy + dz * dz < step * step) continue;
      }
      const tok = String(comp.props?.target ?? '').trim();
      let target: MapObject | undefined;
      if (tok) target = all.find(o => o.id === tok || o.label === tok);
      else {
        let bd = Infinity;
        for (const o of all) {
          if (o.kind !== 'cube' || o.id === cutter.id) continue;
          const tp = transforms[o.id]?.pos ?? o.position;
          const d = (tp[0] - cpos[0]) ** 2 + (tp[1] - cpos[1]) ** 2 + (tp[2] - cpos[2]) ** 2;
          if (d < bd) { bd = d; target = o; }
        }
      }
      if (!target || target.kind !== 'cube') continue;
      const tgt = target;
      const maxCuts = Math.max(1, Number(comp.props?.maxCuts ?? 40));
      simCutterLast.current.set(cutter.id, { x: cpos[0], y: cpos[1], z: cpos[2] });
      if ((simCarveOverrides[tgt.id]?.length ?? 0) >= maxCuts) continue;
      const rel = new THREE.Matrix4().copy(matOf(tgt)).invert().multiply(matOf(cutter));
      const rp = new THREE.Vector3(), rq = new THREE.Quaternion(), rs = new THREE.Vector3();
      rel.decompose(rp, rq, rs);
      if (Math.abs(rp.x) > 0.5 + rs.x * 0.5 + 0.05 || Math.abs(rp.y) > 0.5 + rs.y * 0.5 + 0.05 || Math.abs(rp.z) > 0.5 + rs.z * 0.5 + 0.05) continue;
      const re = new THREE.Euler().setFromQuaternion(rq);
      const cut: CsgCut = { shape: 'box', pos: [rp.x, rp.y, rp.z], size: [rs.x, rs.y, rs.z], rot: [re.x, re.y, re.z] };
      setSimCarveOverrides(prev => ({ ...prev, [tgt.id]: [...(prev[tgt.id] || []), cut] }));
    }
  });

  // VM 재생성 키 — 원본 objects 의 script + components 변경 추적
  const scriptsKey = objects.map(o => o.id + '|' + (o.script ?? '') + '|' + JSON.stringify(o.components ?? []) + '|' + JSON.stringify(o.scriptVars ?? {})).join(',');

  useEffect(() => {
    const scripted = objects.filter(o => o.script);

    // 제거된 오브젝트 정리
    for (const [id, vm] of luaScripts.current) {
      if (!scripted.find(o => o.id === id)) {
        vm.destroy();
        luaScripts.current.delete(id);
      }
    }

    // 새 스크립트 오브젝트 VM 생성
    for (const obj of scripted) {
      if (luaScripts.current.has(obj.id)) continue;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JsScript } = require('@/lib/world/jsRuntime') as typeof import('@/lib/world/jsRuntime');
      const vm = new JsScript();

      const makeObjectAPI = (targetId: string, fallbackObj?: MapObject): import('@/lib/world/jsRuntime').JsObjectAPI => ({
        id: targetId,
        getPosition: () => {
          const light = lightRefs.current.get(targetId);
          if (light) return [light.position.x, light.position.y, light.position.z];
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const t = ref.body.current.translation();
            return [t.x, t.y, t.z];
          }
          if (ref?.group.current) {
            const p = ref.group.current.position;
            return [p.x, p.y, p.z];
          }
          return fallbackObj?.position ?? [0, 0, 0];
        },
        setPosition: (x, y, z) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.position.set(x, y, z); return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) ref.body.current.setTranslation({ x, y, z }, true);
          else if (ref?.group.current) ref.group.current.position.set(x, y, z);
        },
        getRotation: () => {
          const light = lightRefs.current.get(targetId);
          if (light) return [light.rotation.x, light.rotation.y, light.rotation.z];
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const q = ref.body.current.rotation();
            const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            return [e.x, e.y, e.z];
          }
          if (ref?.group.current) {
            const r = ref.group.current.rotation;
            return [r.x, r.y, r.z];
          }
          return fallbackObj?.rotation ?? [0, 0, 0];
        },
        setRotation: (rx, ry, rz) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.rotation.set(rx, ry, rz); return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.body.current) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
            ref.body.current.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          } else if (ref?.group.current) {
            ref.group.current.rotation.set(rx, ry, rz);
          }
        },
        applyImpulse: (x, y, z) => {
          const ref = scriptBodyRefs.current.get(targetId);
          ref?.body.current?.applyImpulse({ x, y, z }, true);
        },
        setVisible: (b) => {
          const light = lightRefs.current.get(targetId);
          if (light) { light.visible = b; return; }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.group.current) ref.group.current.visible = b;
        },
        setColor: (hex) => {
          const light = lightRefs.current.get(targetId);
          if (light) {
            try { light.color.set(hex); } catch {}
            return;
          }
          const ref = scriptBodyRefs.current.get(targetId);
          if (ref?.group.current) {
            ref.group.current.traverse((child) => {
              const m = child as THREE.Mesh;
              if (m.isMesh && m.material) {
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat.color) { try { mat.color.set(hex); } catch {} }
              }
            });
          }
        },
        setIntensity: (v) => {
          const light = lightRefs.current.get(targetId);
          if (light) light.intensity = Number(v);
        },
        destroy: () => {
          if (targetId.startsWith('rt_')) destroyObject(targetId);
        },
      });

      const objectAPI = makeObjectAPI(obj.id, obj);

      const worldAPI: import('@/lib/world/jsRuntime').JsWorldAPI = {
        getTime: () => worldElapsed.current,
        getPlayers: () => { const p = simPlayerPoseRef.current; return player ? [{ id: 'player', username: '나', x: p.x, y: p.y, z: p.z }] : []; },
        findObject: (nameOrId) => {
          const target = [...objects, ...runtimeObjectsRef.current].find(o => o.id === nameOrId || o.label === nameOrId);
          if (!target) return null;
          return makeObjectAPI(target.id, target);
        },
        spawn: (opts) => {
          const id = spawnObject(opts);
          const fallback: MapObject = {
            id,
            kind:     opts.kind     ?? 'cube',
            position: opts.position ?? [0, 5, 0],
            rotation: opts.rotation ?? [0, 0, 0],
            scale:    opts.scale    ?? [1, 1, 1],
            color:    opts.color    ?? '#ffffff',
            physics:  opts.physics  ?? 'dynamic',
          };
          return makeObjectAPI(id, fallback);
        },
        spawnTerrain: (params) => spawnTerrain(params),
        carve: (id, opts) => carveObject(id, opts),
        dig: (id, opts) => digVoxel(id, { ...opts, dig: true }),
        build: (id, opts) => digVoxel(id, { ...opts, dig: false }),
        // 스튜디오 시뮬은 단일 클라 — 본인 = 항상 호스트
        isHost: () => true,
        runtimeCount: () => runtimeObjectsRef.current.length,
        teleportLocal: (x, y, z) => playerCtlRef.current?.teleport(x, y, z),
        setSpawn: (x, y, z) => { spawnRef.current = [x, y, z]; },
        respawnLocal: () => { const [x, y, z] = spawnRef.current; playerCtlRef.current?.teleport(x, y + 1, z); },
        setPlayerSpeed: (m) => playerCtlRef.current?.setSpeed(m),
        setPlayerJump: (p) => playerCtlRef.current?.setJump(p),
        playEmoteLocal: (slot, durationSec) => playerCtlRef.current?.setEmote(slot, durationSec),
        isPlayerId: (id) => id === '__sim_player__' || id === 'player',
        controlPlayer: (_id, cmd) => applyPlayerCmd(cmd),   // 시뮬은 단일 플레이어 — 항상 로컬
        getMyPlayer: () => { const p = simPlayerPoseRef.current; return player ? { id: 'player', username: '나', x: p.x, y: p.y, z: p.z } : null; },
        isUnderwater: () => { const p = simPlayerPoseRef.current; return studioWaterDepthAt(simBuoyancyRef.current, p.x, p.y, p.z) > 0; },
        getDepth: () => { const p = simPlayerPoseRef.current; return studioWaterDepthAt(simBuoyancyRef.current, p.x, p.y, p.z); },
        setManualControl: (on) => playerCtlRef.current?.setManualControl(on),
        setVelocity: (x, y, z) => playerCtlRef.current?.setVelocity(x, y, z),
        getVelocity: () => playerCtlRef.current?.getVelocity() ?? { x: 0, y: 0, z: 0 },
        setGravityEnabled: (on) => playerCtlRef.current?.setGravityEnabled(on),
        isGrounded: () => playerCtlRef.current?.isGrounded() ?? false,
        getCameraDir: () => playerCtlRef.current?.getCameraDir() ?? { x: 0, y: 0, z: -1 },
      getCameraPos: () => playerCtlRef.current?.getCameraPos() ?? { x: 0, y: 0, z: 0 },
        raycast: (ox, oy, oz, dx, dy, dz, maxDist) => playerCtlRef.current?.raycast(ox, oy, oz, dx, dy, dz, maxDist) ?? { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, id: null },
      };

      // 스튜디오엔 네트워크 없음 — no-op
      const netAPI: import('@/lib/world/jsRuntime').JsNetAPI = {
        sendAll: () => {},
        sendTo: () => {},
      };

      luaScripts.current.set(obj.id, vm);
      vm.init(obj.script!, objectAPI, worldAPI, netAPI, undefined, obj.scriptVars, gameApi);
      vm.callStart(); // 스튜디오는 단일 클라 — 즉시 시작
    }

    /* ── user 컴포넌트 VM 생성/정리 — 모든 오브젝트의 user: 인스턴스 처리 ── */
    for (const arr of componentScripts.current.values()) {
      for (const { vm } of arr) vm.destroy();
    }
    componentScripts.current.clear();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JsScript: JsScript2 } = require('@/lib/world/jsRuntime') as typeof import('@/lib/world/jsRuntime');

    // makeObjectAPI / worldAPI 재사용을 위해 헬퍼 inline. 라이트 / RigidBody / Group 모두 처리.
    const makeAPIForObj = (obj: MapObject) => {
      const objAPI: import('@/lib/world/jsRuntime').JsObjectAPI = {
        id: obj.id,
        getPosition: () => {
          const light = lightRefs.current.get(obj.id);
          if (light) return [light.position.x, light.position.y, light.position.z];
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.body.current) {
            const t = ref.body.current.translation();
            return [t.x, t.y, t.z];
          }
          if (ref?.group.current) {
            const p = ref.group.current.position;
            return [p.x, p.y, p.z];
          }
          return obj.position;
        },
        setPosition: (x, y, z) => {
          const light = lightRefs.current.get(obj.id);
          if (light) { light.position.set(x, y, z); return; }
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.body.current) ref.body.current.setTranslation({ x, y, z }, true);
          else if (ref?.group.current) ref.group.current.position.set(x, y, z);
        },
        getRotation: () => {
          const light = lightRefs.current.get(obj.id);
          if (light) return [light.rotation.x, light.rotation.y, light.rotation.z];
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.body.current) {
            const q = ref.body.current.rotation();
            const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            return [e.x, e.y, e.z];
          }
          if (ref?.group.current) {
            const r = ref.group.current.rotation;
            return [r.x, r.y, r.z];
          }
          return obj.rotation;
        },
        setRotation: (rx, ry, rz) => {
          const light = lightRefs.current.get(obj.id);
          if (light) { light.rotation.set(rx, ry, rz); return; }
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.body.current) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
            ref.body.current.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          } else if (ref?.group.current) {
            ref.group.current.rotation.set(rx, ry, rz);
          }
        },
        applyImpulse: (x, y, z) => {
          const ref = scriptBodyRefs.current.get(obj.id);
          ref?.body.current?.applyImpulse({ x, y, z }, true);
        },
        setVisible: (b) => {
          const light = lightRefs.current.get(obj.id);
          if (light) { light.visible = b; return; }
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.group.current) ref.group.current.visible = b;
        },
        setColor: (hex) => {
          const light = lightRefs.current.get(obj.id);
          if (light) { try { light.color.set(hex); } catch {} return; }
          const ref = scriptBodyRefs.current.get(obj.id);
          if (ref?.group.current) {
            ref.group.current.traverse((child) => {
              const m = child as THREE.Mesh;
              if (m.isMesh && m.material) {
                const mat = m.material as THREE.MeshStandardMaterial;
                if (mat.color) { try { mat.color.set(hex); } catch {} }
              }
            });
          }
        },
        setIntensity: (v) => {
          const light = lightRefs.current.get(obj.id);
          if (light) light.intensity = Number(v);
        },
        destroy: () => { if (obj.id.startsWith('rt_')) destroyObject(obj.id); },
      };
      return objAPI;
    };

    const worldAPI2: import('@/lib/world/jsRuntime').JsWorldAPI = {
      getTime: () => worldElapsed.current,
      getPlayers: () => { const p = simPlayerPoseRef.current; return player ? [{ id: 'player', username: '나', x: p.x, y: p.y, z: p.z }] : []; },
      // 메인 스크립트와 동일하게 id/label 로 오브젝트 찾기 — 오브젝트 참조 변수(드롭한 target) 해석에 필요.
      // (이게 () => null 이라 시뮬에선 target 이 항상 null 이라 동작 안 하던 버그)
      findObject: (nameOrId) => {
        const target = [...objects, ...runtimeObjectsRef.current].find(o => o.id === nameOrId || o.label === nameOrId);
        return target ? makeAPIForObj(target) : null;
      },
      spawn: (opts) => {
        const id = spawnObject(opts);
        return makeAPIForObj({ ...opts, id } as MapObject);
      },
      spawnTerrain: (params) => spawnTerrain(params),
        carve: (id, opts) => carveObject(id, opts),
        dig: (id, opts) => digVoxel(id, { ...opts, dig: true }),
        build: (id, opts) => digVoxel(id, { ...opts, dig: false }),
      isHost: () => true,
      runtimeCount: () => runtimeObjectsRef.current.length,
      teleportLocal: (x, y, z) => playerCtlRef.current?.teleport(x, y, z),
      setSpawn: (x, y, z) => { spawnRef.current = [x, y, z]; },
      respawnLocal: () => { const [x, y, z] = spawnRef.current; playerCtlRef.current?.teleport(x, y + 1, z); },
      setPlayerSpeed: (m) => playerCtlRef.current?.setSpeed(m),
      setPlayerJump: (p) => playerCtlRef.current?.setJump(p),
      isPlayerId: (id) => id === '__sim_player__' || id === 'player',
      controlPlayer: (_id, cmd) => applyPlayerCmd(cmd),   // 시뮬은 단일 플레이어 — 항상 로컬
      getMyPlayer: () => { const p = simPlayerPoseRef.current; return player ? { id: 'player', username: '나', x: p.x, y: p.y, z: p.z } : null; },
      isUnderwater: () => { const p = simPlayerPoseRef.current; return studioWaterDepthAt(simBuoyancyRef.current, p.x, p.y, p.z) > 0; },
      getDepth: () => { const p = simPlayerPoseRef.current; return studioWaterDepthAt(simBuoyancyRef.current, p.x, p.y, p.z); },
      setManualControl: (on) => playerCtlRef.current?.setManualControl(on),
      setVelocity: (x, y, z) => playerCtlRef.current?.setVelocity(x, y, z),
      getVelocity: () => playerCtlRef.current?.getVelocity() ?? { x: 0, y: 0, z: 0 },
      setGravityEnabled: (on) => playerCtlRef.current?.setGravityEnabled(on),
      isGrounded: () => playerCtlRef.current?.isGrounded() ?? false,
      getCameraDir: () => playerCtlRef.current?.getCameraDir() ?? { x: 0, y: 0, z: -1 },
      getCameraPos: () => playerCtlRef.current?.getCameraPos() ?? { x: 0, y: 0, z: 0 },
      raycast: (ox, oy, oz, dx, dy, dz, maxDist) => playerCtlRef.current?.raycast(ox, oy, oz, dx, dy, dz, maxDist) ?? { hit: false, distance: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, id: null },
      getMoveInput: () => playerCtlRef.current?.getMoveInput() ?? { forward: false, backward: false, left: false, right: false, jump: false, sprint: false, mouseDown: false },
      getKeys: () => playerCtlRef.current?.getKeys() ?? [],
      setJumpEnabled: (on) => playerCtlRef.current?.setJumpEnabled(on),
      setRunEnabled: (on) => playerCtlRef.current?.setRunEnabled(on),
      setHandTarget: (side, x, y, z, nx, ny, nz) => playerCtlRef.current?.setHandTarget(side, x, y, z, nx, ny, nz),
      setBodyTilt: (pitch, roll) => playerCtlRef.current?.setBodyTilt(pitch, roll),
    };
    const netAPI2: import('@/lib/world/jsRuntime').JsNetAPI = { sendAll: () => {}, sendTo: () => {} };

    // 누락된 id 수집 (캐시에 없는 거)
    const missingIds = new Set<string>();
    for (const obj of objects) {
      if (obj.hidden) continue;
      for (const c of obj.components ?? []) {
        if (c.type.startsWith('user:')) {
          const id = c.type.slice(5);
          if (!scriptComponentDefsRef.current.has(id)) missingIds.add(id);
        }
      }
    }
    // 누락된 거 있으면 by-ids fetch 로 보충 → 다시 트리거
    if (missingIds.size > 0) {
      const tok = session.getToken();
      console.warn('[SimScene] 캐시 missing — by-ids fetch:', [...missingIds],
        '\n   현재 캐시 ids:', [...scriptComponentDefsRef.current.keys()]);
      api.getScriptComponentsByIds(tok || undefined, [...missingIds])
        .then(r => {
          if (r.components.length === 0) {
            console.error('[SimScene] 서버에서도 해당 id 못 찾음 — 컴포넌트가 삭제됐거나 권한 없음:',
              [...missingIds]);
          } else {
            for (const c of r.components) scriptComponentDefsRef.current.set(c.id, c);
            setScriptCompsLoaded(n => n + 1);  // 다시 effect 트리거
          }
        })
        .catch(e => console.error('[SimScene] by-ids fetch fail', e));
    }

    for (const obj of objects) {
      if (obj.hidden) continue;
      const userComps = (obj.components ?? []).filter(c => c.type.startsWith('user:'));
      if (userComps.length === 0) continue;
      const objAPI = makeAPIForObj(obj);
      const vms: Array<{ vm: import('@/lib/world/jsRuntime').JsScript }> = [];
      for (const inst of userComps) {
        const compId = inst.type.slice(5);
        const def = scriptComponentDefsRef.current.get(compId);
        if (!def) {
          // 이미 위에서 missingIds 에 들어가 fetch 트리거됨 — 다음 re-run 에서 처리
          continue;
        }
        const vm2 = new JsScript2();
        // props 를 props 글로벌 + 변수 오버라이드 둘 다로 전달 → 코드에서 props.speed 또는 let speed 둘 다 동작
        vm2.init(def.code, objAPI, worldAPI2, netAPI2, inst.props ?? {}, inst.props ?? {}, gameApi);
        vm2.callStart();
        vms.push({ vm: vm2 });
      }
      if (vms.length > 0) componentScripts.current.set(obj.id, vms);
    }

    return () => {
      for (const vm of luaScripts.current.values()) vm.destroy();
      luaScripts.current.clear();
      for (const arr of componentScripts.current.values()) {
        for (const { vm } of arr) vm.destroy();
      }
      componentScripts.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptsKey, scriptCompsLoaded]);

  // 콜라이더 충돌/트리거 이벤트 → 해당 오브젝트의 메인 스크립트 + user 컴포넌트 스크립트로 디스패치
  // 또 게임 컴포넌트 (pickup, damage) 자동 hookup — WorldCanvas 와 동일 패턴.
  const dispatchColliderEvent = useCallback((objId: string, otherId: string, kind: ColliderEventKind) => {
    const fire = (vm: import('@/lib/world/jsRuntime').JsScript) => {
      if (kind === 'triggerEnter') vm.callTriggerEnter(otherId);
      else if (kind === 'triggerExit') vm.callTriggerExit(otherId);
      else if (kind === 'collisionEnter') vm.callCollisionEnter(otherId);
      else vm.callCollisionExit(otherId);
    };
    const main = luaScripts.current.get(objId); if (main) fire(main);
    componentScripts.current.get(objId)?.forEach(({ vm }) => fire(vm));

    // ── Pickup 자동 hookup (touch 모드 + triggerEnter) ──
    if (kind === 'triggerEnter') {
      const cur = allObjects.find(o => o.id === objId);
      const pickupComp = cur?.components?.find(c => c.type === 'pickup');
      if (pickupComp && pickupComp.props?.mode === 'touch') {
        // 시뮬에선 solo 라 그냥 onClick 동작 호환 — game state 로 처리하게 사용자가 onPickup 스크립트
        if (pickupComp.props?.oneShot !== false && objId.startsWith('obj_')) {
          // 시뮬 런타임 오브젝트만 자동 제거 (저장된 오브젝트 보호)
          setRuntimeObjects(prev => prev.filter(o => o.id !== objId));
        }
      }
    }

    // ── Damage 자동 hookup (contact/trigger) ──
    if (kind === 'collisionEnter' || kind === 'triggerEnter') {
      const cur = allObjects.find(o => o.id === objId);
      const damageComp = cur?.components?.find(c => c.type === 'damage');
      if (damageComp) {
        const mode = String(damageComp.props?.mode ?? 'contact');
        const matchMode = (mode === 'contact' && kind === 'collisionEnter')
                       || (mode === 'trigger' && kind === 'triggerEnter');
        if (matchMode) {
          const target = allObjects.find(o => o.id === otherId);
          const targetHealth = target?.components?.find(c => c.type === 'health');
          if (targetHealth) {
            const myTeam = String(damageComp.props?.team ?? '');
            const otherTeam = String(targetHealth.props?.team ?? '');
            if (!myTeam || !otherTeam || myTeam !== otherTeam) {
              const amount = Number(damageComp.props?.amount ?? 10);
              const mx = Number(targetHealth.props?.maxHp ?? 100);
              if (!healthStoreRef.current.has(otherId)) {
                const start = Number(targetHealth.props?.startHp ?? -1);
                healthStoreRef.current.set(otherId, start < 0 ? mx : start);
              }
              const invuln = Number(targetHealth.props?.invulnTime ?? 0.3);
              const now = worldElapsed.current;
              const last = healthInvulnRef.current.get(otherId) ?? -Infinity;
              if (now - last >= invuln) {
                healthInvulnRef.current.set(otherId, now);
                const cur2 = healthStoreRef.current.get(otherId) ?? mx;
                const next = Math.max(0, cur2 - amount);
                healthStoreRef.current.set(otherId, next);
                if (next <= 0) {
                  // 사망: onDeathScript 실행 + 자동 제거
                  try {
                    const ds = String(targetHealth.props?.onDeathScript || '').trim();
                    if (ds) new Function('attackerId', ds)(objId);
                  } catch (e) { console.warn('[health-sim] onDeath error', e); }
                  if (targetHealth.props?.destroyOnDeath !== false && otherId.startsWith('obj_')) {
                    setRuntimeObjects(prev => prev.filter(o => o.id !== otherId));
                  }
                }
                if (damageComp.props?.destroyOnHit && objId.startsWith('obj_')) {
                  setRuntimeObjects(prev => prev.filter(o => o.id !== objId));
                }
              }
            }
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allObjects]);

  return (
    <>
      <AmbientSoundsPlayer zones={simAmbientZones} />
      {simDayNightInst && <DayNightCycle inst={simDayNightInst} />}
      {player && simSeats.length > 0 && (
        <SeatController seats={simSeats} localPoseRef={simPlayerPoseRef} playerCtlRef={playerCtlRef} />
      )}
      <SimScriptLoop luaScripts={luaScripts} componentScripts={componentScripts} worldElapsed={worldElapsed}
        allObjectsRef={allObjectsRef} scriptBodyRefs={scriptBodyRefs} lightRefs={lightRefs} />
      {allObjects.map(obj => (
        <SimObject key={obj.id} obj={obj} transforms={transforms}
          myAssets={myAssets} scriptBodyRefs={scriptBodyRefs} lightRefs={lightRefs}
          onColliderEvent={dispatchColliderEvent} buoyancyRef={simBuoyancyRef} />
      ))}
      {/* 파티클 레이어 — 빈 오브젝트 포함 모든 kind. 물리 바디 밖에 두어 충돌에 영향 X */}
      {allObjects.filter(o => o.components?.some(c => c.type === 'particle')).map(obj => {
        const inst = obj.components!.find(c => c.type === 'particle')!;
        const tr = transforms[obj.id] ?? { pos: obj.position, rot: obj.rotation, scl: obj.scale };
        return (
          <group key={'pfx-' + obj.id} position={tr.pos} rotation={tr.rot} scale={tr.scl ?? obj.scale}>
            <Particles s={deriveParticleSettings(inst)} objId={obj.id} burstRef={clickBurstRef} />
          </group>
        );
      })}
      {/* 표지판 레이어 — sign 컴포넌트 위치에 worldspace text */}
      {allObjects.filter(o => o.components?.some(c => c.type === 'sign')).map(obj => {
        const inst = obj.components!.find(c => c.type === 'sign')!;
        const tr = transforms[obj.id] ?? { pos: obj.position, rot: obj.rotation, scl: obj.scale };
        return (
          <group key={'sign-' + obj.id} position={tr.pos} rotation={tr.rot} scale={tr.scl ?? obj.scale}>
            <SignText inst={inst} />
          </group>
        );
      })}
      {/* 시뮬레이션 플레이어 — 월드와 동일한 Player 컴포넌트 재사용. grab 은 sim 의 scriptBodyRefs/스크립트와 연동 */}
      {player && (
        <SimCameraNear near={!player.freeCam && player.cameraMode === 'first' ? 0.45 : 0.1} />
      )}
      {player && (
        <Player
          character={player.character}
          onMove={() => {}}
          localPoseRef={simPlayerPoseRef}
          buoyancyRef={simBuoyancyRef}
          inputLocked={player.freeCam}
          cameraControlEnabled={!player.freeCam}
          hideHeadOverride={false}
          jumpPower={player.jumpPower}
          cameraMode={player.cameraMode}
          onToggleCameraMode={player.onToggleCameraMode}
          onGrabUiChange={player.onGrabUiChange}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scriptBodyRefs={scriptBodyRefs as any}
          luaScripts={luaScripts}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          componentScripts={componentScripts as any}
          ownersRef={player.ownersRef}
          playerId="__sim_player__"
          onObjectClick={triggerClickBurst}
          grabbedStateRef={player.grabbedStateRef}
          grabbableIdsRef={player.grabbableIdsRef}
          remoteGrabbedByRef={player.remoteGrabbedByRef}
          spawnPos={player.spawnPos}
          spawnRotY={player.spawnRotY}
          playerCtlRef={playerCtlRef}
          spawnRef={spawnRef}
        />
      )}
      {/* 게임 컴포넌트 런타임 (시뮬용) — NPC AI 추적/공격, Damage AOE 주기. WorldCanvas 와 동일 로직. */}
      <SimGameComponentTick allObjects={allObjects} scriptBodyRefs={scriptBodyRefs}
        npcAttackRef={npcAttackRef} npcPatrolRef={npcPatrolRef}
        damageAoeRef={damageAoeRef} healthStoreRef={healthStoreRef} healthInvulnRef={healthInvulnRef} />
      {/* Flashlight — 부착된 오브젝트의 spotlight + 1인칭 카메라 follow */}
      {allObjects.filter(o => !o.hidden && o.components?.some(c => c.type === 'flashlight')).map(o => {
        const comp = o.components!.find(c => c.type === 'flashlight')!;
        const bodyRef = scriptBodyRefs.current.get(o.id);
        const gRef = (bodyRef?.group ?? { current: null }) as React.MutableRefObject<THREE.Group | null>;
        return <FlashlightLight key={'fl-' + o.id} comp={comp} groupRef={gRef}
          objId={o.id} playerId="__sim_player__"
          grabbedStateRef={player?.grabbedStateRef ?? (emptyMapRef as React.MutableRefObject<Map<string, string>>)} />;
      })}
      {/* Sound — 위치 기반 3D 사운드 */}
      {allObjects.filter(o => !o.hidden && o.kind === 'sound' && o.soundUrl).map(o => {
        const tr = transforms[o.id] ?? { pos: o.position };
        return <SoundEmitter key={'snd-' + o.id} url={o.soundUrl!}
          position={tr.pos} volume={o.soundVolume ?? 0.8}
          loop={o.soundLoop !== false} autoplay={o.soundAutoplay !== false}
          radius={o.soundRadius ?? 10} />;
      })}
    </>
  );
}

// FlashlightLight 에 전달할 빈 grabbedStateRef (player 없는 시뮬 안전망)
const emptyMapRef = { current: new Map<string, string>() };

/* ── SimScene 안 NPC AI + Damage AOE tick — WorldCanvas 동일 로직. useFrame 10Hz throttle. ── */
function SimGameComponentTick({ allObjects, scriptBodyRefs, npcAttackRef, npcPatrolRef, damageAoeRef, healthStoreRef, healthInvulnRef }: {
  allObjects: MapObject[];
  scriptBodyRefs: React.MutableRefObject<Map<string, SimBodyRefs>>;
  npcAttackRef: React.MutableRefObject<Map<string, number>>;
  npcPatrolRef: React.MutableRefObject<Map<string, { tx: number; tz: number; nextAt: number; homeX: number; homeZ: number }>>;
  damageAoeRef: React.MutableRefObject<Map<string, number>>;
  healthStoreRef: React.MutableRefObject<Map<string, number>>;
  healthInvulnRef: React.MutableRefObject<Map<string, number>>;
}) {
  const lastTick = useRef(0);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - lastTick.current < 0.1) return;   // 100ms throttle
    lastTick.current = now;
    // 카메라 위치를 "플레이어" 로 사용 (시뮬은 solo)
    const cam = state.camera;
    const playerPos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    // ── Damage AOE ──
    const aoes = allObjects.filter(o => o.components?.some(c => c.type === 'damage' && c.props?.mode === 'aoe'));
    for (const src of aoes) {
      const dmg = src.components!.find(c => c.type === 'damage' && c.props?.mode === 'aoe')!;
      const interval = Number(dmg.props?.aoeInterval ?? 1);
      const last = damageAoeRef.current.get(src.id) ?? -interval;
      if (now - last < interval) continue;
      damageAoeRef.current.set(src.id, now);
      const srcGroup = scriptBodyRefs.current.get(src.id)?.group?.current;
      if (!srcGroup) continue;
      const sp = srcGroup.position;
      const radius = Number(dmg.props?.aoeRadius ?? 3);
      const r2 = radius * radius;
      const amount = Number(dmg.props?.amount ?? 10);
      const srcTeam = String(dmg.props?.team ?? '');
      for (const tgt of allObjects) {
        if (tgt.id === src.id) continue;
        const th = tgt.components?.find(c => c.type === 'health');
        if (!th) continue;
        const tt = String(th.props?.team ?? '');
        if (srcTeam && tt && srcTeam === tt) continue;
        const tg = scriptBodyRefs.current.get(tgt.id)?.group?.current;
        if (!tg) continue;
        const dx = tg.position.x - sp.x, dy = tg.position.y - sp.y, dz = tg.position.z - sp.z;
        if (dx*dx + dy*dy + dz*dz <= r2) {
          // HP 감소 (간단 — invuln 무시, sim 단순화)
          const mx = Number(th.props?.maxHp ?? 100);
          if (!healthStoreRef.current.has(tgt.id)) healthStoreRef.current.set(tgt.id, mx);
          const cur = healthStoreRef.current.get(tgt.id)!;
          healthStoreRef.current.set(tgt.id, Math.max(0, cur - amount));
        }
      }
    }

    // ── NPC AI 추적/공격 ──
    const npcs = allObjects.filter(o => o.components?.some(c => c.type === 'npc'));
    for (const obj of npcs) {
      const npc = obj.components!.find(c => c.type === 'npc')!;
      const mode = String(npc.props?.mode ?? 'both');
      if (mode === 'idle') continue;
      const aggro = Number(npc.props?.aggroRange ?? 15);
      const attackRange = Number(npc.props?.attackRange ?? 1.5);
      const cd = Number(npc.props?.attackCooldown ?? 1.5);
      const moveSpeed = Number(npc.props?.moveSpeed ?? 3);
      const bodyRef = scriptBodyRefs.current.get(obj.id);
      const group = bodyRef?.group?.current;
      const body = bodyRef?.body?.current;
      if (!group) continue;
      const pos = group.position;
      const dx0 = playerPos.x - pos.x, dz0 = playerPos.z - pos.z;
      const dist = Math.hypot(dx0, dz0);
      if (dist > aggro) {
        // patrol
        if (mode === 'patrol' || mode === 'both') {
          const patrolRadius = Number(npc.props?.patrolRadius ?? 8);
          let p = npcPatrolRef.current.get(obj.id);
          if (!p) {
            p = { tx: pos.x, tz: pos.z, nextAt: 0, homeX: pos.x, homeZ: pos.z };
            npcPatrolRef.current.set(obj.id, p);
          }
          if (now >= p.nextAt || Math.hypot(p.tx - pos.x, p.tz - pos.z) < 0.5) {
            const r = Math.sqrt(Math.random()) * patrolRadius;
            const a = Math.random() * Math.PI * 2;
            p.tx = p.homeX + Math.cos(a) * r;
            p.tz = p.homeZ + Math.sin(a) * r;
            p.nextAt = now + 3 + Math.random() * 4;
          }
          const dx = p.tx - pos.x, dz = p.tz - pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.05) {
            const stepX = (dx / d) * (moveSpeed * 0.5) * 0.1;
            const stepZ = (dz / d) * (moveSpeed * 0.5) * 0.1;
            if (body) {
              const cur = body.translation();
              body.setTranslation({ x: cur.x + stepX, y: cur.y, z: cur.z + stepZ }, true);
              const ang = Math.atan2(dx, dz);
              const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0));
              body.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
            } else {
              group.position.x += stepX; group.position.z += stepZ;
              group.rotation.y = Math.atan2(dx, dz);
            }
          }
        }
        continue;
      }
      // 추적
      if (dist > attackRange) {
        const stepX = (dx0 / dist) * moveSpeed * 0.1;
        const stepZ = (dz0 / dist) * moveSpeed * 0.1;
        if (body) {
          const cur = body.translation();
          body.setTranslation({ x: cur.x + stepX, y: cur.y, z: cur.z + stepZ }, true);
          const ang = Math.atan2(dx0, dz0);
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0));
          body.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        } else {
          group.position.x += stepX; group.position.z += stepZ;
          group.rotation.y = Math.atan2(dx0, dz0);
        }
      } else {
        // 공격 사거리 — cooldown
        const last = npcAttackRef.current.get(obj.id) ?? 0;
        if (now - last < cd) continue;
        npcAttackRef.current.set(obj.id, now);
        // 시뮬은 solo — 콘솔 로그만 (사용자 게임 스크립트는 game.add('hp', -n) 으로 처리 가능)
        devLog('[sim-npc] attack', obj.id, 'amount', npc.props?.amount ?? 10);
      }
    }
    void healthInvulnRef;   // 시뮬 단순화 — invuln 안 씀
  });
  return null;
}

/* ── 변환 컨트롤 ──────────────────────────── */
/* ── BoxResizeGizmo — 유니티 식 6면 박스 리사이즈. 면 잡고 끌면 그 방향으로만 늘어남(반대편 고정).
   scale 모드 대체용. mesh 의 world bounding 기반으로 6면 핸들(작은 큐브) 띄움.
   드래그: pointerdown 시 anchor (반대편 face world position) 기록 → window pointermove 로 mouse ray 와
   axis line 의 최근접점 계산 → 새 face position → mesh scale + position 동시 갱신. */
function BoxResizeGizmo({ target, onChange, onDragStart, onDragEnd }: {
  target: THREE.Object3D | null;
  /** world TRS 콜백. BoxResizeWrap 이 worldTRSToLocal 로 변환 후 저장. */
  onChange: (worldP: [number,number,number], worldR: [number,number,number], worldS: [number,number,number]) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dragRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  const handleRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null, null, null]);
  // 매 프레임 imperative 로 group + 핸들 위치 갱신 — mesh 의 실제 visual bbox 기준 (pivot 이 어디든
  // bbox 중심에 group, 6면에 핸들). bbox 는 world-axis-aligned 이라 group quaternion identity.
  useFrame(() => {
    if (!target || !groupRef.current) return;
    target.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(target);
    if (bbox.isEmpty()) return;
    const bc = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    groupRef.current.position.copy(bc);
    groupRef.current.quaternion.identity();
    handleRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const ax = i < 2 ? 0 : i < 4 ? 1 : 2;
      const sgn = (i % 2 === 0) ? 1 : -1;
      mesh.position.set(
        ax === 0 ? sgn * size.x * 0.5 : 0,
        ax === 1 ? sgn * size.y * 0.5 : 0,
        ax === 2 ? sgn * size.z * 0.5 : 0,
      );
    });
  });

  // window pointermove/up listener — target null 시도 dragRef.current null 이라 안전.
  // (hook 순서 보장 위해 early return 위에 둠 — React Hooks rule)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = gl.domElement.getBoundingClientRect();
      if (d.mode === 'uniform') {
        const dx = e.clientX - rect.left - d.centerPx.x;
        const dy = e.clientY - rect.top - d.centerPx.y;
        const curDist = Math.hypot(dx, dy);
        const ratio = curDist / d.startDist;
        const newWorldScale: [number,number,number] = [
          Math.max(0.01, d.startWorldScale[0] * ratio),
          Math.max(0.01, d.startWorldScale[1] * ratio),
          Math.max(0.01, d.startWorldScale[2] * ratio),
        ];
        // 균등 scale 은 중심 그대로 (anchor 보정 불필요).
        onChange(d.startWorldPos, d.startWorldRot, newWorldScale);
        return;
      }
      const ndc = new THREE.Vector2();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const curT = closestPointOnLineToRay(d.axisCenterWorld, d.axisWorld, raycaster.ray);
      const delta = curT - d.startT;
      // delta 는 world 단위. scale 증분 = delta / baseHalfSize / 2 (mesh 의 1 unit scale 당 world half size 만큼 늘어남).
      const baseDiameter = d.baseHalfSize[d.axis] * 2;
      const scaleDelta = baseDiameter > 0 ? delta / baseDiameter : delta;
      const newScaleAxis = Math.max(0.01, d.startWorldScale[d.axis] + scaleDelta * d.sign);
      const newWorldScale: [number,number,number] = [d.startWorldScale[0], d.startWorldScale[1], d.startWorldScale[2]];
      newWorldScale[d.axis] = newScaleAxis;
      // bbox 새 half size = baseHalfSize * newWorldScale.
      const newHalfSizeAxis = d.baseHalfSize[d.axis] * newScaleAxis;
      // 새 bbox center = anchor + axisWorld * sign * newHalfSize. mesh transform pos = bcCenter + pivotOffset.
      const newBcWorld = d.anchorWorld.clone().add(d.axisWorld.clone().multiplyScalar(d.sign * newHalfSizeAxis));
      const newMeshPos = newBcWorld.clone().add(d.pivotOffsetWorld);
      onChange([newMeshPos.x, newMeshPos.y, newMeshPos.z], d.startWorldRot, newWorldScale);
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        boxResizeActive.current = false;
        onDragEnd?.();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, onChange, onDragEnd]);

  if (!target) return null;
  // 초기 bbox 기반 위치 (첫 렌더용 — 이후 매 프레임 useFrame 이 갱신)
  target.updateWorldMatrix(true, false);
  const initBbox = new THREE.Box3().setFromObject(target);
  const wp = initBbox.isEmpty() ? new THREE.Vector3() : initBbox.getCenter(new THREE.Vector3());
  const initSize = initBbox.isEmpty() ? new THREE.Vector3(1, 1, 1) : initBbox.getSize(new THREE.Vector3());
  // ws 는 face 위치 계산용 (size/2 의 형태로 ws.getComponent 사용)
  const ws = initSize;
  const wq = new THREE.Quaternion();   // bbox 는 axis-aligned 이라 identity

  // 6면 face 정의 — axis index (0=x, 1=y, 2=z), sign (+1/-1)
  const faces: Array<{ axis: 0|1|2; sign: 1|-1; color: string }> = [
    { axis: 0, sign: +1, color: '#ef4444' },
    { axis: 0, sign: -1, color: '#ef4444' },
    { axis: 1, sign: +1, color: '#10b981' },
    { axis: 1, sign: -1, color: '#10b981' },
    { axis: 2, sign: +1, color: '#3b82f6' },
    { axis: 2, sign: -1, color: '#3b82f6' },
  ];

  const handleSize = 0.15;

  const onPointerDown = (e: ThreeEvent<PointerEvent>, axis: 0|1|2, sign: 1|-1) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    e.nativeEvent.stopImmediatePropagation?.();
    e.nativeEvent.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    target.updateWorldMatrix(true, false);
    const ws0 = new THREE.Vector3(); target.getWorldScale(ws0);
    const wp0 = new THREE.Vector3(); target.getWorldPosition(wp0);
    const wq0 = new THREE.Quaternion(); target.getWorldQuaternion(wq0);
    const wr0 = new THREE.Euler().setFromQuaternion(wq0);
    const axisLocal = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
    const axisWorld = axisLocal.clone().applyQuaternion(wq0).normalize();
    const startWorldScale: [number,number,number] = [ws0.x, ws0.y, ws0.z];
    const startWorldRot: [number,number,number] = [wr0.x, wr0.y, wr0.z];
    // pivot 보정 — mesh 의 transform position(피벗)이 bbox center 와 다를 수 있음 (예: 발 기준 캐릭터).
    // bbox center 기준으로 anchor / scale 계산해야 한쪽 face 만 정확히 이동.
    const bbox = new THREE.Box3().setFromObject(target);
    const bcStart = bbox.getCenter(new THREE.Vector3());
    const sizeStart = bbox.getSize(new THREE.Vector3());
    // base half size per world-scale-unit — drag 후 newWorldScale 로 곱해 새 half size 계산.
    const baseHalfSize: [number,number,number] = [
      ws0.x !== 0 ? (sizeStart.x * 0.5) / ws0.x : 0.5,
      ws0.y !== 0 ? (sizeStart.y * 0.5) / ws0.y : 0.5,
      ws0.z !== 0 ? (sizeStart.z * 0.5) / ws0.z : 0.5,
    ];
    // mesh transform 위치(피벗) ↔ bbox center 의 world 차이 — drag 후에도 같은 offset 유지.
    const pivotOffsetWorld = wp0.clone().sub(bcStart);
    // anchor world = bbox center 의 반대편 face
    const anchorWorld = bcStart.clone().add(axisWorld.clone().multiplyScalar(-sign * baseHalfSize[axis] * ws0.getComponent(axis)));
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const startRaycaster = new THREE.Raycaster();
    startRaycaster.setFromCamera(ndc, camera);
    const startT = closestPointOnLineToRay(bcStart, axisWorld, startRaycaster.ray);
    dragRef.current = {
      mode: 'axis' as const, axis, sign, startWorldScale, startWorldRot,
      axisWorld, axisCenterWorld: bcStart.clone(), startT, anchorWorld,
      baseHalfSize, pivotOffsetWorld,
    };
    boxResizeActive.current = true;
    onDragStart?.();
  };

  // 중앙 uniform scale 핸들 — 마우스를 중심에서 멀리/가까이 끌면 3축 균등 scale.
  const onUniformPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;   // 좌클릭만
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
    e.nativeEvent.stopImmediatePropagation?.();
    e.nativeEvent.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    target.updateWorldMatrix(true, false);
    const ws0 = new THREE.Vector3(); target.getWorldScale(ws0);
    const wp0 = new THREE.Vector3(); target.getWorldPosition(wp0);
    const wq0 = new THREE.Quaternion(); target.getWorldQuaternion(wq0);
    const wr0 = new THREE.Euler().setFromQuaternion(wq0);
    const startWorldScale: [number,number,number] = [ws0.x, ws0.y, ws0.z];
    const startWorldPos: [number,number,number] = [wp0.x, wp0.y, wp0.z];
    const startWorldRot: [number,number,number] = [wr0.x, wr0.y, wr0.z];
    const centerNdc = wp0.clone().project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const centerPx = {
      x: (centerNdc.x * 0.5 + 0.5) * rect.width,
      y: (-centerNdc.y * 0.5 + 0.5) * rect.height,
    };
    const startDx = e.clientX - rect.left - centerPx.x;
    const startDy = e.clientY - rect.top - centerPx.y;
    const startDist = Math.max(10, Math.hypot(startDx, startDy));
    dragRef.current = { mode: 'uniform' as const, startWorldScale, startWorldPos, startWorldRot, centerPx, startDist };
    boxResizeActive.current = true;
    onDragStart?.();
  };

  return (
    <group ref={groupRef} position={wp} quaternion={wq}>
      {faces.map((f, i) => {
        const pos: [number,number,number] = [0, 0, 0];
        pos[f.axis] = f.sign * ws.getComponent(f.axis) * 0.5;
        return (
          <mesh key={i}
            ref={(m) => { handleRefs.current[i] = m; if (m) overrideRaycastFirst(m); }}
            position={pos}
            renderOrder={999}
            onPointerDown={(e) => onPointerDown(e, f.axis, f.sign)}>
            <boxGeometry args={[handleSize, handleSize, handleSize]} />
            <meshBasicMaterial color={f.color} depthTest={false} transparent opacity={0.9} />
          </mesh>
        );
      })}
      {/* 중앙 uniform scale 핸들 — 노란색 큐브. 마우스 중심에서 멀리/가까이 끌면 3축 균등 scale. */}
      <mesh position={[0, 0, 0]}
        ref={(m) => { if (m) overrideRaycastFirst(m); }}
        renderOrder={999}
        onPointerDown={onUniformPointerDown}>
        <boxGeometry args={[handleSize * 1.3, handleSize * 1.3, handleSize * 1.3]} />
        <meshBasicMaterial color="#fbbf24" depthTest={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// mesh 의 raycast 결과 distance 를 0 으로 강제 → R3F 가 거리순 정렬할 때 항상 첫 hit (다른 mesh 의 onPointerDown 은
// stopPropagation 으로 차단). 핸들이 mesh 표면 위에 겹쳐도 안정적으로 핸들이 우선 선택됨.
function overrideRaycastFirst(mesh: THREE.Mesh) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((mesh as any).__rayPatched) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mesh as any).__rayPatched = true;
  const orig = mesh.raycast.bind(mesh);
  mesh.raycast = (raycaster, intersects) => {
    const own: THREE.Intersection[] = [];
    orig(raycaster, own);
    for (const h of own) intersects.push({ ...h, distance: 0 });
  };
}

// Ray 와 line(point + direction) 의 closest point 의 line 상 parameter t.
function closestPointOnLineToRay(linePoint: THREE.Vector3, lineDir: THREE.Vector3, ray: THREE.Ray): number {
  const w0 = new THREE.Vector3().subVectors(linePoint, ray.origin);
  const a = lineDir.dot(lineDir);
  const b = lineDir.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = lineDir.dot(w0);
  const e = ray.direction.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-6) return 0;
  // t along line: (b*e - c*d) / denom
  return (b * e - c * d) / denom;
}

/* BoxResizeGizmo 를 targetId 로 사용 — scene 트리 traverse 해서 target 찾고 BoxResizeGizmo 에 넘김. */
function BoxResizeWrap({ targetId, toLocal, onChange, onDragStart, onDragEnd }: {
  targetId: string | null;
  toLocal: (id: string, w: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] };
  /** mode 별 single-축 갱신 (translate 는 position, scale 은 scale 만 — 비균등 부모 밑 폭발 방지 패턴). */
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }, mode: 'translate' | 'scale') => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { scene } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  useFrame(() => {
    if (!targetId) { if (target) setTarget(null); return; }
    let found: THREE.Object3D | null = null;
    scene.traverse(o => { if (o.userData?.id === targetId) found = o; });
    if (found && (found as THREE.Object3D).parent) { if (target !== found) setTarget(found); }
    else { if (target) setTarget(null); }
  });
  return (
    <BoxResizeGizmo target={target}
      onChange={(p, r, s) => {
        if (!targetId) return;
        const local = toLocal(targetId, { p, r, s });
        // scale + translate 둘 다 갱신 — updateObjectTransform 이 mode 별 single-축이라 두 번 호출.
        // anchor 고정엔 scale 만 바꾸면 mesh 중심 그대로라 양쪽 모두 늘어남 → position 도 갱신해야 한쪽만.
        onChange(targetId, local, 'scale');
        onChange(targetId, local, 'translate');
      }}
      onDragStart={onDragStart} onDragEnd={onDragEnd} />
  );
}

function SelectedTransform({ targetId, mode, onChange, toLocal, onDragEnd, onDragStart, snapTranslate, snapRotate, snapScale }: {
  targetId: string | null;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }, mode: 'translate' | 'rotate' | 'scale') => void;
  toLocal: (id: string, w: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] };
  onDragEnd: () => void;
  onDragStart?: () => void;
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
      space="local"
      translationSnap={snapTranslate ?? null}
      rotationSnap={snapRotate ?? null}
      scaleSnap={snapScale ?? null}
      onObjectChange={() => {
        const o = target;
        // 평탄 렌더라 o 의 transform 은 월드 — 부모 기준 로컬로 변환해 저장.
        // mode 를 함께 넘겨, 해당 모드 축만 갱신(비균등 스케일 부모 밑 자식 이동 시 스케일 폭발 방지).
        onChange(targetId!, toLocal(targetId!, {
          p: [o.position.x, o.position.y, o.position.z],
          r: [o.rotation.x, o.rotation.y, o.rotation.z],
          s: [o.scale.x,    o.scale.y,    o.scale.z],
        }), mode);
      }}
      onMouseDown={onDragStart}
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
function WasdFlyCamera({ orbitRef, rmbHeldRef }: { orbitRef: React.MutableRefObject<OrbitRef | null>; rmbHeldRef: React.MutableRefObject<boolean> }) {
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
    // 우클릭(RMB) 누른 동안만 카메라 비행 — 평소엔 W/E/R 이 도구 단축키로 동작 (유니티식)
    if (!rmbHeldRef.current) return;
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

/** 우클릭 드래그 = 카메라 제자리 시점 회전 (look-around) */
function RightClickLook({ orbitRef }: { orbitRef: React.MutableRefObject<OrbitRef | null> }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0, lastY = 0;

    // 캔버스 bbox 안 (시각적으로 3D 씬 위) 클릭만 카메라 회전 트리거.
    // UI 패널 (사이드바·인스펙터) 안 우클릭은 skip — 사용자의 의도가 아님.
    const isOverCanvas = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      // 캔버스 영역 안에서만 — UI overlay (UIRenderer 등) 위라도 캔버스 좌표면 OK
      if (!isOverCanvas(e.clientX, e.clientY)) return;
      // 일반 form input 위면 skip — 인스펙터 입력 컨텍스트 메뉴 보존
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onMove = (e: MouseEvent) => {
      if (!dragging || !orbitRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const sensitivity = 0.004;
      const orbit = orbitRef.current;

      // 카메라→타겟 방향벡터
      const dir = new THREE.Vector3().subVectors(orbit.target, camera.position);
      const dist = dir.length() || 5;
      dir.normalize();

      // 수평 회전 (world Y 기준 yaw)
      const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * sensitivity);
      dir.applyQuaternion(yawQ);

      // 수직 회전 (카메라 right 벡터 기준 pitch)
      const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
      if (right.lengthSq() > 0.0001) {
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(right, dy * sensitivity);
        const pitched = dir.clone().applyQuaternion(pitchQ);
        // 수직 ±85° 클램프
        if (Math.abs(pitched.y) < 0.996) dir.copy(pitched);
      }

      // 카메라 위치 고정, target만 이동 → OrbitControls가 lookAt 처리
      orbit.target.copy(camera.position).addScaledVector(dir, dist);
      orbit.update?.();
    };

    const onUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      dragging = false;
    };

    // window listener — UI overlay (UIRenderer 등) 위 우클릭도 잡힘 (위 isOverCanvas 로 영역 체크)
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // 캔버스 위에서 우클릭 contextmenu 막기 (브라우저 기본 메뉴 X — drag로 카메라 회전)
    const onCtx = (e: MouseEvent) => { if (isOverCanvas(e.clientX, e.clientY)) e.preventDefault(); };
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('contextmenu', onCtx);
    };
  }, [camera, gl, orbitRef]);

  return null;
}

/** 카메라 ref 캡처 — 뷰포트 드롭 위치 계산용 */
function CameraRefCapture({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree();
  useEffect(() => { cameraRef.current = camera; }, [camera, cameraRef]);
  return null;
}

/** 스튜디오 — 편집/시뮬 카메라가 후처리 존(영역) 박스 안에 들어가면 그 볼륨 미리보기. */
function PostFXZoneWatcher({ zones, onZone }: { zones: PostFXZone[]; onZone: (i: number) => void }) {
  const { camera } = useThree();
  const last = useRef(-1);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  useFrame(() => {
    const p = camera.position;
    const zs = zonesRef.current;
    let zi = -1;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (Math.abs(p.x - z.cx) <= z.hx && Math.abs(p.y - z.cy) <= z.hy && Math.abs(p.z - z.cz) <= z.hz) { zi = i; break; }
    }
    if (zi !== last.current) { last.current = zi; onZone(zi); }
  });
  return null;
}

/** 카메라가 보이는 물 부피(수면~바닥) 안이면 onChange(true) — underwaterOnly 후처리를 카메라 기준 트리거. */
function CameraWaterWatcher({ volsRef, onChange }: { volsRef: React.MutableRefObject<WaterPostFX[]>; onChange: (index: number) => void }) {
  const { camera } = useThree();
  const last = useRef(-1);
  useFrame((rtState) => {
    const vols = volsRef.current;
    const p = camera.position;
    const wt = rtState.clock.elapsedTime;
    let idx = -1;
    for (let i = 0; i < vols.length; i++) {
      const bv = vols[i];
      if (Math.abs(p.x - bv.cx) > bv.hx || Math.abs(p.z - bv.cz) > bv.hz) continue;
      let surf = bv.cy + bv.offset;
      if (bv.waveStrength) {
        const lx = bv.hx ? (p.x - bv.cx) / (2 * bv.hx) : 0;
        const ly = bv.hz ? -(p.z - bv.cz) / (2 * bv.hz) : 0;
        const a = 0.04 * bv.waveStrength;
        const disp = Math.sin(lx * 5 * bv.waveFreq + wt * 2 * bv.waveSpeed) * a + Math.cos(ly * 5 * bv.waveFreq + wt * 1.5 * bv.waveSpeed) * a;
        surf += Math.max(0, disp);   // 마루만 경계 상승, 골은 평균 유지 → 큰 물결에도 안 깜빡
      }
      if (p.y <= surf && p.y >= bv.cy - bv.scaleY) { idx = i; break; }
    }
    if (idx !== last.current) { last.current = idx; onChange(idx); }
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

/** R3F 캔버스 DOM 자체를 외부 ref에 노출 — 크로스헤어 위치 계산용. */
function CanvasDomCapture({ canvasDomRef }: { canvasDomRef: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const { gl } = useThree();
  useEffect(() => {
    canvasDomRef.current = gl.domElement;
    return () => { canvasDomRef.current = null; };
  }, [gl, canvasDomRef]);
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

// 모바일 바텀시트 드래그 — 그립을 끌어올리면 커지고 내리면 줄어듦 (스냅 포인트)
const SHEET_SNAPS = [40, 62, 90]; // vh
function useSheetDrag(initial = 62) {
  const [heightVh, setHeightVh] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ y: number; h: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 닫기 버튼 등은 드래그 제외
    startRef.current = { y: e.clientY, h: heightVh };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dy = startRef.current.y - e.clientY; // 위로 끌면 양수
    const h = startRef.current.h + (dy / window.innerHeight) * 100;
    setHeightVh(Math.max(22, Math.min(92, h)));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    startRef.current = null;
    setDragging(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    setHeightVh(h => SHEET_SNAPS.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)));
  };
  const gripHandlers = { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
  return { heightVh, dragging, gripHandlers };
}

/** 선택 오브젝트(또는 조상) 중 Timeline 컴포넌트를 가진 루트를 찾음. 없으면 null. */
function findTimelineRoot(selId: string | null, objects: MapObject[]): MapObject | null {
  let cur = selId ? objects.find(o => o.id === selId) ?? null : null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.components?.some(c => c.type === 'timeline')) return cur;
    cur = cur.parentId ? objects.find(o => o.id === cur!.parentId) ?? null : null;
  }
  return null;
}
/** 루트 + 모든 자손 id (BFS). */
function subtreeIds(rootId: string, objects: MapObject[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const o of objects) if (o.parentId) {
    const arr = childrenOf.get(o.parentId) ?? [];
    arr.push(o.id); childrenOf.set(o.parentId, arr);
  }
  const out = [rootId]; const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenOf.get(id) ?? []) { out.push(c); stack.push(c); }
  }
  return out;
}

/** 🎬 Timeline 패널 — Timeline 컴포넌트가 붙은 루트 + 그 자식들만 스코프해서 키프레임 애니메이션 제작/미리보기.
 *  공유 길이/반복/자동재생은 Timeline 컴포넌트가 보유, 각 오브젝트의 키는 keyframeAnim 에 저장(시뮬 재생 호환). */
function KeyframeTimelinePanel({ root, objects, selectedId, onChangeObj, onSelectObj, onPatchTimeline, onPreviewAll }: {
  root: MapObject;
  objects: MapObject[];
  selectedId: string | null;
  onChangeObj: (id: string, anim: KeyframeAnim) => void;
  onSelectObj: (id: string) => void;
  onPatchTimeline: (props: { duration?: number; loop?: boolean; autoplay?: boolean }) => void;
  onPreviewAll: (poses: Record<string, { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }> | null) => void;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(0);

  const comp = root.components?.find(c => c.type === 'timeline');
  const dur = Math.max(0.1, Number(comp?.props?.duration ?? 3));
  const loop = comp?.props?.loop !== false;
  const autoplay = comp?.props?.autoplay !== false;
  // 트랙 = 루트 + 자손 (씬 순서 유지).
  const ids = subtreeIds(root.id, objects);
  const tracks = ids.map(id => objects.find(o => o.id === id)).filter((o): o is MapObject => !!o);
  // 선택 오브젝트가 서브트리 안이면 그것, 아니면 루트.
  const selObj = (selectedId && ids.includes(selectedId) ? objects.find(o => o.id === selectedId) : null) ?? root;

  const tracksRef = useRef(tracks); tracksRef.current = tracks;
  const previewAt = (t: number) => {
    const poses: Record<string, { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }> = {};
    for (const o of tracksRef.current) {
      const a = o.keyframeAnim;
      if (!a || !a.keys.length) continue;
      const s = sampleKeyframeAnim(a, t);
      if (s) poses[o.id] = { p: s.position, r: s.rotation, s: s.scale };
    }
    onPreviewAll(Object.keys(poses).length ? poses : null);
  };

  useEffect(() => () => onPreviewAll(null), []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let t = timeRef.current;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      t += dt;
      if (t >= dur) t = t % dur;
      timeRef.current = t;
      setTime(t);
      previewAt(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);  // eslint-disable-line react-hooks/exhaustive-deps

  const scrub = (v: number) => { timeRef.current = v; setTime(v); previewAt(v); };
  const stopEdit = () => { setPlaying(false); onPreviewAll(null); };
  const addKey = () => {
    if (!selObj) return;
    // 이 오브젝트의 키프레임에 현재 위치를 키로 추가. 공유 설정(길이/반복/자동재생)을 함께 스탬프 → 시뮬에서 일관 재생.
    const a: KeyframeAnim = selObj.keyframeAnim ?? { duration: dur, loop, autoplay, keys: [] };
    const tt = Math.round(time * 100) / 100;
    const key: KeyFrame = { t: tt, position: [...selObj.position], rotation: [...selObj.rotation], scale: [...selObj.scale] };
    const keys = a.keys.filter(k => Math.abs(k.t - tt) > 0.001).concat(key);
    onChangeObj(selObj.id, normalizeKeyframeAnim({ ...a, duration: dur, loop, autoplay, keys }));
    onPreviewAll(null);
  };
  const delKey = (id: string, i: number) => {
    const o = objects.find(x => x.id === id);
    if (!o?.keyframeAnim) return;
    onChangeObj(id, normalizeKeyframeAnim({ ...o.keyframeAnim, keys: o.keyframeAnim.keys.filter((_, n) => n !== i) }));
  };

  return (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 50, background: 'rgba(20,20,28,0.96)',
      border: '1px solid #333', borderRadius: 10, padding: '10px 14px', color: '#eee', font: '12px sans-serif', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxHeight: '42vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: '#a5b4fc' }}>🎬 타임라인 — {root.label || root.kind} (자신+자식 {tracks.length})</strong>
        <button onClick={() => (playing ? stopEdit() : setPlaying(true))} style={{ padding: '3px 12px', borderRadius: 6, border: 'none', background: playing ? '#ef4444' : '#6366f1', color: '#fff', cursor: 'pointer' }}>{playing ? '⏸ 정지' : '▶ 재생'}</button>
        <button onClick={stopEdit} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer' }}>■ 편집모드</button>
        <button onClick={addKey} style={{ padding: '3px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer' }}>
          ＋ “{selObj.label || selObj.kind}” 키 추가 ({time.toFixed(2)}s)</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>길이
          <input type="number" min={0.1} step={0.1} value={dur} onChange={e => onPatchTimeline({ duration: Math.max(0.1, Number(e.target.value) || 0.1) })}
            style={{ width: 56, background: '#111', border: '1px solid #444', color: '#eee', borderRadius: 4, padding: '2px 4px' }} />s</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={loop} onChange={e => onPatchTimeline({ loop: e.target.checked })} />반복</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={autoplay} onChange={e => onPatchTimeline({ autoplay: e.target.checked })} />자동재생</label>
      </div>
      <input type="range" min={0} max={dur} step={0.01} value={Math.min(time, dur)} onChange={e => scrub(Number(e.target.value))} style={{ width: '100%' }} />
      {/* 트랙 = 루트 + 자식 (이름 클릭 → 선택, 다이아몬드 = 키, 더블클릭 삭제) */}
      {tracks.map(o => {
        const keys = o.keyframeAnim?.keys ?? [];
        const isSel = o.id === selObj.id;
        const isRoot = o.id === root.id;
        return (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, marginLeft: isRoot ? 0 : 14 }}>
            <button onClick={() => onSelectObj(o.id)} title="선택"
              style={{ flex: '0 0 130px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                background: isSel ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)', border: isSel ? '1px solid #818cf8' : '1px solid #333',
                color: isSel ? '#c7d2fe' : '#bbb', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', fontSize: 11 }}>
              {isRoot ? '◆ ' : '└ '}{o.label || o.kind}
            </button>
            <div style={{ position: 'relative', flex: 1, height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
              {keys.map((k, i) => (
                <div key={i} onClick={() => { onSelectObj(o.id); scrub(k.t); }} title={`${k.t.toFixed(2)}s — 클릭: 선택+미리보기 (더블클릭 삭제)`}
                  onDoubleClick={() => delKey(o.id, i)}
                  style={{ position: 'absolute', left: `calc(${(k.t / dur) * 100}% - 5px)`, top: 1, width: 10, height: 10, background: isSel ? '#fbbf24' : '#9ca3af', transform: 'rotate(45deg)', cursor: 'pointer' }} />
              ))}
              <div style={{ position: 'absolute', left: `${(Math.min(time, dur) / dur) * 100}%`, top: -2, width: 1, height: 18, background: '#ef4444' }} />
            </div>
          </div>
        );
      })}
      <div style={{ color: '#888', fontSize: 10, marginTop: 8 }}>오브젝트(또는 자식)를 선택 → 옮기고 “키 추가”. 시뮬/플레이에서 자동 재생됩니다.</div>
    </div>
  );
}

export default function StudioCanvas() {
  useEffect(() => { silenceConsoleSpam(); }, []);
  const t            = useTranslations('Studio');
  const tCanvas      = useTranslations('Studio.canvas');
  const tAssets      = useTranslations('Assets');
  const leftSheet    = useSheetDrag(62);
  const rightSheet   = useSheetDrag(62);
  // 우측 인스펙터 너비 (px). 사용자가 좌측 핸들 드래그로 조정 → localStorage 영구.
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 300;
    const v = Number(window.localStorage.getItem('alp-inspector-width'));
    return Number.isFinite(v) && v >= 220 && v <= 800 ? v : 300;
  });
  useEffect(() => {
    try { window.localStorage.setItem('alp-inspector-width', String(inspectorWidth)); } catch { /* noop */ }
  }, [inspectorWidth]);
  // 인스펙터 좌측 핸들 드래그 — pointer capture 로 마우스 윈도우 밖 나가도 추적.
  const inspectorResizeRef = useRef<{ startX: number; startW: number; pointerId: number } | null>(null);
  const onInspectorResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    inspectorResizeRef.current = { startX: e.clientX, startW: inspectorWidth, pointerId: e.pointerId };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onInspectorResizeMove = (e: React.PointerEvent) => {
    const d = inspectorResizeRef.current;
    if (!d) return;
    // 좌측 핸들이므로 마우스가 왼쪽으로 가면 (dx<0) 패널이 넓어짐
    const dx = e.clientX - d.startX;
    setInspectorWidth(Math.max(220, Math.min(800, d.startW - dx)));
  };
  const onInspectorResizeUp = (e: React.PointerEvent) => {
    const d = inspectorResizeRef.current;
    if (!d) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId); } catch { /* noop */ }
    inspectorResizeRef.current = null;
  };
  const router       = useRouter();
  const searchParams = useSearchParams();
  const editingId    = searchParams.get('id') || null;

  const [objects, setObjects]       = useState<MapObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode]             = useState<'translate' | 'rotate' | 'scale'>('translate');
  // 키프레임 타임라인 — 편집 미리보기 포즈 오버라이드 (선택 오브젝트의 worldTRS 를 일시 대체)
  // 멀티 오브젝트 키프레임 미리보기 — id 별 포즈 맵 (재생/스크럽 시 애니메이션 있는 모든 오브젝트 동시 미리보기).
  const [kfPreviews, setKfPreviews] = useState<Record<string, { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }> | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  // 터레인 조각(sculpt) — 도구/브러시. tool=null 이면 비활성(일반 선택/이동).
  const [terrainTool, setTerrainTool] = useState<TerrainTool | null>(null);
  const [brushSize, setBrushSize] = useState(5);
  const [brushStrength, setBrushStrength] = useState(0.3);
  const [sculptDragging, setSculptDragging] = useState(false);
  // 선택이 터레인이 아니면 조각 도구 해제 (카메라 잠금 방지).
  useEffect(() => {
    const sel = objects.find(o => o.id === selectedId);
    if (terrainTool && (!sel || sel.kind !== 'terrain')) setTerrainTool(null);
  }, [selectedId, objects, terrainTool]);
  // 시뮬레이션
  const [simulating, setSimulating] = useState(false);
  // 게임 로직 레이어(시뮬용) — 스크립트의 game/ui/world.playSound 가 들어오고 <GameHud> 가 그림.
  // ui.set/show/hide 콜백 — label 로 ui 오브젝트 찾아 props 패치 또는 hidden 토글.
  const onUiSet = useCallback((label: string, patch: Record<string, unknown>) => {
    setObjects(prev => prev.map(o => {
      if (o.kind !== 'ui' || !o.ui) return o;
      if (o.label !== label) return o;
      return { ...o, ui: { ...o.ui, ...patch } as UiData };
    }));
  }, []);
  const onUiVisible = useCallback((label: string, visible: boolean) => {
    setObjects(prev => prev.map(o => {
      if (o.kind !== 'ui' || !o.ui) return o;
      if (o.label !== label) return o;
      return { ...o, hidden: !visible };
    }));
  }, []);
  const simGameRuntime = useMemo(() => createGameRuntime({ onUiSet, onUiVisible }), [onUiSet, onUiVisible]);
  // 영상 컨트롤(스크러버/재생·정지/±5초) 용 레지스트리 — 시뮬 영상 핸들 등록처. 단일 플레이라 로컬 조작.
  const simVideoRegistry: VideoRegistry = useRef<Map<string, VideoHandle>>(new Map());
  // 자동재생 잠금 해제 ID — VideoInitialStateApplier 가 매 frame 강제 pause. ▶ 클릭 시 unlock.
  const simVideoUnlockedRef = useRef<Set<string>>(new Set());
  // 시뮬 중 URL 변경(리모컨 🔗) 오버라이드 — objId→새 URL. stopSim 에서 초기화.
  const [simVideoUrlOverrides, setSimVideoUrlOverrides] = useState<Record<string, string>>({});
  // targetId 지정 시 그 화면만(리모컨), 미지정 시 등록된 모두(2D 바). 단일 플레이라 로컬 조작.
  const runSimVideoControl = useCallback((cmd: { seekBy?: number; seekTo?: number; playing?: boolean; url?: string; volume?: number; muted?: boolean }, targetId?: string) => {
    if (cmd.url && targetId) setSimVideoUrlOverrides(m => ({ ...m, [targetId]: cmd.url! }));
    const ids = targetId ? [targetId] : [...simVideoRegistry.current.keys()];
    for (const objId of ids) {
      const v = simVideoRegistry.current.get(objId);
      if (v && typeof cmd.seekBy === 'number') v.seek(Math.max(0, (v.getTime() || 0) + cmd.seekBy));
      if (v && typeof cmd.seekTo === 'number') v.seek(cmd.seekTo);
      if (v && typeof cmd.playing === 'boolean') {
        if (cmd.playing) simVideoUnlockedRef.current.add(objId);
        v.setPlaying(cmd.playing);
      }
      if (v && typeof cmd.volume === 'number') v.setVolume(cmd.volume);
      if (v && typeof cmd.muted === 'boolean') v.setMuted(cmd.muted);
      if (cmd.url && !targetId) setSimVideoUrlOverrides(m => ({ ...m, [objId]: cmd.url! }));
    }
  }, []);
  // 시뮬에 넘길 오브젝트 — 숨김 제외 + URL 오버라이드 적용(없으면 원본 ref 유지해 재렌더 방지).
  const simObjs = useMemo(() => {
    const base = objects.filter(o => !o.hidden);
    if (Object.keys(simVideoUrlOverrides).length === 0) return base;
    return base.map(o => simVideoUrlOverrides[o.id] !== undefined ? { ...o, videoUrl: simVideoUrlOverrides[o.id] } : o);
  }, [objects, simVideoUrlOverrides]);

  // 미디어 리모컨 컴포넌트의 url prop → target 오브젝트의 videoUrl 에 직접 적용 (영구, 편집뷰·시뮬 둘 다).
  // target 토큰: obj.id 우선, label/이름 fallback. 빈 mesh 도 영상 화면으로 변신 가능.
  useEffect(() => {
    const updates = new Map<string, string>();
    for (const obj of objects) {
      const inst = obj.components?.find(c => c.type === 'videoRemote');
      if (!inst) continue;
      const cmdUrl = String(inst.props?.url ?? '').trim();
      if (!cmdUrl) continue;
      const tokensRaw = String(inst.props?.target ?? '').trim();
      const tokens = tokensRaw ? tokensRaw.split(/[,\s]+/).filter(Boolean) : [];
      const matches = (x: MapObject) => {
        if (x.components?.some(c => c.type === 'videoRemote')) return false;
        if (tokens.length === 0) return x.kind === 'plane' || !!x.videoUrl;
        if (tokens.includes(x.id)) return true;                                  // id 매칭 (드래그 결과)
        const nm = x.label || (x as { name?: string }).name || '';
        return !!nm && tokens.includes(nm);                                      // label/name 매칭 (수동 입력)
      };
      for (const t of objects.filter(matches)) {
        if (t.videoUrl !== cmdUrl) updates.set(t.id, cmdUrl);
      }
    }
    if (updates.size === 0) return;
    setObjects(prev => prev.map(o => updates.has(o.id) ? { ...o, videoUrl: updates.get(o.id)! } : o));
  }, [objects]);
  // 시뮬레이션 플레이어 — 본인 캐릭터로 직접 플레이 (월드와 동일 조작)
  const [simCharacter, setSimCharacter] = useState<Record<string, unknown> | null>(null);
  const [simCameraMode, setSimCameraMode] = useState<'first' | 'third'>('first');
  // 시뮬레이션 카메라 모드 — 'follow'(캐릭터 빙의) / 'free'(자유시점, 언리얼 eject 같은)
  const [simCamView, setSimCamView] = useState<'follow' | 'free'>('follow');
  // 1인칭 크로스헤어 상태 — idle/aim(잡을 수 있는 것 조준)/grab(잡는 중)
  const [simCrosshair, setSimCrosshair] = useState<'idle' | 'aim' | 'grab'>('idle');
  // Player 가 요구하는 ref 들 — 스튜디오엔 멀티/소유권 개념 없으니 빈 ref no-op
  const simOwnersRef       = useRef<Map<string, string>>(new Map());
  const simGrabbedStateRef = useRef<Map<string, string>>(new Map());
  const simRemoteGrabbedRef = useRef<Map<string, string>>(new Map());
  const simGrabbableIdsRef = useRef<Set<string>>(new Set());
  const [aiGuideOpen, setAiGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // 컴포넌트 picker 모달 (인스펙터의 "+ 컴포넌트 추가" 클릭 시 열림)
  const [componentPickerOpen, setComponentPickerOpen] = useState(false);
  const [componentPickerSearch, setComponentPickerSearch] = useState('');
  const [pickerCollapsed, setPickerCollapsed] = useState<Record<string, boolean>>({});
  // 환경 (Sky/HDRI/ambient) 패널 토글
  const [envPanelOpen, setEnvPanelOpen] = useState(true);
  // 유저 정의 스크립트 컴포넌트 (DB) + 관리 모달
  const [scriptComponents, setScriptComponents] = useState<ScriptComponent[]>([]);
  // 공식 (운영자가 만든) 컴포넌트 — 모든 유저 picker 에 노출
  const [officialScriptComponents, setOfficialScriptComponents] = useState<ScriptComponent[]>([]);
  const [scriptComponentsModalOpen, setScriptComponentsModalOpen] = useState(false);
  // 인스펙터 컴포넌트 카드의 'edit' → 이 id 의 스크립트 컴포넌트 편집으로 모달 오픈
  const [scriptEditId, setScriptEditId] = useState<string | null>(null);
  useEffect(() => {
    const tok = session.getToken();
    // 내 컴포넌트 (로그인 필요)
    if (tok) {
      api.listMyScriptComponents(tok)
        .then(r => setScriptComponents(r.components))
        .catch(e => console.warn('[ScriptComponents] my load fail', e));
    }
    // 공식 컴포넌트 (비로그인도 가능)
    api.listOfficialScriptComponents(tok || undefined)
      .then(r => setOfficialScriptComponents(r.components))
      .catch(e => console.warn('[ScriptComponents] official load fail', e));
  }, []);
  // ── 내 Script Asset 목록 — picker 에서 가져오기/부착 ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scriptAssets, setScriptAssets] = useState<Array<{ id: string; name: string; metadata?: any }>>([]);
  useEffect(() => {
    const tok = session.getToken();
    if (!tok) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';
    fetch(`${API_BASE}/api/assets/my`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (d.assets || []).filter((a: any) => a.kind === 'script');
        setScriptAssets(list);
      })
      .catch(e => console.warn('[scriptAssets] load fail', e));
  }, [scriptComponents.length]);
  // ── 프리팹 (Unity 스타일 오브젝트 스냅샷) ──
  const [prefabs, setPrefabs] = useState<Prefab[]>([]);
  const [prefabsLoading, setPrefabsLoading] = useState(false);
  const [prefabPanelOpen, setPrefabPanelOpen] = useState(true);
  // 프리팹 목록 로드 — 컴포넌트 마운트 시 + savePrefab/deletePrefab 후 갱신
  const reloadPrefabs = useCallback(async () => {
    const tok = session.getToken();
    if (!tok) return;
    setPrefabsLoading(true);
    try {
      const res = await api.listMyPrefabs(tok);
      setPrefabs(res.prefabs);
    } catch (e) {
      console.error('[Prefab] load fail', e);
    } finally {
      setPrefabsLoading(false);
    }
  }, []);
  useEffect(() => { reloadPrefabs(); }, [reloadPrefabs]);
  // 씬 패널 — 검색·필터
  const [sceneSearch, setSceneSearch] = useState('');
  const [sceneFilter, setSceneFilter] = useState<'all' | 'shapes' | 'lights' | 'assets' | 'scripted'>('all');
  // 인스펙터 탭
  const [inspTab, setInspTab] = useState<'transform' | 'material'>('transform');
  // 큐브 깎기(CSG) 도구 상태
  const [carveShape, setCarveShape] = useState<CsgCut['shape']>('sphere');
  const [carveSize, setCarveSize] = useState(0.4);
  const [carvePos, setCarvePos] = useState<[number, number, number]>([0, 0, 0]);
  // 데스크톱 좌/우 패널 접기 (모바일은 기존 studioMode 토글 사용)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // 패널 크기 조절 (드래그) — 좌측 너비 / 에셋 드로어 높이. (데스크톱)
  const [leftWidth, setLeftWidth] = useState(280);
  const [assetH, setAssetH] = useState(340);
  // 좌측 패널 탭 — 한 컬럼에 다 쌓지 않고 전환. '씬'=계층+추가, '환경'=HDRI, '프리팹'
  const [leftTab, setLeftTab] = useState<'scene' | 'env' | 'prefab'>('scene');
  // 맵 정보(내맵/새월드/설명/공개) — 헤더에서 여는 드롭다운으로 이동
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  // 드래그 리사이즈 — axis x(가로)/y(세로), dir +1/-1(드래그 방향→증가), from=시작값, set=상태 setter.
  const beginResize = (e: React.PointerEvent, o: { axis: 'x' | 'y'; from: number; dir: 1 | -1; min: number; max: number; set: (n: number) => void }) => {
    e.preventDefault();
    const start = o.axis === 'x' ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const delta = ((o.axis === 'x' ? ev.clientX : ev.clientY) - start) * o.dir;
      o.set(Math.max(o.min, Math.min(o.max, o.from + delta)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = o.axis === 'x' ? 'ew-resize' : 'ns-resize';
  };
  // [DEBUG] panel state 변화 추적 — 사용자가 strip 클릭해도 패널이 안 열리는 버그 진단용
  useEffect(() => {
    devLog('[PANEL STATE] leftPanelOpen=', leftPanelOpen, 'rightPanelOpen=', rightPanelOpen);
  }, [leftPanelOpen, rightPanelOpen]);
  // 조명 선택 시 자동으로 transform 탭 (조명은 material/script 비활성)
  const [simTransforms, setSimTransforms] = useState<SimTransforms>({});
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const [name, setName]             = useState(t('newWorldDefault'));
  const [description, setDescription] = useState('');
  const [savedId, setSavedId]       = useState<string | null>(editingId);
  const [saving, setSaving]         = useState(false);
  const [myAssets, setMyAssets]     = useState<Asset[]>([]);
  const [showMarket, setShowMarket] = useState(false);   // 마켓플레이스 모달
  const [myWorlds, setMyWorlds]     = useState<MyWorldItem[]>([]);
  const [myWorldsOpen, setMyWorldsOpen] = useState(false);
  const [myWorldsLoading, setMyWorldsLoading] = useState(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [activeAssetPicker, setActiveAssetPicker] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [localFolders, setLocalFolders] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | undefined>(undefined);
  const [pickerPreview, setPickerPreview] = useState<Asset | null>(null); // 내 에셋 미리보기 모달
  const [dropZoneActive, setDropZoneActive] = useState(false);
  // 에셋 그리드 마퀴(드래그 박스) 다중선택
  const [assetSel, setAssetSel] = useState<Set<string>>(new Set());
  const [assetMarq, setAssetMarq] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const assetGridRef = useRef<HTMLDivElement>(null);
  const assetMarqStart = useRef<{ x: number; y: number } | null>(null);
  // 폴더 바뀌면 선택 해제
  useEffect(() => { setAssetSel(new Set()); }, [selectedFolder]);
  // 에셋 그리드 빈 영역 우클릭 컨텍스트 메뉴 (폴더 만들기)
  const [assetCtxMenu, setAssetCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // 스크립트 에셋 작성/편집 모달 — target=null 신규, target=Asset 편집
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false);
  const [scriptEditTarget, setScriptEditTarget] = useState<Asset | null>(null);
  // 씬 트리 우클릭 컨텍스트 메뉴 — objId=null 이면 빈 영역(추가), 있으면 노드(빼기/삭제)
  const [treeCtxMenu, setTreeCtxMenu] = useState<{ x: number; y: number; objId: string | null } | null>(null);
  // 씬 트리 — 커스텀 포인터 드래그(네이티브 X → 드래그 중에도 휠 스크롤 동작) + 가장자리 자동 스크롤
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const treeScrollVel = useRef(0);
  const treeScrollRAF = useRef<number | null>(null);
  const [treeDrag, setTreeDrag] = useState<{ id: string; x: number; y: number; overId: string | null; overMode: 'reorder' | 'reparent' | null } | null>(null);
  const treeDragRef = useRef<{ id: string; startX: number; startY: number; active: boolean; pointerId: number } | null>(null);
  const treeDragOverRef = useRef<{ overId: string | null; overMode: 'reorder' | 'reparent' | null }>({ overId: null, overMode: null });
  const [uploading, setUploading] = useState(false);
  const [texPicker, setTexPicker] = useState<null | 'albedo' | 'normal' | 'roughness'>(null);
  const [videoPicker, setVideoPicker] = useState(false);
  const [dragOverTex, setDragOverTex] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const orbitRef = useRef<OrbitRef | null>(null);
  // 그리드 스냅
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapSize, setSnapSize] = useState(0.5);
  // 오브젝트 종류별 카운터 (자동 이름용)
  const objCounterRef = useRef<Record<string, number>>({});
  // 공개/비공개
  const [isPublic, setIsPublic] = useState(false);
  const [isGame, setIsGame] = useState(false);   // 게임으로 표시 — 목록에서 🎮 배지·필터
  // 제작자 지정 게임 캐릭터 ({appearance, name}). null = 플레이어 본인 캐릭터.
  const [gameCharacter, setGameCharacter] = useState<Record<string, unknown> | null>(null);
  const [myCharsForGame, setMyCharsForGame] = useState<Array<{ id: string; name: string; appearance: Record<string, unknown> }> | null>(null);
  // 오브젝트 이름 인라인 편집
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  // 조명 설정
  const [lightAmbient, setLightAmbient] = useState(0.04);  // 기본: 거의 꺼짐
  const [lightDir, setLightDir] = useState(0.0);            // 기본: 없음
  const [skyEnabled, setSkyEnabled] = useState(false);
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  const [shapePanelOpen, setShapePanelOpen] = useState(false);
  const [lightAddPanelOpen, setLightAddPanelOpen] = useState(false);
  const [uiAddPanelOpen, setUiAddPanelOpen] = useState(false);
  const [uiJsonModalOpen, setUiJsonModalOpen] = useState(false);
  const [uiJsonText, setUiJsonText] = useState('');
  const [uiJsonError, setUiJsonError] = useState<string | null>(null);
  const [matPanelOpen, setMatPanelOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<'settings' | 'scene'>('settings');
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  // 가시 레이어 집합 (0-9). 기본: 전부 보임. 레이어 패널에서 토글.
  const [visibleLayers, setVisibleLayers] = useState<Set<number>>(() => new Set([0,1,2,3,4,5,6,7,8,9]));
  const toggleLayer = useCallback((n: number) => {
    setVisibleLayers(prev => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  }, []);
  const isLayerVisible = useCallback((layer?: number) => visibleLayers.has(layer ?? 0), [visibleLayers]);
  // 트리 노드 접힘 상태 (collapsed 에 든 id = 접힘). 자식이 선택되면 조상을 자동 펼침.
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedNodes(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  // 선택된 오브젝트가 자식이면 트리에서 조상들을 자동 펼침 — 뷰포트 클릭 등으로 선택돼도 트리에 보이게.
  useEffect(() => {
    if (!selectedId) return;
    setCollapsedNodes(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      let pid = objects.find(o => o.id === selectedId)?.parentId;
      const guard = new Set<string>();
      while (pid && !guard.has(pid)) {
        guard.add(pid);
        if (next.delete(pid)) changed = true;
        pid = objects.find(o => o.id === pid)?.parentId;
      }
      return changed ? next : prev;
    });
  }, [selectedId, objects]);
  const [marqueeStart, setMarqueeStart] = useState<{x:number,y:number}|null>(null);
  const [marqueeEnd,   setMarqueeEnd]   = useState<{x:number,y:number}|null>(null);
  const isMarqueeRef = useRef(false);
  const dragStartRef = useRef<Map<string, {p:[number,number,number];r:[number,number,number];s:[number,number,number]}>>(new Map());
  const shiftHeldRef = useRef(false);
  // Ctrl/Cmd held — 트리 클릭으로 개별 토글 선택 (Shift 와 별개)
  const ctrlHeldRef = useRef(false);
  // 트리 범위 선택용 앵커(마지막 단일 클릭 지점) + 키보드 핸들러에서 읽을 최신 선택 상태
  const rangeAnchorRef = useRef<string | null>(null);
  const selRef = useRef<{ sel: string | null; multi: Set<string> }>({ sel: null, multi: new Set() });
  selRef.current = { sel: selectedId, multi: multiSelectedIds };
  // 최신 objects 미러 — 키보드 단축키 핸들러 등 stale 클로저에서 fresh 읽기용
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // 우클릭(RMB) 누름 상태 — 누른 동안만 WASD/QE 카메라 비행(유니티식). 평소엔 W/E/R = 도구 단축키.
  const rmbHeldRef = useRef(false);
  // Alt 누름 — 기즈모 mouseDown 시점에 체크해 Alt+드래그 = 복제 후 원본 끌고가기 (Maya 식 효과)
  const altHeldRef = useRef(false);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true;
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeldRef.current = true;
      if (e.key === 'Alt') altHeldRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false;
      if (e.key === 'Control' || e.key === 'Meta') ctrlHeldRef.current = false;
      if (e.key === 'Alt') altHeldRef.current = false;
    };
    const mdn = (e: MouseEvent) => { if (e.button === 2) rmbHeldRef.current = true; };
    const mup = (e: MouseEvent) => { if (e.button === 2) rmbHeldRef.current = false; };
    // 자가 보정 — 네이티브 컨텍스트 메뉴 등으로 mouseup 을 놓쳐도 buttons 비트로 RMB 상태 복구
    const mmv = (e: MouseEvent) => { rmbHeldRef.current = (e.buttons & 2) === 2; };
    const blur = () => { shiftHeldRef.current = false; ctrlHeldRef.current = false; rmbHeldRef.current = false; altHeldRef.current = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('mousedown', mdn);
    window.addEventListener('mouseup', mup);
    window.addEventListener('mousemove', mmv);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up);
      window.removeEventListener('mousedown', mdn); window.removeEventListener('mouseup', mup);
      window.removeEventListener('mousemove', mmv);
      window.removeEventListener('blur', blur);
    };
  }, []);
  // HDRI 환경
  type HdriPreset = 'none' | 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'studio' | 'sunset' | 'warehouse';
  const [hdriPreset, setHdriPreset] = useState<HdriPreset>('none');
  const [hdriUrl, setHdriUrl] = useState('');          // 커스텀 URL (.hdr/.exr)
  const [hdriBackground, setHdriBackground] = useState(false); // HDRI를 배경으로 표시
  const [hdriIntensity, setHdriIntensity] = useState(1.0);     // HDRI 환경광 (IBL) 강도 — scene.environmentIntensity
  const [exposure, setExposure] = useState(0.7);   // tone mapping exposure — 너무 밝으면 낮춤
  // 맵 물리 — 빈 오브젝트의 World Physics 컴포넌트가 소스. 아래 gravityY/jumpPower 는
  // 구버전 맵(sceneSettings) 로드용 fallback. UI 패널은 제거됨(컴포넌트로 관리).
  const [gravityY, setGravityY]   = useState(-22);
  const [jumpPower, setJumpPower] = useState(7);
  // 맵에 부착된 World Physics 컴포넌트에서 실효 중력/점프력 도출 (없으면 fallback).
  const worldPhysics = useMemo(() => {
    for (const o of objects) {
      const inst = findComponent(o.components, 'worldPhysics');
      if (inst) return {
        gravity:   getProp(inst, 'gravity', gravityY),
        jumpPower: getProp(inst, 'jumpPower', jumpPower),
      };
    }
    return { gravity: gravityY, jumpPower };
  }, [objects, gravityY, jumpPower]);
  // 후처리 볼륨 — postProcess 컴포넌트 설정 (편집/시뮬 공통)
  const postFX = useMemo(() => derivePostFX(objects), [objects]);
  // 물에 잠겼을 때만 적용 후처리 (underwaterOnly) — 카메라가 보이는 물 부피 안인지로 판정 (편집·시뮬 공통).
  const waterPostFX = useMemo(() => collectWaterPostFX(objects), [objects]);
  const waterPostFXRef = useRef<WaterPostFX[]>(waterPostFX);
  useEffect(() => { waterPostFXRef.current = waterPostFX; }, [waterPostFX]);
  const [activeWaterFX, setActiveWaterFX] = useState(-1);
  // 영역(zone) 후처리 — 편집/시뮬 카메라가 그 박스 안이면 해당 볼륨 미리보기.
  const postFXZones = useMemo(() => collectPostFXZones(objects), [objects]);
  const [activePostFXZone, setActivePostFXZone] = useState(-1);
  // 썸네일 캡처 함수 (Canvas 내부에서 등록)
  const captureFnRef = useRef<(() => string | null) | null>(null);
  const cameraRef    = useRef<THREE.Camera | null>(null);
  const viewportRef  = useRef<HTMLDivElement | null>(null);
  const canvasDomRef = useRef<HTMLCanvasElement | null>(null);
  // 1인칭 크로스헤어 위치 — 캔버스 영역 중앙(viewport 중앙 X). raycast NDC(0,0) 과 일치시키기 위함.
  const [canvasCenter, setCanvasCenter] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const update = () => {
      const cv = canvasDomRef.current;
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      setCanvasCenter({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    update();
    window.addEventListener('resize', update);
    const iv = setInterval(update, 500);   // 레이아웃 변경 (사이드바 토글 등) 폴백
    return () => { window.removeEventListener('resize', update); clearInterval(iv); };
  }, []);

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

  // 마지막 저장 시 스냅샷 — dirty 판단용. 빈 문자열 = 한 번도 저장 안 함.
  const [savedKey, setSavedKey] = useState<string>('');

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

  /* 내 에셋 목록 로드 — 마켓 import 후 즉시 동기화에도 재사용. */
  const loadMyAssets = useCallback(() => {
    fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => setMyAssets(d.assets || []))
      .catch(() => {});
  }, []);
  useEffect(() => { loadMyAssets(); }, [loadMyAssets]);

  /* 맵 에셋 "현재 맵에 추가" — kinds/map.tsx 의 Preview 가 dispatch 하는 이벤트 listen.
     id 재생성 + parentId 매핑 + 현재 objects 끝에 append. 환경/HDRI 도 함께 적용. */
  useEffect(() => {
    const handler = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as CustomEvent).detail as { data?: any; env?: any; name?: string };
      const data = detail?.data;
      if (!data || !Array.isArray(data.objects) || data.objects.length === 0) return;
      // id 재생성 — 충돌 방지. parentId 도 새 id 로 매핑. (기존 패턴 `obj_${ts}_…`)
      const stamp = Date.now();
      const mkId = (i: number) => `obj_${stamp}_${i.toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
      const idMap = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const src = data.objects as any[];
      src.forEach((o, i) => { if (typeof o.id === 'string') idMap.set(o.id, mkId(i)); });
      const merged: MapObject[] = src.map((o, i) => {
        const newId = idMap.get(o.id) || mkId(i);
        const newParent = (o.parentId && idMap.get(o.parentId)) || null;
        return { ...o, id: newId, parentId: newParent } as MapObject;
      });
      setObjects(prev => {
        const next = [...prev, ...merged];
        pushHistory(next);
        return next;
      });
      // 환경값 적용 — .alp 의 bgColor/ambient/preset/hdri 가 있으면 스튜디오 씬에 반영.
      // (씬이 어둠으로 시작해서 안 보이는 문제 해결.)
      const env = data.env || detail?.env || {};
      const envAmb = env.ambientIntensity ?? data.ambientIntensity;
      const envHdri = env.hdriPreset ?? data.hdriPreset;
      const envBg = env.bgColor ?? data.bgColor;
      if (typeof envAmb === 'number') setLightAmbient(envAmb < 0.3 ? 0.5 : envAmb);
      if (typeof envHdri === 'string' && envHdri !== 'none') {
        setHdriPreset(envHdri as typeof hdriPreset);
      } else if (envBg) {
        // bgColor 만 있으면 procedural Sky 켜기 — 푸른 하늘
        setSkyEnabled(true);
      }
      devLog(`[map asset] merged ${merged.length} objects + env`, { envAmb, envHdri, envBg });
    };
    window.addEventListener(MAP_APPLY_EVENT, handler);
    return () => window.removeEventListener(MAP_APPLY_EVENT, handler);
  }, [pushHistory]);

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
    devLog('[studio] loading world', editingId);
    fetch(`${API}/api/worlds/${editingId}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(async r => {
        const text = await r.text();
        devLog('[studio] response status:', r.status);
        try { return JSON.parse(text); } catch { throw new Error('Invalid JSON: ' + text.slice(0, 100)); }
      })
      .then(d => {
        if (!d.world) {
          setLoadError(d.error?.message || tCanvas("msg_world_not_found"));
          return;
        }
        devLog('[studio] loaded:', d.world.name, 'objects:', d.world.mapData?.objects?.length ?? 0);
        setName(d.world.name);
        setDescription(d.world.description || '');
        setIsPublic(Boolean(d.world.isPublic));
        setIsGame(Boolean(d.world.isGame));
        setGameCharacter(d.world.gameCharacter && typeof d.world.gameCharacter === 'object' ? d.world.gameCharacter : null);
        // 씬 설정 복원
        const ss = d.world.mapData?.sceneSettings || {};
        if (ss.lightAmbient  !== undefined) setLightAmbient(ss.lightAmbient);
        if (ss.lightDir      !== undefined) setLightDir(ss.lightDir);
        if (ss.skyEnabled    !== undefined) setSkyEnabled(ss.skyEnabled);
        if (ss.hdriPreset    !== undefined) setHdriPreset(ss.hdriPreset);
        if (ss.hdriUrl       !== undefined) setHdriUrl(ss.hdriUrl);
        if (ss.hdriBackground !== undefined) setHdriBackground(ss.hdriBackground);
        if (ss.hdriIntensity  !== undefined) setHdriIntensity(ss.hdriIntensity);
        if (typeof ss.gravityY  === 'number') setGravityY(ss.gravityY);
        if (typeof ss.jumpPower === 'number') setJumpPower(ss.jumpPower);
        if (ss.exposure       !== undefined) setExposure(ss.exposure);
        const objs = d.world.mapData?.objects || [];
        setObjects(objs);
        setHist({ stack: [clone(objs)], idx: 0 });
        setSelectedId(null);
        setSavedId(d.world.id);
        // 로드 직후엔 dirty 아님 — 현재 상태를 저장된 기준점으로 마킹
        setSavedKey(JSON.stringify({ name: d.world.name, objects: objs, sceneSettings: ss }));
      })
      .catch(e => {
        console.error('[studio] load failed:', e);
        setLoadError(String(e?.message || e));
      })
      .finally(() => setLoading(false));
  }, [editingId]);

  /** 선택 오브젝트가 화면에 넉넉히 보이도록 카메라 이동 (Unity F 동작) */
  const focusObject = useCallback((id: string) => {
    if (!orbitRef.current || !cameraRef.current) return;
    const worldMat = computeWorldMatrix(id, objects);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    worldMat.decompose(pos, quat, scaleVec);

    const size = Math.max(Math.abs(scaleVec.x), Math.abs(scaleVec.y), Math.abs(scaleVec.z), 1);
    const distance = size * 4;

    const orbit = orbitRef.current;
    const camera = cameraRef.current;
    const dir = new THREE.Vector3().subVectors(camera.position, orbit.target);
    if (dir.lengthSq() < 0.0001) dir.set(0.6, 0.8, 1);
    dir.normalize().multiplyScalar(distance);

    orbit.target.copy(pos);
    camera.position.copy(pos).add(dir);
    orbit.update?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);

  /* 단축키 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 시뮬레이션 중: 나머지 단축키 무시 (WASD 등은 Player 로 전달).
      if (simulating) {
        // F8 — 캐릭터 빙의(follow) ↔ 자유시점(free) 토글 (언리얼 eject 스타일)
        if (e.key === 'F8') {
          e.preventDefault();
          setSimCamView(v => v === 'follow' ? 'free' : 'follow');
          if (document.pointerLockElement) document.exitPointerLock();
          return;
        }
        // ESC — 포인터 락 중이면 락만 해제 (sim 유지), 락 없으면 sim 중지 (월드와 동일 UX).
        if (e.key === 'Escape' && !document.pointerLockElement) stopSim();
        return;
      }
      // Undo/Redo/Duplicate/Save (modifier 단축키 — 입력창에서도 통함)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
        if (e.key === 'd') { e.preventDefault(); duplicate(); return; }
        if (e.key === 's') { e.preventDefault(); save(); return; }   // Ctrl+S 저장
        // Ctrl+G 그룹화 / Ctrl+Shift+G 그룹 해제
        if (e.key === 'g' || e.key === 'G') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          if (e.shiftKey) ungroupSelected();
          else groupSelected();
          return;
        }
        // Ctrl+L — 선택된 객체 잠금 토글 (locked=true 시 transform 기즈모 차단)
        if (e.key === 'l' || e.key === 'L') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const targets = new Set<string>();
          if (selectedId) targets.add(selectedId);
          multiSelectedIds.forEach(id => targets.add(id));
          if (targets.size === 0) return;
          const cur = objectsRef.current;
          const first = cur.find(o => targets.has(o.id));
          const nextLocked = !first?.locked;
          setObjects(prev => prev.map(o => targets.has(o.id) ? { ...o, locked: nextLocked } : o));
          return;
        }
        // Ctrl+A — 전체 선택 (입력창은 텍스트 전체선택 기본 동작 그대로)
        if (e.key === 'a' || e.key === 'A') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const all = objects.filter(o => !o.hidden).map(o => o.id);
          if (all.length === 0) return;
          setMultiSelectedIds(new Set(all));
          setSelectedId(all[0]);
          return;
        }
        // Ctrl+H — 선택된 객체 hidden 토글 (다중 포함)
        if (e.key === 'h' || e.key === 'H') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const targets = new Set<string>();
          if (selectedId) targets.add(selectedId);
          multiSelectedIds.forEach(id => targets.add(id));
          if (targets.size === 0) return;
          setObjects(prev => prev.map(o => targets.has(o.id) ? { ...o, hidden: !o.hidden } : o));
          return;
        }
        // Ctrl+0~9 — 선택된 객체를 그 레이어로 할당 (유니티 식)
        if (/^[0-9]$/.test(e.key)) {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const targets = new Set<string>();
          if (selectedId) targets.add(selectedId);
          multiSelectedIds.forEach(id => targets.add(id));
          if (targets.size === 0) return;
          const nv = parseInt(e.key, 10);
          setObjects(prev => prev.map(o => targets.has(o.id) ? { ...o, layer: nv } : o));
          return;
        }
        // Ctrl+I — 선택 반전
        if (e.key === 'i' || e.key === 'I') {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const current = new Set<string>(multiSelectedIds);
          if (selectedId) current.add(selectedId);
          const inverted = objects.filter(o => !o.hidden && !current.has(o.id)).map(o => o.id);
          setMultiSelectedIds(new Set(inverted));
          setSelectedId(inverted[0] ?? null);
          return;
        }
      }
      // 입력창에 포커스되어 있으면 단축키 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // ESC — 선택 해제 (단일 + 다중)
      if (e.key === 'Escape') {
        setSelectedId(null);
        setMultiSelectedIds(new Set());
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected(); // 선택된 전부(다중 포함) 삭제 — 아무것도 없으면 no-op
      }
      // 화살표 키 — 선택된 객체 미세 이동 (Shift = 1, 기본 = 0.1). RMB 비행 중엔 카메라 우선.
      else if (selectedId && !rmbHeldRef.current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dz = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
        setObjects(prev => prev.map(o => o.id === selectedId
          ? { ...o, position: [o.position[0] + dx, o.position[1], o.position[2] + dz] }
          : o));
      }
      // 변환 도구 단축키 (유니티식 W=이동 E=회전 R=스케일). RMB 비행 중엔 무시(카메라 입력 우선).
      else if (!rmbHeldRef.current && (e.key === 'w' || e.key === 'W')) setMode('translate');
      else if (!rmbHeldRef.current && (e.key === 'e' || e.key === 'E')) setMode('rotate');
      else if (!rmbHeldRef.current && (e.key === 'r' || e.key === 'R')) setMode('scale');
      else if ((e.key === 'f' || e.key === 'F') && selectedId) focusObject(selectedId);
      // 패널 토글 — T=트리(좌측) / N=인스펙터(우측). Blender 식.
      else if (!rmbHeldRef.current && (e.key === 't' || e.key === 'T')) setLeftPanelOpen(prev => !prev);
      else if (!rmbHeldRef.current && (e.key === 'n' || e.key === 'N')) setRightPanelOpen(prev => !prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, simulating, undo, redo, pushHistory, focusObject]);

  useEffect(() => {
    // window.innerWidth 직접 체크 — matchMedia 가 캐시되거나 dev tools 환경에서 잘못 반환되는 경우 회피
    const check = () => {
      const mobile = (typeof window !== 'undefined' ? window.innerWidth : 0) < 900;
      setIsMobile(mobile);
      if (!mobile) {
        setMobilePanelOpen(false);
        // 데스크톱 복귀 시 — 모드/패널 강제 정상화 (모바일에서 꼬인 상태 회복)
        setStudioMode('settings');
        setLeftPanelOpen(true);
        setRightPanelOpen(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    // matchMedia 변경 이벤트도 백업으로 — 일부 환경에서 resize 이벤트가 발생 안 할 때 대비
    const mql = window.matchMedia?.('(max-width: 900px)');
    mql?.addEventListener?.('change', check);
    return () => {
      window.removeEventListener('resize', check);
      mql?.removeEventListener?.('change', check);
    };
  }, []);

  // 전체화면 상태 동기화
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch { /* 일부 브라우저(iOS Safari)는 미지원 — 무시 */ }
  };

  // KIND_LABELS / KIND_ICONS — 모듈 상단으로 이동됨

  function makeLabel(kind: string): string {
    objCounterRef.current[kind] = (objCounterRef.current[kind] ?? 0) + 1;
    return `${KIND_LABELS[kind] ?? kind} ${objCounterRef.current[kind]}`;
  }

  function addPrimitive(kind: 'cube' | 'sphere' | 'cylinder' | 'plane', dropPos?: [number, number, number]) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel(kind);
    const px = dropPos ? dropPos[0] : 0;
    const pz = dropPos ? dropPos[2] : 0;
    setObjects(prev => {
      const next = [...prev, {
        id, kind, label,
        position: [px, kind === 'plane' ? 0.01 : 0.5, pz] as [number,number,number],
        rotation: (kind === 'plane' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]) as [number,number,number],
        scale:    (kind === 'plane' ? [5, 5, 1] : [1, 1, 1]) as [number,number,number],
        color:    '#94a3b8',
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
  }

  // 물(바다/호수) 추가 — 반투명 파란 수면 + 웨이브. WaterMesh 가 내부에서 수평 회전 처리.
  function addWater() {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => {
      const next = [...prev, {
        id, kind: 'water' as const, label: makeLabel('water'),
        position: [0, 0.05, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale:    [10, 1, 10] as [number, number, number],
        color:    '#1e88e5',
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
  }

  function duplicate() {
    // 선택된 것 전부(다중 포함) + 각자의 자손까지 복제. 복제본끼리 부모-자식 관계 유지.
    const { sel, multi } = selRef.current;
    const baseIds = multi.size > 0 ? [...multi] : sel ? [sel] : [];
    if (baseIds.length === 0) return;
    const cur = objectsRef.current;

    // 복제 대상 = 선택 + 그 자손 전부 (부모를 복제하면 자식도 같이)
    const copySet = new Set<string>(baseIds);
    for (const id of baseIds) for (const d of collectDescendants(id, cur)) copySet.add(d);

    // 원본 id → 새 id 매핑
    const idMap = new Map<string, string>();
    let seq = 0;
    for (const id of copySet) idMap.set(id, `obj_${Date.now()}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 5)}`);

    const copies: MapObject[] = [];
    const newRootIds: string[] = [];
    for (const o of cur) {
      if (!copySet.has(o.id)) continue;
      const c = clone(o);
      c.id = idMap.get(o.id)!;
      c.label = makeLabel(o.kind);
      if (o.parentId && copySet.has(o.parentId)) {
        c.parentId = idMap.get(o.parentId);            // 내부 계층 리맵 (자식 복제본 → 부모 복제본)
      } else {
        // 최상위 복제본 — 부모는 원본과 동일, 위치 살짝 오프셋, 선택 대상
        c.parentId = o.parentId;
        c.position = [o.position[0] + 1, o.position[1], o.position[2]];
        newRootIds.push(c.id);
      }
      copies.push(c);
    }
    if (copies.length === 0) return;
    setObjects(prev => {
      const next = [...prev, ...copies];
      pushHistory(next);
      return next;
    });
    // 복제본(최상위)들을 선택 상태로
    setMultiSelectedIds(new Set(newRootIds.length > 1 ? newRootIds : []));
    setSelectedId(newRootIds[0] ?? null);
  }

  /* ── 프리팹 — 선택된 오브젝트를 스냅샷으로 DB 저장 ───────────
     썸네일은 현재 뷰포트를 자동 캡처해서 R2 에 업로드. */
  async function savePrefab() {
    if (!selected) return;
    const name = prompt(tCanvas("prompt_prefab_name"), selected.label || makeLabel(selected.kind));
    if (!name || !name.trim()) return;
    const tok = session.getToken();
    if (!tok) { alert(tCanvas("alert_login_required")); return; }

    // ── 자식 트리 전체 수집 — 다중 오브젝트 프리팹 (fbx + 도형 + sound 등 묶음) ──
    // root = selected. descendants = parentId 체인으로 root 까지 닿는 모든 오브젝트.
    const descIds = collectDescendants(selected.id, objects);
    const tree: MapObject[] = [clone(selected), ...objects.filter(o => descIds.has(o.id)).map(clone)];
    // root 의 position 만 [0,0,0] 으로 정규화 — 자식은 부모 기준 로컬이라 그대로.
    tree[0].position = [0, 0, 0];
    tree[0].parentId = undefined;
    // (참고용) 단일 root snapshot 호환 유지 — 1개일 때만
    const snapshot = tree[0];

    // 썸네일 자동 캡처 (실패해도 저장 자체는 진행 — thumbnailUrl=null)
    let thumbnailUrl: string | undefined;
    try {
      const dataUrl = captureFnRef.current?.();
      if (dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'prefab-thumb.webp', { type: 'image/webp' });
        const up = await api.uploadPrefabThumbnail(tok, file);
        thumbnailUrl = up.url;
      }
    } catch (e) {
      console.warn('[Prefab] 썸네일 캡처 실패 — thumbnail 없이 저장', e);
    }

    try {
      const res = await api.createPrefab(tok, {
        name: name.trim().slice(0, 100),
        // version 2: tree (다중 오브젝트). version 1 (root 단일) 도 instantiate 가 호환.
        payload: { version: 2, root: snapshot, tree },
        thumbnailUrl,
      });
      setPrefabs(prev => [res.prefab, ...prev]);
    } catch (e) {
      alert(tCanvas("alert_prefab_save_failed", { message: (e as Error).message }));
    }
  }

  /* Ctrl+G — 선택된 객체들을 새 empty 그룹의 자식으로 묶기.
     위치 보정 없음 (자식 local position 그대로) — group 자체는 원점 (0,0,0). */
  function groupSelected() {
    const { sel, multi } = selRef.current;
    const baseIds = multi.size > 0 ? [...multi] : sel ? [sel] : [];
    if (baseIds.length < 1) return;
    const groupId = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const targets = new Set(baseIds);
    setObjects(prev => {
      const next: MapObject[] = [
        ...prev.map(o => targets.has(o.id) ? { ...o, parentId: groupId } : o),
        {
          id: groupId,
          kind: 'empty' as const,
          label: makeLabel('empty'),
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale:    [1, 1, 1] as [number, number, number],
          color: '#60a5fa',
        },
      ];
      pushHistory(next);
      return next;
    });
    setSelectedId(groupId);
    setMultiSelectedIds(new Set());
  }

  /* Ctrl+Shift+G — 선택된 empty 그룹 해제. 자식들의 parentId 풀고 그룹 자체 제거. */
  function ungroupSelected() {
    const { sel, multi } = selRef.current;
    const targets = new Set<string>(multi.size > 0 ? [...multi] : sel ? [sel] : []);
    if (targets.size === 0) return;
    setObjects(prev => {
      const groupIds = new Set(prev.filter(o => targets.has(o.id) && o.kind === 'empty').map(o => o.id));
      if (groupIds.size === 0) return prev;
      const next = prev
        .filter(o => !groupIds.has(o.id))
        .map(o => o.parentId && groupIds.has(o.parentId) ? { ...o, parentId: undefined } : o);
      pushHistory(next);
      return next;
    });
    setMultiSelectedIds(new Set());
  }

  /* 프리팹을 씬에 인스턴스화 — 위치 인자로 받음.
     version 2 (tree): 모든 오브젝트에 새 id 부여 + parentId remap. root 위치만 인자로 덮어씀.
     version 1 (root): 기존 단일 오브젝트 호환. */
  function instantiatePrefab(prefab: Prefab, position: [number, number, number]) {
    const payload = prefab.payload as { version?: number; root?: MapObject; tree?: MapObject[] } | null;
    const tree = payload?.tree && payload.tree.length > 0 ? payload.tree : (payload?.root ? [payload.root] : []);
    if (tree.length === 0) { alert(tCanvas("alert_prefab_payload_corrupt")); return; }
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // 옛 id → 새 id 매핑
    const idMap = new Map<string, string>();
    tree.forEach((o, i) => idMap.set(o.id, `obj_${stamp}_${i}`));
    // 모든 오브젝트 새 id + parentId remap
    const newObjs: MapObject[] = tree.map((o, i) => {
      const c = clone(o);
      c.id = idMap.get(o.id)!;
      // parent 가 트리 안에 있으면 remap, 없으면 (root) undefined
      const np = o.parentId ? idMap.get(o.parentId) : undefined;
      c.parentId = np;
      // root (parent 없음) 만 외부 위치 적용
      if (!c.parentId) {
        c.position = position;
        c.label = o.label || prefab.name;
      }
      // ui 안 nested label 도 unique 보장 — 단순화: 그대로
      return c;
    });
    setObjects(prev => {
      const next = [...prev, ...newObjs];
      pushHistory(next);
      return next;
    });
    // 첫 root 선택
    const rootNew = newObjs.find(o => !o.parentId);
    if (rootNew) setSelectedId(rootNew.id);
  }

  /* 프리팹 삭제 */
  async function removePrefab(id: string) {
    if (!confirm(tCanvas("confirm_delete_prefab"))) return;
    const tok = session.getToken();
    if (!tok) return;
    try {
      await api.deletePrefab(tok, id);
      setPrefabs(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert(tCanvas("alert_delete_failed", { message: (e as Error).message }));
    }
  }


  /* ── 물리 시뮬레이션 ─────────────────────── */
  function startSim() {
    // 현재 씬의 세계 좌표를 Three.js scene 에서 캡처
    const scene = threeSceneRef.current;
    const transforms: SimTransforms = {};
    objects.filter(o => !o.hidden).forEach(obj => {
      let found: THREE.Object3D | null = null;
      if (scene) {
        scene.traverse((node: THREE.Object3D) => {
          if (node.userData?.id === obj.id) found = node;
        });
      }
      if (found) {
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        const ws = new THREE.Vector3();
        (found as THREE.Object3D).getWorldPosition(wp);
        (found as THREE.Object3D).getWorldQuaternion(wq);
        (found as THREE.Object3D).getWorldScale(ws);
        const wr = new THREE.Euler().setFromQuaternion(wq);
        transforms[obj.id] = {
          pos: [wp.x, wp.y, wp.z],
          rot: [wr.x, wr.y, wr.z],
          scl: [ws.x, ws.y, ws.z],
        };
      } else {
        transforms[obj.id] = { pos: obj.position, rot: obj.rotation, scl: obj.scale };
      }
    });
    setSimTransforms(transforms);
    setSelectedId(null);

    // grab 가능 오브젝트 id 집합 — grab 컴포넌트 있거나 레거시 grabbable
    const grabSet = new Set<string>();
    for (const o of objects) {
      const hasGrab = o.components?.some(c => c.type === 'grab') || (o as { grabbable?: boolean }).grabbable;
      if (hasGrab) grabSet.add(o.id);
    }
    simGrabbableIdsRef.current = grabSet;

    // 본인 활성 캐릭터 fetch (없으면 기본 박스 캐릭터로 플레이)
    const tok = session.getToken();
    if (tok) {
      fetch(`${API}/api/characters/me`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.ok ? r.json() : { character: null })
        .then(d => setSimCharacter(d.character || {}))
        .catch(() => setSimCharacter({}));
    } else {
      setSimCharacter({});
    }
    setSimCameraMode('first');
    setSimCamView('follow');
    simGameRuntime.reset();   // 게임 상태·HUD 초기화 후 시작
    setTerrainTool(null);     // 지형 조각 도구 해제 (시뮬 중 카메라 잠금 방지)
    setSimulating(true);
  }

  function stopSim() {
    // 1인칭 시뮬 중 걸린 포인터 락이 남으면 clientX 가 고정돼 우클릭 카메라 회전이 죽는다 → 명시적 해제.
    if (document.pointerLockElement) document.exitPointerLock();
    setSimulating(false);
    setSimTransforms({});
    setSimCharacter(null);
    setSimCrosshair('idle');
    setSimVideoUrlOverrides({});   // 리모컨으로 바꿨던 영상 URL 초기화
    simGameRuntime.reset();   // 편집 모드로 돌아가며 HUD 제거
  }

  // 스폰 위치 — spawn 오브젝트 중 하나 (랜덤). 없으면 기본 [0,4,0]. 시뮬 시작 시 고정.
  const simSpawn = useMemo(() => {
    const spawns = objects.filter(o => o.kind === 'spawn' && !o.hidden);
    if (spawns.length === 0) return { pos: [0, 4, 0] as [number, number, number], rotY: 0 };
    const pick = spawns[Math.floor(Math.random() * spawns.length)];
    return { pos: pick.position, rotY: pick.rotation[1] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulating]);

  /** AI 가 생성한 오브젝트 배열을 씬에 적용. id 는 충돌 방지 위해 새로 발급. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function importFromAi(imported: any[], mode: 'add' | 'replace') {
    const stamp = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized: MapObject[] = imported.map((o: any, i: number) => ({
      id: `obj_${stamp}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      kind: (o.kind || 'cube') as ObjectKind,
      label: o.label || makeLabel((o.kind || 'cube') as ObjectKind),
      assetUrl: typeof o.assetUrl === 'string' ? o.assetUrl : undefined,
      position: Array.isArray(o.position) && o.position.length === 3 ? o.position.map(Number) as [number, number, number] : [0, 1, 0],
      rotation: Array.isArray(o.rotation) && o.rotation.length === 3 ? o.rotation.map(Number) as [number, number, number] : [0, 0, 0],
      scale:    Array.isArray(o.scale)    && o.scale.length    === 3 ? o.scale.map(Number)    as [number, number, number] : [1, 1, 1],
      color:    typeof o.color === 'string' ? o.color : '#888888',
      physics:  o.physics === 'none' || o.physics === 'dynamic' || o.physics === 'fixed' ? o.physics : undefined,
      material:        typeof o.material === 'string' ? o.material as MaterialPreset : undefined,
      materialColor:   typeof o.materialColor === 'string' ? o.materialColor : undefined,
      lightColor:      typeof o.lightColor === 'string' ? o.lightColor : undefined,
      lightIntensity:  typeof o.lightIntensity === 'number' ? o.lightIntensity : undefined,
      lightDistance:   typeof o.lightDistance === 'number'  ? o.lightDistance  : undefined,
      lightAngle:      typeof o.lightAngle === 'number'     ? o.lightAngle     : undefined,
      lightPenumbra:   typeof o.lightPenumbra === 'number'  ? o.lightPenumbra  : undefined,
      castShadow:      typeof o.castShadow === 'boolean'    ? o.castShadow     : undefined,
      script:          typeof o.script === 'string' ? o.script : undefined,
      scriptVars:      o.scriptVars && typeof o.scriptVars === 'object' ? o.scriptVars : undefined,
    }));
    setObjects(prev => {
      const next = mode === 'replace' ? normalized : [...prev, ...normalized];
      pushHistory(next);
      return next;
    });
    setSelectedId(null);
  }

  function addLight(kind: 'pointlight' | 'spotlight' | 'dirlight') {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel(kind);
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind, label,
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#ffffff',
        lightColor:     '#ffffff',
        lightIntensity: 1,
        lightDistance:  0,
        lightAngle:     45,
        lightPenumbra:  0.2,
        // 새 조명 기본 그림자 OFF — 그림자 캐스팅 조명 너무 많으면 WebGL MAX_TEXTURE_IMAGE_UNITS(16) 초과 오류
        castShadow:     false,
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  function addSpawn() {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel('spawn');
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'spawn', label,
        position: [0, 1, 0],     // 발이 바닥 위에 살짝 (모델 절반 높이)
        rotation: [0, 0, 0],     // forward = -z (회전 시 그쪽으로 바라봄)
        scale:    [1, 1, 1],
        color:    '#34d399',     // 시각화 색 (월드에선 안 보임)
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  // 빈 오브젝트 — 컴포넌트 홀더(컨테이너/피벗). 기본 컴포넌트 없이 깨끗하게 생성.
  // (맵 중력은 worldPhysics 컴포넌트가 없으면 기본값(gravityY) 사용 — 필요하면 직접 부착)
  /** Sound 오브젝트 추가 — 위치 기반 사운드. autoplay + loop 기본. */
  function addSound() {
    const id = `sound_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'sound', label: tCanvas("default_label_sound"),
        position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        color: '#a855f7',
        soundUrl: '',
        soundVolume: 0.8,
        soundLoop: true,
        soundAutoplay: true,
        soundRadius: 10,
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  /** Terrain 추가 — 평탄 또는 noise 생성. 크기 50m, segments 64 기본. */
  function addTerrain(kind: 'flat' | 'noise' = 'flat') {
    const id = `terrain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const t: TerrainData = kind === 'noise'
      ? generateNoiseTerrain(50, 128, 4, 0.05, Math.floor(Math.random() * 1000))
      : makeFlatTerrain(50, 128);
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'terrain', label: kind === 'noise' ? tCanvas("default_label_noise_terrain") : tCanvas("default_label_flat_terrain"),
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        color: '#5a8a4a',
        terrain: t,
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  // 복셀 지형 (아스트로니어식) — 파고/쌓을 수 있는 흙덩이. base: solid=바위, flat=평지, noise=언덕
  function addVoxel(base: 'solid' | 'flat' | 'noise' = 'noise') {
    const id = `voxel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const size = 16;
    const voxel: import('@/lib/world/voxelVolume').VoxelVolumeData = {
      res: 32, size, seed: Math.floor(Math.random() * 1000), base,
      ground: base === 'flat' || base === 'noise' ? size * 0.28 : 0,  // 표면을 위쪽에 → 잔디층, 아래로 파면 흙·바위
      deforms: [],
    };
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'voxel', label: tCanvas("default_label_voxel_terrain"),
        position: [0, size / 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
        color: '#7a6b55', voxel,
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  function addEmpty() {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel('empty');
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'empty', label,
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#60a5fa',
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  /** UI 오브젝트 추가 — type 별로 default ui 데이터 + 부모 (canvas 외에는 가장 가까운 canvas 자식으로).
   *  라벨 중복 방지 — 같은 라벨 있으면 (2)/(3)/... 자동 부여. ui.set("이름") 으로 찾기 위함. */
  function addUi(type: UiElementType, canvasSpace: 'screen' | 'world' = 'screen') {
    const id = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const baseLabel = type === 'canvas' && canvasSpace === 'world' ? 'Canvas (World)' : type;
    const existing = new Set(objects.filter(o => !!o.label).map(o => o.label as string));
    let label = baseLabel;
    let i = 2;
    while (existing.has(label)) label = `${baseLabel} (${i++})`;
    // canvas 가 아닌 요소는 부모 canvas 찾기. 없으면 screen Canvas 생성.
    setObjects(prev => {
      const next: MapObject[] = [...prev];
      let parentCanvasId: string | null = null;
      if (type !== 'canvas') {
        const existing = prev.find(o => o.kind === 'ui' && o.ui?.type === 'canvas');
        if (existing) parentCanvasId = existing.id;
        else {
          const cid = `ui_canvas_${Date.now()}`;
          next.push({
            id: cid, kind: 'ui', label: 'Canvas',
            position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff',
            ui: makeDefaultUiData('canvas', 'screen'),
          });
          parentCanvasId = cid;
        }
      }
      // World canvas 는 기본 위치 [0, 2, 0] (눈높이) + scale 0.005 (1920px ≈ 9.6m → 0.005 시 ~5m).
      const isWorldCanvas = type === 'canvas' && canvasSpace === 'world';
      next.push({
        id, kind: 'ui', label, parentId: parentCanvasId ?? undefined,
        position: isWorldCanvas ? [0, 2, 0] : [0, 0, 0],
        rotation: [0, 0, 0],
        scale: isWorldCanvas ? [0.005, 0.005, 0.005] : [1, 1, 1],
        color: '#ffffff',
        ui: type === 'canvas' ? makeDefaultUiData('canvas', canvasSpace) : makeDefaultUiData(type),
      });
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  /** AI JSON → UI 오브젝트 트리 import. 라벨 중복 시 (2)/(3) 자동 부여. */
  function importUiFromJson(jsonText: string): { ok: true; count: number } | { ok: false; error: string } {
    let parsed: AiUiRoot;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { return { ok: false, error: tCanvas("err_json_parse_failed", { message: (e as Error).message }) }; }
    let flat;
    try { flat = parseAiUiRoot(parsed, `ui_${Date.now()}`); }
    catch (e) { return { ok: false, error: tCanvas("err_ui_tree_convert_failed", { message: (e as Error).message }) }; }
    if (flat.length === 0) return { ok: false, error: tCanvas("err_no_ui_objects") };
    setObjects(prev => {
      // 라벨 중복 방지
      const existing = new Set(prev.filter(o => !!o.label).map(o => o.label as string));
      const next: MapObject[] = [...prev];
      for (const f of flat) {
        let label = f.label || 'ui';
        if (existing.has(label)) {
          const base = label;
          let i = 2;
          while (existing.has(label = `${base} (${i++})`)) { /* keep */ }
        }
        existing.add(label);
        next.push({
          id: f.id, kind: 'ui', label, parentId: f.parentId,
          position: f.position, rotation: f.rotation, scale: f.scale,
          color: f.color, ui: f.ui,
        });
      }
      pushHistory(next);
      return next;
    });
    // 첫 추가된 루트 선택
    setSelectedId(flat[0].id);
    setStudioMode('scene');
    return { ok: true, count: flat.length };
  }

  // 트리에서 우클릭한 아이템의 자식으로 빈 오브젝트 추가.
  // 부모 기준 로컬 (0,0,0) 으로 생성 → 부모 위치에 붙음 (컴포넌트 없이 깨끗하게).
  function addEmptyChild(parentId: string) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = makeLabel('empty');
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'empty', label,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#60a5fa',
        parentId,
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setStudioMode('scene');
  }

  function addAsset(asset: Asset, position: [number, number, number] = [0, 0, 0]) {
    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const label = asset.name || makeLabel('asset');
    setObjects(prev => {
      const next: MapObject[] = [...prev, {
        id, kind: 'asset', label,
        assetUrl: asset.modelUrl,
        // materialConfig 를 먼저 펼쳐서 머티리얼/텍스처만 가져오고, transform(위치/회전/스케일)은
        // 항상 아래 기본값이 이기게 한다. (materialConfig 에 transform 키가 섞여 있어도 rotation 이
        // undefined 가 되어 인스펙터에서 .map 크래시 나는 것 방지)
        ...(getAssetMaterialConfig(asset) || {}),
        position,
        // 모델은 최대 치수=1 단위로 정규화됨 → 스케일 1 이면 캐릭터(≈1.8)보다 작아 너무 작게 보임.
        // 기본 3 단위로 생성 (필요시 인스펙터에서 조절). 스튜디오·월드 동일 정규화라 양쪽 일관.
        rotation: [0, 0, 0],
        scale:    [3, 3, 3],
        color:    '#fff',
      }];
      pushHistory(next);
      return next;
    });
    setSelectedId(id);
    setActiveAssetPicker(false);
  }

  /* ── 마퀴 셀렉션 ── */
  function handleMarqueeDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return; // 캔버스 위 클릭만
    if (isGizmoActive()) return;
    const rect = viewportRef.current!.getBoundingClientRect();
    setMarqueeStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setMarqueeEnd(null);
    isMarqueeRef.current = false;
  }

  function handleMarqueeMove(e: React.MouseEvent) {
    if (!marqueeStart) return;
    const rect = viewportRef.current!.getBoundingClientRect();
    const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dx = cur.x - marqueeStart.x, dy = cur.y - marqueeStart.y;
    if (!isMarqueeRef.current && Math.sqrt(dx*dx + dy*dy) > 5) isMarqueeRef.current = true;
    if (isMarqueeRef.current) setMarqueeEnd(cur);
  }

  function handleMarqueeUp(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (isMarqueeRef.current && marqueeStart && marqueeEnd) {
      const camera = cameraRef.current;
      const el = viewportRef.current;
      if (camera && el) {
        const rect = el.getBoundingClientRect();
        const minX = Math.min(marqueeStart.x, marqueeEnd.x);
        const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
        const minY = Math.min(marqueeStart.y, marqueeEnd.y);
        const maxY = Math.max(marqueeStart.y, marqueeEnd.y);
        const matched: string[] = [];
        for (const obj of objects) {
          if (obj.hidden) continue;
          const vec = new THREE.Vector3(...obj.position);
          vec.project(camera);
          if (vec.z > 1) continue; // 카메라 뒤
          const sx = (vec.x + 1) / 2 * rect.width;
          const sy = (-vec.y + 1) / 2 * rect.height;
          if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) matched.push(obj.id);
        }
        setMultiSelectedIds(new Set(matched));
        setSelectedId(matched[0] ?? null);
      }
    }
    setMarqueeStart(null);
    setMarqueeEnd(null);
    isMarqueeRef.current = false;
  }

  function dropPositionFromEvent(e: React.DragEvent): [number, number, number] {
    const camera = cameraRef.current;
    const el = viewportRef.current;
    if (!camera || !el) return [0, 0, 0];
    const rect = el.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return [0, 0, 0];
    return [
      Math.round(hit.x * 10) / 10,
      0,
      Math.round(hit.z * 10) / 10,
    ];
  }

  /**
   * 뷰포트에 드롭된 위치에서 raycast 해서 가장 가까운 씬 오브젝트의 id 를 반환.
   * 없으면 null. 트리 노드 → 뷰포트 오브젝트로 드래그해서 부모 설정할 때 사용.
   */
  function pickObjectIdFromXY(clientX: number, clientY: number): string | null {
    const camera = cameraRef.current;
    const el = viewportRef.current;
    const scene = threeSceneRef.current;
    if (!camera || !el || !scene) return null;
    const rect = el.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    // 씬 전체 raycast. 가장 가까운 hit 부터 userData.id 가 있는 조상 찾기.
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      let node: THREE.Object3D | null = h.object;
      while (node) {
        const id = (node.userData as { id?: string } | undefined)?.id;
        if (id) return id;
        node = node.parent;
      }
    }
    return null;
  }

  function toggleFolder(path: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  const fbxAssets = myAssets; // 모든 에셋 표시
  const fbxFolderTree = useMemo(() => {
    // 폴더 트리는 모든 에셋 기준 (이미지 등 포함) — 에셋 페이지와 동일한 폴더 구조
    const fromAssets = myAssets.map(a => normalizeFolder(a.folder)).filter((f): f is string => f !== null);
    const allFolders = [...new Set([...fromAssets, ...localFolders])].sort();
    return buildFolderTree(allFolders);
  }, [myAssets, localFolders]);

  async function uploadFilesToFolder(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    for (const file of arr) {
      const fd = new FormData();
      fd.append('model', file);
      fd.append('name', file.name.replace(/\.fbx$/i, ''));
      if (selectedFolder) fd.append('folder', selectedFolder);
      try {
        const res = await fetch(`${API}/api/assets/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}` },
          body: fd,
        });
        const data = await res.json();
        if (data.asset) setMyAssets(prev => [...prev, data.asset]);
      } catch (e) { console.error('업로드 실패', e); }
    }
    setUploading(false);
  }

  async function renameAsset(assetId: string, newName: string) {
    setMyAssets(prev => prev.map(a => a.id === assetId ? { ...a, name: newName } : a));
    try {
      await fetch(`${API}/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: newName }),
      });
    } catch (e) { console.error('이름 변경 실패', e); }
  }

  async function renameFolderInStudio(oldPath: string, newSegment: string) {
    // 부모 경로 유지, 마지막 세그먼트만 교체
    const parentPath = oldPath.lastIndexOf('/') > 0
      ? oldPath.slice(0, oldPath.lastIndexOf('/'))
      : '';
    const newPath = parentPath ? `${parentPath}/${newSegment}` : `/${newSegment}`;
    // 이 폴더 및 하위 폴더의 모든 에셋 경로 prefix 교체
    const updated: Asset[] = myAssets.map(a => {
      const f = a.folder ?? null;
      if (f === oldPath) return { ...a, folder: newPath };
      if (f && f.startsWith(oldPath + '/')) return { ...a, folder: newPath + f.slice(oldPath.length) };
      return a;
    });
    setMyAssets(updated);
    setLocalFolders(prev => prev.map(f => {
      if (f === oldPath) return newPath;
      if (f.startsWith(oldPath + '/')) return newPath + f.slice(oldPath.length);
      return f;
    }));
    if (selectedFolder === oldPath) setSelectedFolder(newPath);
    else if (selectedFolder && selectedFolder.startsWith(oldPath + '/')) setSelectedFolder(newPath + selectedFolder.slice(oldPath.length));
    // 서버 반영: 변경된 에셋들 PATCH
    const toUpdate = updated.filter(a => {
      const orig = myAssets.find(x => x.id === a.id);
      return orig && orig.folder !== a.folder;
    });
    for (const a of toUpdate) {
      try {
        await fetch(`${API}/api/assets/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ folder: a.folder }),
        });
      } catch (e) { console.error('폴더 이름 변경 실패', e); }
    }
  }

  async function deleteAsset(assetId: string) {
    const asset = myAssets.find(a => a.id === assetId);
    if (!window.confirm(t('deleteAssetConfirm', { name: asset?.name ?? assetId }))) return;
    setMyAssets(prev => prev.filter(a => a.id !== assetId));
    try {
      await fetch(`${API}/api/assets/${assetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
    } catch (e) { console.error('삭제 실패', e); }
  }

  /** 선택된 에셋 일괄 삭제 — 확인 1회 후 전부 삭제 */
  async function deleteAssetsBatch(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(tCanvas("confirm_delete_assets", { count: ids.length }))) return;
    const idSet = new Set(ids);
    setMyAssets(prev => prev.filter(a => !idSet.has(a.id)));
    setAssetSel(new Set());
    for (const id of ids) {
      try { await fetch(`${API}/api/assets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } }); }
      catch (e) { console.error('삭제 실패', e); }
    }
  }

  // 에셋 그리드 마퀴 드래그 다중선택 — 빈 공간에서 시작, 박스에 닿는 카드 선택
  const onAssetGridPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const tgt = e.target as HTMLElement;
    if (tgt.closest('[data-asset-id], button, input, [data-folder-card]')) return; // 카드/버튼/폴더 위면 무시(드래그·클릭 유지)
    assetMarqStart.current = { x: e.clientX, y: e.clientY };
    if (!e.shiftKey) setAssetSel(new Set());
    try { assetGridRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onAssetGridPointerMove = (e: React.PointerEvent) => {
    const start = assetMarqStart.current;
    if (!start) return;
    const x0 = Math.min(start.x, e.clientX), y0 = Math.min(start.y, e.clientY);
    const x1 = Math.max(start.x, e.clientX), y1 = Math.max(start.y, e.clientY);
    setAssetMarq({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    const sel = new Set<string>();
    assetGridRef.current?.querySelectorAll('[data-asset-id]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > x0 && r.left < x1 && r.bottom > y0 && r.top < y1) {
        const id = el.getAttribute('data-asset-id'); if (id) sel.add(id);
      }
    });
    setAssetSel(sel);
  };
  const onAssetGridPointerUp = (e: React.PointerEvent) => {
    if (!assetMarqStart.current) return;
    assetMarqStart.current = null;
    setAssetMarq(null);
    try { assetGridRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  async function deleteFolderInStudio(folderPath: string) {
    const folderName = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
    const toDelete = myAssets.filter(a => {
      const f = normalizeFolder(a.folder);
      return f === folderPath || (f !== null && f.startsWith(folderPath + '/'));
    });
    const msg = toDelete.length > 0
      ? t('deleteFolderWithAssets', { folder: folderName, count: toDelete.length })
      : t('deleteFolderEmpty', { folder: folderName });
    if (!window.confirm(msg)) return;
    const ids = toDelete.map(a => a.id);
    setMyAssets(prev => prev.filter(a => !ids.includes(a.id)));
    setLocalFolders(prev => prev.filter(f => f !== folderPath && !f.startsWith(folderPath + '/')));
    if (selectedFolder === folderPath || (selectedFolder !== null && selectedFolder.startsWith(folderPath + '/'))) {
      setSelectedFolder(null);
    }
    for (const id of ids) {
      try {
        await fetch(`${API}/api/assets/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        });
      } catch (e) { console.error('삭제 실패', e); }
    }
  }

  async function moveAssetToFolder(assetId: string, folder: string | null) {
    try {
      await fetch(`${API}/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ folder }),
      });
      setMyAssets(prev => prev.map(a => a.id === assetId ? { ...a, folder } : a));
    } catch (e) { console.error('폴더 이동 실패', e); }
  }

  async function moveFolderTo(fromPath: string, toParentPath: string | null) {
    // 순환 방지: 자기 자신이나 자손으로 이동 불가
    if (toParentPath !== null && (toParentPath === fromPath || toParentPath.startsWith(fromPath + '/'))) return;
    const lastSegment = fromPath.split('/').filter(Boolean).pop() ?? fromPath;
    const newPath = toParentPath ? `${toParentPath}/${lastSegment}` : `/${lastSegment}`;
    if (newPath === fromPath) return;

    const updated = myAssets.map(a => {
      const f = a.folder ?? null;
      if (f === fromPath) return { ...a, folder: newPath };
      if (f && f.startsWith(fromPath + '/')) return { ...a, folder: newPath + f.slice(fromPath.length) };
      return a;
    });
    setMyAssets(updated);
    setLocalFolders(prev => prev.map(f => {
      if (f === fromPath) return newPath;
      if (f.startsWith(fromPath + '/')) return newPath + f.slice(fromPath.length);
      return f;
    }));
    if (selectedFolder === fromPath || (selectedFolder !== null && selectedFolder.startsWith(fromPath + '/'))) {
      setSelectedFolder(toParentPath);
    }
    const toUpdate = updated.filter(a => {
      const orig = myAssets.find(x => x.id === a.id);
      return orig && orig.folder !== a.folder;
    });
    for (const a of toUpdate) {
      try {
        await fetch(`${API}/api/assets/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ folder: a.folder }),
        });
      } catch (e) { console.error('폴더 이동 실패', e); }
    }
  }

  function confirmNewFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const path = selectedFolder ? `${selectedFolder}/${name}` : `/${name}`;
    setLocalFolders(prev => prev.includes(path) ? prev : [...prev, path]);
    setOpenFolders(prev => { const next = new Set(prev); if (selectedFolder) next.add(selectedFolder); return next; });
    setSelectedFolder(path);
    setNewFolderName('');
    setShowNewFolder(false);
  }
  const selectedFolderAssets = useMemo(
    () => fbxAssets.filter(a => normalizeFolder(a.folder) === selectedFolder),
    [fbxAssets, selectedFolder]
  );
  // 현재 선택된 폴더의 직계 서브폴더
  const selectedSubfolders = useMemo(() => {
    if (selectedFolder === null) return fbxFolderTree;
    const node = findFolderNode(fbxFolderTree, selectedFolder);
    return node ? node.children : [];
  }, [fbxFolderTree, selectedFolder]);

  /** Shift+클릭으로 멀티셀렉션 토글 */
  function shiftClickObject(id: string) {
    setStudioMode('scene');
    setMultiSelectedIds(prev => {
      // 현재 selectedId도 set에 포함
      const next = new Set(prev);
      if (selectedId && !next.has(selectedId)) next.add(selectedId);

      if (next.has(id)) {
        // 이미 선택된 오브젝트 → 제거
        next.delete(id);
        if (selectedId === id) {
          // primary가 제거됐으면 남은 것 중 첫 번째로
          setSelectedId([...next][0] ?? null);
        }
        // else: primary는 그대로 유지
      } else {
        // 새로 추가
        next.add(id);
        setSelectedId(id);
      }
      return next;
    });
  }

  /** Shift+클릭 (트리) — 앵커부터 클릭 지점까지, 화면에 보이는 순서대로 사이의 노드 전부 선택.
      순서는 DOM(data-node-id) 기준이라 접힘/필터 상태를 그대로 반영한다. */
  function rangeSelectObject(id: string) {
    setStudioMode('scene');
    const el = treeScrollRef.current;
    const order = el
      ? Array.from(el.querySelectorAll('[data-node-id]'))
          .map(n => n.getAttribute('data-node-id'))
          .filter((v): v is string => !!v)
      : [];
    // 앵커: 마지막 단일 클릭 지점 (없거나 화면 밖이면 현재 primary 로 폴백)
    let anchor = rangeAnchorRef.current;
    if (!anchor || !order.includes(anchor)) anchor = selectedId;
    const ai = anchor ? order.indexOf(anchor) : -1;
    const bi = order.indexOf(id);
    if (ai === -1 || bi === -1) {
      // 순서를 못 구하면 단일 선택으로 폴백
      setMultiSelectedIds(new Set([id]));
      setSelectedId(id);
      return;
    }
    const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai];
    setMultiSelectedIds(new Set(order.slice(lo, hi + 1)));
    setSelectedId(id); // primary = 마지막 클릭 (인스펙터 대상). 앵커는 그대로 유지해 확장/축소 가능.
  }

  function onTransformDragStart() {
    // Alt + 기즈모 드래그 (Maya 식): 같은 자리에 복제본 만들고 selectedId 유지 →
    // 사용자는 원본을 그대로 끌고감, 복제본이 원래 자리에 남음. 시각적 결과는 "복제 후 이동".
    // 주의: TransformControls 가 이미 원본을 grab 한 상태에서 새 오브젝트 추가만 함 (target swap X) → drag 끊김 없음.
    if (altHeldRef.current) duplicateInPlace();
    // 드래그 시작 시 모든 선택 오브젝트의 transform 스냅샷
    const map = new Map<string, {p:[number,number,number];r:[number,number,number];s:[number,number,number]}>();
    const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : selectedId ? [selectedId] : [];
    for (const oid of ids) {
      const obj = objects.find(o => o.id === oid);
      if (obj) map.set(oid, { p: [...obj.position] as [number,number,number], r: [...obj.rotation] as [number,number,number], s: [...obj.scale] as [number,number,number] });
    }
    dragStartRef.current = map;
  }

  /** 같은 자리에 복제 — Alt+기즈모 드래그 전용 (selectedId 유지). 자손까지 함께 복제. */
  function duplicateInPlace() {
    const { sel, multi } = selRef.current;
    const baseIds = multi.size > 0 ? [...multi] : sel ? [sel] : [];
    if (baseIds.length === 0) return;
    const cur = objectsRef.current;
    const copySet = new Set<string>(baseIds);
    for (const id of baseIds) for (const d of collectDescendants(id, cur)) copySet.add(d);
    const idMap = new Map<string, string>();
    let seq = 0;
    for (const id of copySet) idMap.set(id, `obj_${Date.now()}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 5)}`);
    const copies: MapObject[] = [];
    for (const o of cur) {
      if (!copySet.has(o.id)) continue;
      const c = clone(o);
      c.id = idMap.get(o.id)!;
      c.label = makeLabel(o.kind);
      if (o.parentId && copySet.has(o.parentId)) c.parentId = idMap.get(o.parentId);
      else c.parentId = o.parentId;  // 최상위 — 부모는 원본과 동일. 위치 오프셋 0 (제자리).
      copies.push(c);
    }
    if (copies.length === 0) return;
    setObjects(prev => { const next = [...prev, ...copies]; pushHistory(next); return next; });
    // selectedId 는 변경 안 함 — 원본 그대로 (기즈모는 원본을 끌고감, 복제본은 제자리).
  }

  /** 오브젝트의 world matrix 계산 (조상을 재귀적으로 곱함).
   *  키프레임 미리보기 중(kfPreviews)이면 그 조상의 애니된 포즈를 로컬로 사용 → 부모 애니가 자식까지 전파됨. */
  function computeWorldMatrix(objId: string, allObjs: MapObject[]): THREE.Matrix4 {
    const obj = allObjs.find(o => o.id === objId);
    if (!obj) return new THREE.Matrix4();
    const pv = kfPreviews?.[objId];
    const pos = pv ? pv.p : obj.position;
    const rot = pv ? pv.r : obj.rotation;
    const scl = pv ? pv.s : obj.scale;
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'XYZ')),
      new THREE.Vector3(...scl),
    );
    if (obj.parentId) {
      return computeWorldMatrix(obj.parentId, allObjs).multiply(local);
    }
    return local;
  }

  // 평탄 렌더용 — 오브젝트의 월드 TRS 계산 (부모 체인 합성). empty 도 일반 자식처럼 부모를 따름.
  // spawn 은 플레이어 스폰 기준점이라 월드 절대값을 유지(부모 합성 X) → 플레이/시뮬의 스폰 위치와 일치.
  function worldTRSFor(o: MapObject): { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] } {
    // 키프레임 미리보기 중이면 그 포즈로 덮어씀 (재생/스크럽, 멀티 오브젝트). 부모 종속이면 부모 월드행렬과 합성.
    const _pv = kfPreviews?.[o.id];
    if (_pv) {
      if (o.parentId && o.kind !== 'spawn') {
        const pm = computeWorldMatrix(o.parentId, objects);
        applySampledTRS(_kfPreviewObj, { position: _pv.p, rotation: _pv.r, scale: _pv.s }, pm);
        const e = new THREE.Euler().setFromQuaternion(_kfPreviewObj.quaternion, 'XYZ');
        return { p: [_kfPreviewObj.position.x, _kfPreviewObj.position.y, _kfPreviewObj.position.z],
                 r: [e.x, e.y, e.z],
                 s: [_kfPreviewObj.scale.x, _kfPreviewObj.scale.y, _kfPreviewObj.scale.z] };
      }
      return { p: _pv.p, r: _pv.r, s: _pv.s };
    }
    if (!o.parentId || o.kind === 'spawn') {
      return { p: o.position, r: o.rotation, s: o.scale };
    }
    const m = computeWorldMatrix(o.id, objects);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return { p: [p.x, p.y, p.z], r: [e.x, e.y, e.z], s: [s.x, s.y, s.z] };
  }

  // 기즈모가 만든 월드 TRS 를 부모 기준 로컬로 변환해 저장 (평탄 렌더라 기즈모는 월드를 만짐)
  function worldTRSToLocal(id: string, w: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }): { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] } {
    const obj = objects.find(o => o.id === id);
    if (!obj || !obj.parentId || obj.kind === 'spawn') return w;
    const worldMat = new THREE.Matrix4().compose(
      new THREE.Vector3(w.p[0], w.p[1], w.p[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(w.r[0], w.r[1], w.r[2], 'XYZ')),
      new THREE.Vector3(w.s[0], w.s[1], w.s[2]),
    );
    const localMat = computeWorldMatrix(obj.parentId, objects).clone().invert().multiply(worldMat);
    const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3();
    localMat.decompose(lp, lq, ls);
    const le = new THREE.Euler().setFromQuaternion(lq, 'XYZ');
    return { p: [lp.x, lp.y, lp.z], r: [le.x, le.y, le.z], s: [ls.x, ls.y, ls.z] };
  }

  /** Collider 컴포넌트 "자동 맞춤" — 선택 오브젝트의 렌더 메시 로컬 경계를 측정해
      collider 크기(sizeX/Y/Z)에 기록. 측정은 오브젝트 자신의 TRS 를 제외한 로컬 단위
      (CuboidCollider args 와 같은 공간). 콜라이더 와이어프레임(__collider)은 제외. */
  function colliderAutoFit(compIdx: number) {
    if (!selectedId) return;
    let size: [number, number, number] = [1, 1, 1];
    let offset: [number, number, number] = [0, 0, 0];
    const scene = threeSceneRef.current;
    if (scene) {
      let group: THREE.Object3D | undefined;
      scene.traverse(o => { if (!group && o.userData?.id === selectedId) group = o; });
      if (group) {
        group.updateWorldMatrix(true, true);
        const inv = group.matrixWorld.clone().invert();
        const box = new THREE.Box3();
        const tmp = new THREE.Box3();
        const m = new THREE.Matrix4();
        group.traverse(child => {
          if (child.userData?.__collider) return;
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          if (!mesh.geometry.boundingBox) return;
          tmp.copy(mesh.geometry.boundingBox);
          m.multiplyMatrices(inv, mesh.matrixWorld);
          tmp.applyMatrix4(m);
          box.union(tmp);
        });
        if (!box.isEmpty()) {
          const s = box.getSize(new THREE.Vector3());
          const c = box.getCenter(new THREE.Vector3());
          const r  = (v: number) => Math.round(v * 1000) / 1000;
          const rs = (v: number) => Math.max(0.01, r(v));
          size = [rs(s.x), rs(s.y), rs(s.z)];
          offset = [r(c.x), r(c.y), r(c.z)]; // 지오메트리 중심 → 콜라이더가 메시에 정렬되도록
        }
      }
    }
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId) return o;
      const next = [...(o.components ?? [])];
      const cur = next[compIdx];
      if (!cur || cur.type !== 'collider') return o;
      next[compIdx] = { ...cur, props: { ...(cur.props ?? {}), sizeX: size[0], sizeY: size[1], sizeZ: size[2], offsetX: offset[0], offsetY: offset[1], offsetZ: offset[2] } };
      return { ...o, components: next };
    }));
    pushHistory(objects);
  }

  /** 부모 변경 (순환 방지). newParentId=null 이면 루트로 빼냄. */
  function reparentObject(childId: string, newParentId: string | null) {
    // 순환 방지
    const isDescendant = (targetId: string, ancestorId: string): boolean => {
      const obj = objects.find(o => o.id === targetId);
      if (!obj || !obj.parentId) return false;
      if (obj.parentId === ancestorId) return true;
      return isDescendant(obj.parentId, ancestorId);
    };
    if (newParentId && isDescendant(newParentId, childId)) return;

    const child = objects.find(o => o.id === childId);
    if (!child) return;

    // spawn 은 플레이어 스폰 기준점이라 hierarchical transform 무의미 — parentId 만 변경, world position 유지.
    // (empty 는 일반 오브젝트처럼 부모 공간 local 로 변환 → 아래 분기 사용)
    if (child.kind === 'spawn') {
      const worldMat = computeWorldMatrix(childId, objects);
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      const ws = new THREE.Vector3();
      worldMat.decompose(wp, wq, ws);
      const we = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
      setObjects(prev => {
        const next = prev.map(o => o.id === childId ? {
          ...o,
          parentId: newParentId ?? undefined,
          position: [wp.x, wp.y, wp.z] as [number,number,number],
          rotation: [we.x, we.y, we.z] as [number,number,number],
          scale:    [ws.x, ws.y, ws.z] as [number,number,number],
        } : o);
        pushHistory(next);
        return next;
      });
      return;
    }

    // 일반 오브젝트 + 조명 — 부모 공간 local 로 변환 (propagation 으로 부모 따라감)
    const childWorld = computeWorldMatrix(childId, objects);
    let localMat = childWorld.clone();
    if (newParentId) {
      const parentWorld = computeWorldMatrix(newParentId, objects);
      localMat = parentWorld.clone().invert().multiply(childWorld);
    }
    const lp = new THREE.Vector3();
    const lq = new THREE.Quaternion();
    const ls = new THREE.Vector3();
    localMat.decompose(lp, lq, ls);
    const le = new THREE.Euler().setFromQuaternion(lq, 'XYZ');

    setObjects(prev => {
      const next = prev.map(o => o.id === childId ? {
        ...o,
        parentId: newParentId ?? undefined,
        position: [lp.x, lp.y, lp.z] as [number,number,number],
        rotation: [le.x, le.y, le.z] as [number,number,number],
        scale:    [ls.x, ls.y, ls.z] as [number,number,number],
      } : o);
      pushHistory(next);
      return next;
    });
  }

  /** 트리에서 순서 변경 — dragged 를 target 의 형제로 만들어 앞/뒤에 배치.
   *  target 이 루트면 dragged 도 루트가 됨(= 자식 밖으로 빼기). 부모 바뀌면 world 좌표 유지. */
  function reorderObject(draggedId: string, targetId: string, pos: 'before' | 'after') {
    if (draggedId === targetId) return;
    const dragged = objects.find(o => o.id === draggedId);
    const target = objects.find(o => o.id === targetId);
    if (!dragged || !target) return;
    const newParentId = target.parentId ?? null;
    // 순환 방지: 새 부모가 dragged 의 자손이면 취소
    const isDescendant = (tid: string | null | undefined, anc: string): boolean => {
      let p = tid;
      while (p) { if (p === anc) return true; p = objects.find(o => o.id === p)?.parentId; }
      return false;
    };
    if (newParentId && isDescendant(newParentId, draggedId)) return;

    // 부모가 바뀌면 world 좌표 유지하도록 변환
    let patch: Partial<MapObject> = {};
    if ((dragged.parentId ?? null) !== newParentId) {
      const childWorld = computeWorldMatrix(draggedId, objects);
      if (dragged.kind === 'spawn') {
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        childWorld.decompose(wp, wq, ws);
        const we = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
        patch = { parentId: newParentId ?? undefined, position: [wp.x,wp.y,wp.z], rotation: [we.x,we.y,we.z], scale: [ws.x,ws.y,ws.z] };
      } else {
        let localMat = childWorld.clone();
        if (newParentId) localMat = computeWorldMatrix(newParentId, objects).clone().invert().multiply(childWorld);
        const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3();
        localMat.decompose(lp, lq, ls);
        const le = new THREE.Euler().setFromQuaternion(lq, 'XYZ');
        patch = { parentId: newParentId ?? undefined, position: [lp.x,lp.y,lp.z], rotation: [le.x,le.y,le.z], scale: [ls.x,ls.y,ls.z] };
      }
    }

    setObjects(prev => {
      const cur = prev.find(o => o.id === draggedId);
      if (!cur) return prev;
      const moved = { ...cur, ...patch };
      const without = prev.filter(o => o.id !== draggedId);
      const idx = without.findIndex(o => o.id === targetId);
      if (idx === -1) return prev;
      const insertIdx = pos === 'before' ? idx : idx + 1;
      const next = [...without.slice(0, insertIdx), moved, ...without.slice(insertIdx)];
      pushHistory(next);
      return next;
    });
  }

  /** 여러 오브젝트를 한 번에 newParentId 밑으로 — world 변환 보존, 한 번의 setObjects 로 처리.
   *  (트리에서 여러 개 선택 후 같이 드래그 이동할 때 사용. childIds 는 이미 "최상위"만 넘겨야 함) */
  function reparentMany(childIds: string[], newParentId: string | null) {
    const cur = objectsRef.current;
    const patches = new Map<string, Partial<MapObject>>();
    for (const childId of childIds) {
      const child = cur.find(o => o.id === childId);
      if (!child) continue;
      if (newParentId && (newParentId === childId || isDescendantOf(newParentId, childId, cur))) continue; // 순환 방지
      if ((child.parentId ?? null) === (newParentId ?? null)) continue; // 변화 없음
      if (child.kind === 'spawn') {
        const wm = computeWorldMatrix(childId, cur);
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        wm.decompose(wp, wq, ws);
        const we = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
        patches.set(childId, { parentId: newParentId ?? undefined, position: [wp.x,wp.y,wp.z], rotation: [we.x,we.y,we.z], scale: [ws.x,ws.y,ws.z] });
      } else {
        const childWorld = computeWorldMatrix(childId, cur);
        let localMat = childWorld.clone();
        if (newParentId) localMat = computeWorldMatrix(newParentId, cur).clone().invert().multiply(childWorld);
        const lp = new THREE.Vector3(), lq = new THREE.Quaternion(), ls = new THREE.Vector3();
        localMat.decompose(lp, lq, ls);
        const le = new THREE.Euler().setFromQuaternion(lq, 'XYZ');
        patches.set(childId, { parentId: newParentId ?? undefined, position: [lp.x,lp.y,lp.z], rotation: [le.x,le.y,le.z], scale: [ls.x,ls.y,ls.z] });
      }
    }
    if (patches.size === 0) return;
    setObjects(prev => {
      const next = prev.map(o => patches.has(o.id) ? { ...o, ...patches.get(o.id) } : o);
      pushHistory(next);
      return next;
    });
  }

  // 트리 가장자리 자동 스크롤 — 드래그 중 위/아래 끝 근처면 목록을 굴림
  const treeAutoScrollTick = () => {
    const el = treeScrollRef.current;
    if (el && treeScrollVel.current !== 0) el.scrollTop += treeScrollVel.current;
    treeScrollRAF.current = requestAnimationFrame(treeAutoScrollTick);
  };
  const stopTreeAutoScroll = () => {
    treeScrollVel.current = 0;
    if (treeScrollRAF.current != null) { cancelAnimationFrame(treeScrollRAF.current); treeScrollRAF.current = null; }
  };
  // 좌표로 드롭 대상 판정 (data 속성 히트테스트)
  const findTreeDropTarget = (x: number, y: number): { overId: string | null; overMode: 'reorder' | 'reparent' | null } => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return { overId: null, overMode: null };
    const strip = el.closest('[data-reorder-before]') as HTMLElement | null;
    if (strip) return { overId: strip.getAttribute('data-reorder-before'), overMode: 'reorder' };
    const row = el.closest('[data-node-id]') as HTMLElement | null;
    if (row) return { overId: row.getAttribute('data-node-id'), overMode: 'reparent' };
    return { overId: null, overMode: null };
  };
  // 노드에서 포인터 누름 → 드래그 후보 기록 (임계 이동 후 실제 드래그 시작)
  const onTreeNodePointerDown = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input')) return; // 아이콘/이름편집은 제외
    treeDragRef.current = { id, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId };
  };
  const onTreePointerMove = (e: React.PointerEvent) => {
    const d = treeDragRef.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
      d.active = true;
      try { treeScrollRef.current?.setPointerCapture(d.pointerId); } catch { /* noop */ }
    }
    const over = findTreeDropTarget(e.clientX, e.clientY);
    treeDragOverRef.current = over;
    setTreeDrag({ id: d.id, x: e.clientX, y: e.clientY, overId: over.overId, overMode: over.overMode });
    // 가장자리 자동 스크롤 — 포인터가 트리 가로 범위 안에 있을 때만 (뷰포트로 끌고 갈 땐 멈춤)
    const sc = treeScrollRef.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const edge = 52, maxV = 16, y = e.clientY;
      const overTreeX = e.clientX >= r.left && e.clientX <= r.right;
      if (overTreeX && y < r.top + edge)        treeScrollVel.current = -Math.ceil(((r.top + edge - y) / edge) * maxV);
      else if (overTreeX && y > r.bottom - edge) treeScrollVel.current = Math.ceil(((y - (r.bottom - edge)) / edge) * maxV);
      else treeScrollVel.current = 0;
      if (treeScrollRAF.current == null) treeScrollRAF.current = requestAnimationFrame(treeAutoScrollTick);
    }
  };
  const onTreePointerUp = (e: React.PointerEvent) => {
    const d = treeDragRef.current;
    treeDragRef.current = null;
    stopTreeAutoScroll();
    if (d && d.active) {
      try { treeScrollRef.current?.releasePointerCapture(d.pointerId); } catch { /* noop */ }
      const dragged = d.id;
      const overEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      // 인스펙터의 오브젝트 참조 변수 슬롯에 놓음 → 그 변수(컴포넌트 props)에 드래그한 오브젝트 지정
      const slotEl = overEl?.closest('[data-objvar]') as HTMLElement | null;
      if (slotEl) {
        const [objId, idxStr, key] = (slotEl.getAttribute('data-objvar') || '').split('|');
        const idx = Number(idxStr);
        if (objId && key && Number.isInteger(idx)) {
          setObjects(prev => {
            const next = prev.map(o => {
              if (o.id !== objId) return o;
              const comps = [...(o.components ?? [])];
              const comp = comps[idx];
              if (!comp) return o;
              comps[idx] = { ...comp, props: { ...(comp.props ?? {}), [key]: dragged } };
              return { ...o, components: comps };
            });
            pushHistory(next);
            return next;
          });
        }
        treeDragOverRef.current = { overId: null, overMode: null };
        setTreeDrag(null);
        return;
      }
      // 미디어 리모컨 target 리스트 슬롯에 놓음 → 그 컴포넌트의 target prop 에 토큰 추가
      const vrSlot = overEl?.closest('[data-videoremote-target]') as HTMLElement | null;
      if (vrSlot) {
        const [objId, idxStr] = (vrSlot.getAttribute('data-videoremote-target') || '').split('|');
        const idx = Number(idxStr);
        if (objId && Number.isInteger(idx)) {
          setObjects(prev => {
            const next = prev.map(o => {
              if (o.id !== objId) return o;
              const comps = [...(o.components ?? [])];
              const comp = comps[idx];
              if (!comp) return o;
              const cur = String(comp.props?.target ?? '').trim();
              const tokens = cur ? cur.split(/[,\s]+/).filter(Boolean) : [];
              if (tokens.includes(dragged)) return o;
              tokens.push(dragged);
              comps[idx] = { ...comp, props: { ...(comp.props ?? {}), target: tokens.join(', ') } };
              return { ...o, components: comps };
            });
            pushHistory(next);
            return next;
          });
        }
        treeDragOverRef.current = { overId: null, overMode: null };
        setTreeDrag(null);
        return;
      }
      // ── 멀티 이동 — 드래그한 게 현재 선택에 포함되면 선택된 "최상위"들을 다같이 이동 ──
      const selNow = selRef.current;
      const draggedInSel = dragged === selNow.sel || selNow.multi.has(dragged);
      if (draggedInSel && selNow.multi.size > 1) {
        const moveSet = new Set<string>([...selNow.multi, ...(selNow.sel ? [selNow.sel] : [])]);
        const cur = objectsRef.current;
        // 부모 체인에 선택된 다른 멤버가 있으면 제외 (그 부모가 옮겨질 때 자동으로 따라오므로)
        const roots = [...moveSet].filter(id => {
          let p = cur.find(o => o.id === id)?.parentId;
          while (p) { if (moveSet.has(p)) return false; p = cur.find(o => o.id === p)?.parentId; }
          return true;
        });
        if (roots.length > 1) {
          const vp2 = viewportRef.current;
          if (vp2 && overEl && vp2.contains(overEl)) {
            const targetId = pickObjectIdFromXY(e.clientX, e.clientY);
            reparentMany(roots, (targetId && !moveSet.has(targetId)) ? targetId : null);
          } else {
            const { overId, overMode } = treeDragOverRef.current;
            if (overMode === 'reparent' && overId && !moveSet.has(overId)) reparentMany(roots, overId);
            else if (overMode === 'reorder' && overId && !moveSet.has(overId)) reparentMany(roots, cur.find(o => o.id === overId)?.parentId ?? null);
            else if (!overMode) { const sc = treeScrollRef.current; if (sc && overEl && sc.contains(overEl)) reparentMany(roots, null); }
          }
          treeDragOverRef.current = { overId: null, overMode: null };
          setTreeDrag(null);
          return;
        }
      }
      const vp = viewportRef.current;
      if (vp && overEl && vp.contains(overEl)) {
        // 뷰포트 위에 놓음 → 그 3D 오브젝트의 자식으로 (빈 곳이면 루트)
        const targetId = pickObjectIdFromXY(e.clientX, e.clientY);
        if (targetId && targetId !== dragged) reparentObject(dragged, targetId);
        else if (!targetId) reparentObject(dragged, null);
      } else {
        const { overId, overMode } = treeDragOverRef.current;
        if (overMode === 'reorder' && overId && overId !== dragged) reorderObject(dragged, overId, 'before');
        else if (overMode === 'reparent' && overId && overId !== dragged) reparentObject(dragged, overId);
        else if (!overMode) {
          // 트리 빈 영역에 놓음 → 루트로 빼기
          const sc = treeScrollRef.current;
          if (sc && overEl && sc.contains(overEl)) reparentObject(dragged, null);
        }
      }
    }
    treeDragOverRef.current = { overId: null, overMode: null };
    setTreeDrag(null);
  };

  function updateObjectTransform(id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }, mode: 'translate' | 'rotate' | 'scale') {
    const start = dragStartRef.current;
    const primaryStart = start.get(id);

    // 기즈모 모드에 해당하는 축만 갱신한다. (위치 이동인데 회전·스케일까지 매 프레임
    // 월드→로컬 decompose 로 다시 쓰면, 비균등 스케일 부모 밑 자식에서 전단으로 스케일이
    // 부풀어 폭발함 → translate 는 position 만, rotate 는 rotation 만, scale 은 scale 만 쓴다.)
    if (!primaryStart || multiSelectedIds.size <= 1) {
      // 단일 선택
      setObjects(prev => prev.map(o => {
        if (o.id !== id) return o;
        if (mode === 'rotate') return { ...o, rotation: t.r };
        if (mode === 'scale')  return { ...o, scale: t.s };
        return { ...o, position: t.p };  // translate (기본)
      }));
      return;
    }

    // 부모와 자식이 동시에 선택됐을 때, 자식(=선택된 조상이 있는 것)에는 delta 를 또 주지 않는다.
    // 부모가 움직이면 자식은 부모 transform 전파로 따라오므로 — delta 까지 주면 2배로 움직임.
    const followers = new Set<string>();
    for (const sid of multiSelectedIds) {
      if (sid === id) continue;
      let p = objectsRef.current.find(o => o.id === sid)?.parentId;
      while (p) { if (multiSelectedIds.has(p)) { followers.add(sid); break; } p = objectsRef.current.find(o => o.id === p)?.parentId; }
    }

    // 다중 선택 — start 스냅샷 기준 delta 를, 해당 모드 축에만 적용
    setObjects(prev => prev.map(o => {
      if (o.id !== id && !multiSelectedIds.has(o.id)) return o;
      if (followers.has(o.id)) return o;   // 선택된 부모를 따라가는 자식 — 직접 이동 X
      const os = o.id === id ? primaryStart : start.get(o.id);
      if (!os) return o;
      if (mode === 'rotate') {
        const dr: [number,number,number] = [t.r[0]-primaryStart.r[0], t.r[1]-primaryStart.r[1], t.r[2]-primaryStart.r[2]];
        return { ...o, rotation: (o.id === id ? t.r : [os.r[0]+dr[0], os.r[1]+dr[1], os.r[2]+dr[2]]) as [number,number,number] };
      }
      if (mode === 'scale') {
        const ds: [number,number,number] = [
          primaryStart.s[0] !== 0 ? t.s[0]/primaryStart.s[0] : 1,
          primaryStart.s[1] !== 0 ? t.s[1]/primaryStart.s[1] : 1,
          primaryStart.s[2] !== 0 ? t.s[2]/primaryStart.s[2] : 1,
        ];
        return { ...o, scale: (o.id === id ? t.s : [os.s[0]*ds[0], os.s[1]*ds[1], os.s[2]*ds[2]]) as [number,number,number] };
      }
      const dp: [number,number,number] = [t.p[0]-primaryStart.p[0], t.p[1]-primaryStart.p[1], t.p[2]-primaryStart.p[2]];
      return { ...o, position: (o.id === id ? t.p : [os.p[0]+dp[0], os.p[1]+dp[1], os.p[2]+dp[2]]) as [number,number,number] };
    }));
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
    // 다중 선택이 있으면 전부, 없으면 primary 하나. (selRef = 키보드 핸들러에서도 최신값)
    // 부모를 지우면 자식도 같이 삭제 — 안 그러면 orphan(부모 없는 자식)이 돼 좌표가 깨짐.
    const { sel, multi } = selRef.current;
    const baseIds = multi.size > 0 ? [...multi] : sel ? [sel] : [];
    if (baseIds.length === 0) return;
    setObjects(prev => {
      const ids = new Set<string>(baseIds);
      for (const id of baseIds) for (const d of collectDescendants(id, prev)) ids.add(d);
      const next = prev.filter(o => !ids.has(o.id));
      pushHistory(next);
      return next;
    });
    setSelectedId(null);
    setMultiSelectedIds(new Set());
  }

  // 컴포넌트 추가 대상 — 다중 선택이면 전부, 없으면 primary 하나 (deleteSelected 와 동일 규약)
  function componentTargetIds(): Set<string> {
    const { sel, multi } = selRef.current;
    return new Set<string>(multi.size > 0 ? multi : sel ? [sel] : []);
  }
  // 선택된 오브젝트 전부에 컴포넌트 추가. build 는 오브젝트마다 새 인스턴스 생성.
  // skipIfHas=true 면 이미 같은 type 이 있는 오브젝트는 건너뜀(빌트인=유일). false 면 중복 허용(유저/공식).
  function addComponentToSelection(build: () => ComponentInstance, skipIfHas: boolean) {
    const ids = componentTargetIds();
    if (ids.size === 0) return;
    setObjects(prev => prev.map(o => {
      if (!ids.has(o.id)) return o;
      const inst = build();
      if (skipIfHas && (o.components ?? []).some(c => c.type === inst.type)) return o;
      return { ...o, components: [...(o.components ?? []), inst] };
    }));
    pushHistory(objects);
    setComponentPickerOpen(false);
    setComponentPickerSearch('');
  }
  // 스크립트 에셋을 컴포넌트 패널에 드롭 → ScriptComponent 로 가져온 뒤 선택 전체에 부착.
  // 이름이 같은 ScriptComponent 가 이미 라이브러리에 있으면 재사용 (간단 dedup).
  async function attachScriptAssetToSelection(assetId: string) {
    const asset = myAssets.find(a => a.id === assetId);
    devLog('[attachScriptAsset]', { assetId, found: !!asset, kind: asset?.kind, name: asset?.name, hasMeta: !!asset?.metadata });
    if (!asset) { console.warn('[attachScriptAsset] asset not in myAssets — id=', assetId); return; }
    if (asset.kind !== 'script') { console.warn('[attachScriptAsset] kind is', asset.kind, '— not script. Skip.'); return; }
    let comp = scriptComponents.find(c => c.name === asset.name);
    if (!comp) {
      const tok = token();
      if (!tok) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (asset.metadata ?? {}) as { code?: string; icon?: string; propsSchema?: any[] };
      try {
        const res = await api.createScriptComponent(tok, {
          name: asset.name,
          icon: meta.icon || '📜',
          description: '에셋에서 가져옴',
          code: meta.code || '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          propsSchema: (Array.isArray(meta.propsSchema) ? meta.propsSchema : []) as any,
        });
        comp = res.component;
        setScriptComponents(prev => [...prev, comp!]);
      } catch (e) {
        console.error('[attachScriptAsset] failed', e);
        return;
      }
    }
    const compId = comp.id;
    const propsSchema = comp.propsSchema ?? [];
    addComponentToSelection(() => {
      const initProps: Record<string, number | string | boolean> = {};
      propsSchema.forEach(p => { initProps[p.key] = p.default; });
      return { type: `user:${compId}` as ComponentType, props: initProps };
    }, false);
  }
  // 선택된 오브젝트가 "전부" 해당 컴포넌트를 가지고 있는지 (빌트인 버튼 비활성화 판단용)
  function allSelectedHaveComponent(type: string): boolean {
    const ids = componentTargetIds();
    if (ids.size === 0) return false;
    for (const id of ids) {
      const o = objects.find(x => x.id === id);
      if (!o?.components?.some(c => c.type === type)) return false;
    }
    return true;
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

      // 중력/점프력은 World Physics 컴포넌트가 소스 — 저장 시 sceneSettings 에 반영해 월드 플레이에 적용
      const sceneSettings = { lightAmbient, lightDir, skyEnabled, hdriPreset, hdriUrl, hdriBackground, hdriIntensity, exposure, gravityY: worldPhysics.gravity, jumpPower: worldPhysics.jumpPower };
      const payload: Record<string, unknown> = { name, description, mapData: { objects, sceneSettings }, isPublic, isGame, gameCharacter };
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
      // dirty 해제 — 현재 상태를 저장된 기준점으로 마킹
      setSavedKey(JSON.stringify({ name, objects, sceneSettings }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selected = objects.find(o => o.id === selectedId);
  const canUndo  = hist.idx > 0;
  const canRedo  = hist.idx < hist.stack.length - 1;

  // 조명 선택 시 transform 탭으로 자동 전환 (material/script 비활성이라 빈 화면 방지)
  useEffect(() => {
    if (!selected) return;
    const isLight = selected.kind === 'pointlight' || selected.kind === 'spotlight' || selected.kind === 'dirlight';
    if (isLight && inspTab !== 'transform') setInspTab('transform');
  }, [selected, inspTab]);

  // dirty — 현재 상태가 저장된 상태와 다른가
  const sceneSettingsForDirty = { lightAmbient, lightDir, skyEnabled, hdriPreset, hdriUrl, hdriBackground, hdriIntensity, exposure, gravityY, jumpPower };
  const currentKey = useMemo(
    () => JSON.stringify({ name, objects, sceneSettings: sceneSettingsForDirty }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, objects, lightAmbient, lightDir, skyEnabled, hdriPreset, hdriUrl, hdriBackground, exposure, gravityY, jumpPower],
  );
  const dirty = savedKey !== '' && currentKey !== savedKey;

  function openMyWorld(id: string) {
    setMyWorldsOpen(false);
    router.replace(`/studio?id=${id}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0f172a', overflow: 'hidden', fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif" }}>
      <StudioTopBar
        name={name}
        onNameChange={setName}
        savedId={savedId}
        dirty={dirty}
        saving={saving}
        onSave={save}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        simulating={simulating}
        onStartSim={startSim}
        onStopSim={stopSim}
        leftPanelOpen={leftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        onToggleLeft={() => isMobile ? setMobilePanelOpen(v => !v) : setLeftPanelOpen(v => !v)}
        onToggleRight={() => setRightPanelOpen(v => !v)}
        isMobile={isMobile}
        mapMenuOpen={mapMenuOpen}
        onToggleMapMenu={() => setMapMenuOpen(v => !v)}
      />

      {/* 맵 정보 드롭다운 — 헤더의 'ℹ️ 맵' 버튼으로 토글. 내맵/새월드/설명/공개. */}
      {mapMenuOpen && (
        <>
          <div onClick={() => setMapMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
          <div style={{
            position: 'fixed', top: 54, left: 12, width: 300, zIndex: 200,
            background: '#1e293b', border: '1px solid rgba(129,140,248,0.35)', borderRadius: 12,
            boxShadow: '0 14px 44px rgba(0,0,0,0.55)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{tCanvas("section_map_info")}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button onClick={() => { setMyWorldsOpen(true); setMapMenuOpen(false); }}
                style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(99,102,241,0.24)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🗺 {t('openMyWorlds')}
              </button>
              <button onClick={() => {
                // 같은 URL 이면 router.replace 가 navigation 을 skip → 강제 reload 로 state 완전 초기화.
                // 미저장 변경 안전장치: 변경 있으면 confirm.
                if (dirty && !window.confirm(t('confirmDiscardUnsaved'))) return;
                window.location.assign(window.location.pathname.replace(/\/studio.*/, '/studio'));
              }}
                style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(16,185,129,0.22)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ＋ {t('newWorldDefault')}
              </button>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.5, margin: '0 0 4px' }}>{t('inspDescription')}</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
                placeholder={t('inspDescPlaceholder')} rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 11, padding: '6px 10px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <button type="button" onClick={() => setIsPublic(v => !v)}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${isPublic ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.12)'}`,
                background: isPublic ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
                color: isPublic ? '#34d399' : 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {isPublic ? t('inspPublicYes') : t('inspPublicNo')}
            </button>

            {/* 게임으로 표시 — 목록에서 🎮 배지·게임 필터로 노출 */}
            <button type="button" onClick={() => setIsGame(v => !v)}
              title={t('isGameHint')}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${isGame ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
                background: isGame ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                color: isGame ? '#a5b4fc' : 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {isGame ? t('isGameYes') : t('isGameNo')}
            </button>

            {/* 게임 캐릭터 — 지정 시 입장한 모든 플레이어가 본인 아바타 대신 이 캐릭터로 플레이 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.5, margin: '0 0 4px' }}>🎮 {t('gameCharTitle')}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 6 }}>
                {gameCharacter ? t('gameCharUsing', { name: String(gameCharacter.name ?? '') }) : t('gameCharSelf')}
              </div>
              {myCharsForGame === null ? (
                <button type="button"
                  onClick={async () => {
                    try {
                      const r = await fetch(`${API}/api/characters`, { headers: { Authorization: `Bearer ${token()}` } });
                      const d = await r.json();
                      setMyCharsForGame(Array.isArray(d.characters) ? d.characters : []);
                    } catch { setMyCharsForGame([]); }
                  }}
                  style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  {t('gameCharPick')}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  <button type="button" onClick={() => { setGameCharacter(null); setMyCharsForGame(null); }}
                    style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 6, border: `1px solid ${!gameCharacter ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                    👤 {t('gameCharSelf')}
                  </button>
                  {myCharsForGame.map(c => (
                    <button key={c.id} type="button"
                      onClick={() => { setGameCharacter({ appearance: c.appearance, name: c.name }); setMyCharsForGame(null); }}
                      style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                      🎮 {c.name}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4 }}>{t('gameCharHint')}</div>
            </div>
          </div>
        </>
      )}
    <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', paddingRight: isMobile ? 0 : (rightPanelOpen ? inspectorWidth : 0) }}>

      {/* ── 좌측 패널 ── 항상 마운트, display 로만 토글 (mount/unmount race 회피).
          모바일에선 absolute 로 오버레이 ── */}
      <div style={{
        display: isMobile ? 'flex' : (leftPanelOpen ? 'flex' : 'none'),
        // 모바일: 하단 바텀시트(풀폭·58vh, 슬라이드업) — 위쪽 뷰포트 보임 / 데스크톱: 좌측 250px 컬럼
        transform: isMobile ? (mobilePanelOpen ? 'translateY(0)' : 'translateY(120%)') : undefined,
        transition: isMobile ? (leftSheet.dragging ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1), height 0.25s cubic-bezier(0.32,0.72,0,1)') : undefined,
        pointerEvents: isMobile && !mobilePanelOpen ? 'none' : undefined,
        width: isMobile ? '100%' : leftWidth,
        flexShrink: 0,
        background: isMobile ? '#172033' : '#1e293b',
        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderTop: isMobile ? '1px solid rgba(129,140,248,0.3)' : undefined,
        borderRadius: isMobile ? '20px 20px 0 0' : undefined,
        color: '#fff',
        flexDirection: 'column',
        overflowY: 'auto',    // 내부 섹션들이 합쳐서 패널보다 커지면 패널 자체가 세로 스크롤
        overflowX: 'hidden',
        position: isMobile ? 'absolute' : 'relative',
        left: isMobile ? 0 : undefined,
        right: isMobile ? 0 : undefined,
        top: isMobile ? 'auto' : undefined,
        bottom: isMobile ? 0 : undefined,
        height: isMobile ? `${leftSheet.heightVh}vh` : undefined,
        zIndex: isMobile ? 220 : 50,
        boxShadow: isMobile ? '0 -12px 40px rgba(0,0,0,0.55)' : undefined,
      }}>
      {/* 너비 리사이즈 핸들 (우측 가장자리 드래그) — 데스크톱만 */}
      {!isMobile && (
        <div
          onPointerDown={e => beginResize(e, { axis: 'x', from: leftWidth, dir: 1, min: 220, max: 600, set: setLeftWidth })}
          title={tCanvas("tooltip_drag_panel_width")}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 7, cursor: 'ew-resize', zIndex: 4 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.35)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        />
      )}
      {/* 데스크톱 전용 패널 닫기 버튼 (우측 상단 corner) */}
      {!isMobile && (
        <button type="button" onClick={() => { devLog('[CLOSE-LEFT] click'); setLeftPanelOpen(false); }}
          title={tCanvas("tooltip_close_panel")}
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 5,
            width: 22, height: 22, border: 'none', borderRadius: 4,
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
            fontSize: 11, cursor: 'pointer', fontWeight: 700,
          }}>
          ◀
        </button>
      )}
      {/* 모바일 바텀시트 헤더 — 그립 핸들(드래그로 높이조절) + 제목 + 닫기 (sticky) */}
      {isMobile && (
        <div {...leftSheet.gripHandlers} style={{
          position: 'sticky', top: 0, zIndex: 6, flexShrink: 0,
          background: '#172033', borderRadius: '20px 20px 0 0',
          padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          touchAction: 'none', cursor: 'grab',
        }}>
          <div style={{ width: 40, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.28)', margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{t('scSceneObjects')}</span>
            <button
              type="button"
              onClick={() => setMobilePanelOpen(false)}
              aria-label={t('mobileDel')}
              style={{ border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, width: 36, height: 36, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* 맵 정보(내맵/새월드/설명/공개)는 상단 헤더의 'ℹ️ 맵' 드롭다운으로 이동됨 (아래 mapMenuOpen) */}
      {loadError && (
        <div style={{ margin: '8px 10px 0', padding: 8, background: 'rgba(239,68,68,0.15)', borderRadius: 6, fontSize: 11, color: '#fca5a5', flexShrink: 0 }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* 좌측 패널 탭 — 한 컬럼에 다 쌓지 않고 전환 (씬=트리+추가 / 환경 / 프리팹) */}
      {!isMobile && (
        <div style={{ display: 'flex', gap: 3, padding: '6px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {([['scene', tCanvas("tab_scene")], ['env', tCanvas("tab_env")], ['prefab', tCanvas("tab_prefab")]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setLeftTab(id)}
              style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: leftTab === id ? 'rgba(99,102,241,0.28)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${leftTab === id ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 6, color: leftTab === id ? '#c7d2fe' : 'rgba(255,255,255,0.5)' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── 씬 계층 ── 좌측 패널 메인 영역. minHeight 로 너무 작아지지 않게 보장. */}
      <div style={{ display: (!isMobile && leftTab !== 'scene') ? 'none' : 'flex', flexDirection: 'column', flex: 1, minHeight: 320 }}>
        <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, letterSpacing: 0.5 }}>{t('scSceneObjects')}</span>
          <span style={{ fontSize: 10, opacity: 0.35, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '1px 7px' }}>{objects.length}</span>
        </div>
        <div style={{ padding: '0 10px 6px', flexShrink: 0 }}>
          <input
            value={sceneSearch}
            onChange={e => setSceneSearch(e.target.value)}
            placeholder={t('scSearch')}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: 11, padding: '5px 8px', outline: 'none', marginBottom: 4 }}
          />
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {(['all','shapes','lights','assets','scripted'] as const).map(f => (
              <button
                key={f}
                onClick={() => setSceneFilter(f)}
                style={{
                  background: sceneFilter === f ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${sceneFilter === f ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 999, color: sceneFilter === f ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', cursor: 'pointer',
                }}
              >
                {t(`scFilter${f.charAt(0).toUpperCase() + f.slice(1)}` as 'scFilterAll' | 'scFilterShapes' | 'scFilterLights' | 'scFilterAssets' | 'scFilterScripted')}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={treeScrollRef}
          onPointerMove={onTreePointerMove}
          onPointerUp={onTreePointerUp}
          onPointerCancel={() => { treeDragRef.current = null; stopTreeAutoScroll(); treeDragOverRef.current = { overId: null, overMode: null }; setTreeDrag(null); }}
          onContextMenu={e => { e.preventDefault(); setTreeCtxMenu({ x: e.clientX, y: e.clientY, objId: null }); }}
          style={{ overflowY: 'auto', flex: 1, padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          {(() => {
            const q = sceneSearch.trim().toLowerCase();
            const matchesFilter = (o: MapObject): boolean => {
              if (sceneFilter === 'shapes')   return o.kind === 'cube' || o.kind === 'sphere' || o.kind === 'cylinder' || o.kind === 'plane';
              if (sceneFilter === 'lights')   return o.kind === 'pointlight' || o.kind === 'spotlight' || o.kind === 'dirlight';
              if (sceneFilter === 'assets')   return o.kind === 'asset';
              if (sceneFilter === 'scripted') return !!o.script;
              return true;
            };
            const matchesSearch = (o: MapObject): boolean => {
              if (!q) return true;
              const label = (o.label || '').toLowerCase();
              const kind  = (o.kind  || '').toLowerCase();
              return label.includes(q) || kind.includes(q);
            };
            const filtering = !!q || sceneFilter !== 'all';
            const rootObjs = filtering
              ? objects.filter(o => matchesFilter(o) && matchesSearch(o))
              : objects.filter(o => !o.parentId);
            if (objects.length === 0) {
              return <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', paddingTop: 20 }}>{t('scEmpty')}</div>;
            }
            if (rootObjs.length === 0) {
              return <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', paddingTop: 20 }}>{t('scNoMatch')}</div>;
            }
            return (
              <TreeCollapseCtx.Provider value={{ collapsed: collapsedNodes, toggle: toggleCollapse }}>
              {rootObjs.map(obj => (
              <SceneListNode key={obj.id} obj={obj} allObjects={objects} depth={0}
                selectedId={selectedId} multiSelectedIds={multiSelectedIds}
                editingLabelId={editingLabelId} editingLabelValue={editingLabelValue}
                setEditingLabelId={setEditingLabelId} setEditingLabelValue={setEditingLabelValue}
                setObjects={setObjects} pushHistory={pushHistory}
                dragActive={!!treeDrag}
                overId={treeDrag?.overId ?? null}
                overMode={treeDrag?.overMode ?? null}
                onNodePointerDown={onTreeNodePointerDown}
                onFocusObject={focusObject}
                onContextMenu={(objId, x, y) => setTreeCtxMenu({ x, y, objId })}
                selectedCallback={id => {
                  if (ctrlHeldRef.current) {
                    // Ctrl+클릭 — 토글 선택 (개별 추가/제거)
                    shiftClickObject(id);
                  } else if (shiftHeldRef.current) {
                    rangeSelectObject(id);
                  } else {
                    setStudioMode('scene');
                    rangeAnchorRef.current = id; // 다음 Shift+클릭의 범위 시작점
                    setMultiSelectedIds(new Set());
                    setSelectedId(id);
                  }
                }}
              />
            ))}
              </TreeCollapseCtx.Provider>
            );
          })()}
        </div>
      </div>

      {/* ── 추가 버튼 (좌측 하단 고정) ── 자기 컨텐츠 크기 유지, 넘치면 자체 스크롤.
          씬 트리 보장은 위 minHeight: 180 으로 처리됨. */}
      <div style={{ flexShrink: 0, borderTop: (!isMobile && leftTab !== 'scene') ? 'none' : '1px solid rgba(255,255,255,0.08)', padding: '8px 10px 10px', maxHeight: '65vh', overflowY: 'auto' }}>
        {/* ── 레이어 가시성 토글 (유니티 식) — 씬 탭에서만 표시 ── */}
        <div style={{ display: (!isMobile && leftTab !== 'scene') ? 'none' : 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: '0 0 6px 2px' }}>{tCanvas("section_layers")}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {[0,1,2,3,4,5,6,7,8,9].map(n => {
              const on = visibleLayers.has(n);
              return (
                <button key={n} type="button" onClick={() => toggleLayer(n)}
                  title={`Ctrl+${n} — ${tCanvas("tooltip_layer_assign")}`}
                  style={{ background: on ? LAYER_COLORS[n] : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? LAYER_COLORS[n] : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: on ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, padding: '4px 0', cursor: 'pointer', opacity: on ? 1 : 0.5 }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        {/* '추가' 그룹 — 씬 탭에서만 (도형/스폰/빈/조명, 일관 스타일) */}
        <div style={{ display: (!isMobile && leftTab !== 'scene') ? 'none' : 'block' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', margin: '0 0 6px 2px' }}>{tCanvas("section_add")}</div>
        <button type="button" onClick={() => setShapePanelOpen(v => !v)}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
          📦 {t('addShape')} {shapePanelOpen ? '▲' : '▼'}
        </button>
        {shapePanelOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 5 }}>
            {([['cube','📦','shapeCube'],['sphere','⚪','shapeSphere'],['cylinder','🥫','shapeCylinder'],['plane','▭','shapePlane']] as const).map(([kind, icon, labelKey]) => (
              <button key={kind} onClick={() => addPrimitive(kind)}
                draggable
                onDragStart={e => { e.dataTransfer.setData('application/x-alp-shape', kind); e.dataTransfer.effectAllowed = 'copy'; }}
                title={tCanvas("tooltip_drag_shape_to_viewport")}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'grab' }}>
                {icon} {t(labelKey)}
              </button>
            ))}
          </div>
        )}
        {/* 🎯 스폰 포인트 추가 — 월드 진입 시 플레이어가 여기서 등장. 여러 개 가능 (랜덤 선택). */}
        <button type="button" onClick={addSpawn}
          title={tCanvas("tooltip_add_spawn")}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
          {tCanvas("btn_add_spawn")}
        </button>
        {/* 🔵 빈 오브젝트 추가 — World Physics(중력/점프력) 컴포넌트 홀더 (기본 부착). */}
        <button type="button" onClick={addEmpty}
          title={tCanvas("tooltip_add_empty")}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
          🔵 {t('addEmpty')}
        </button>
        <button type="button" onClick={() => setLightAddPanelOpen(v => !v)}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 600 }}>
          {tCanvas("btn_add_light_2", { arrow: lightAddPanelOpen ? '▲' : '▼' })}
        </button>
        {lightAddPanelOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginTop: 4 }}>
            <button onClick={() => addLight('pointlight')}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              {tCanvas("btn_light_point")}
            </button>
            <button onClick={() => addLight('spotlight')}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              {tCanvas("btn_light_spot")}
            </button>
            <button onClick={() => addLight('dirlight')}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              {tCanvas("btn_light_dir")}
            </button>
          </div>
        )}
        {/* 🗻 Terrain 추가 — heightmap 기반 지면. flat (평탄) 또는 noise (자연스러운 언덕) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginTop: 4 }}>
          <button onClick={() => addTerrain('flat')} title={tCanvas("tooltip_add_terrain_flat")}
            style={{ background: 'rgba(132,204,22,0.14)', border: '1px solid rgba(132,204,22,0.45)', borderRadius: 5, color: '#d9f99d', fontSize: 10, padding: '6px 4px', cursor: 'pointer', fontWeight: 700 }}>
            {tCanvas("btn_add_terrain_flat")}
          </button>
          <button onClick={() => addTerrain('noise')} title={tCanvas("tooltip_add_terrain_noise")}
            style={{ background: 'rgba(132,204,22,0.14)', border: '1px solid rgba(132,204,22,0.45)', borderRadius: 5, color: '#d9f99d', fontSize: 10, padding: '6px 4px', cursor: 'pointer', fontWeight: 700 }}>
            {tCanvas("btn_add_terrain_noise")}
          </button>
          <button onClick={() => addVoxel('noise')} title={tCanvas("tooltip_add_voxel")}
            style={{ background: 'rgba(180,120,80,0.18)', border: '1px solid rgba(180,120,80,0.5)', borderRadius: 5, color: '#f0d0b0', fontSize: 10, padding: '6px 4px', cursor: 'pointer', fontWeight: 700 }}>
            {tCanvas("btn_add_voxel")}
          </button>
          <button onClick={() => addVoxel('solid')} title={tCanvas("tooltip_add_voxel_rock")}
            style={{ background: 'rgba(180,120,80,0.18)', border: '1px solid rgba(180,120,80,0.5)', borderRadius: 5, color: '#f0d0b0', fontSize: 10, padding: '6px 4px', cursor: 'pointer', fontWeight: 700 }}>
            {tCanvas("btn_add_voxel_rock")}
          </button>
        </div>
        {/* 🌊 물(바다/호수) 추가 — 반투명 수면 + 웨이브 */}
        <button type="button" onClick={addWater} title={tCanvas("tooltip_add_water")}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.45)', borderRadius: 6, color: '#bae6fd', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 700, marginTop: 4 }}>
          {tCanvas("btn_add_water")}
        </button>
        <button type="button" onClick={addSound}
          title={tCanvas("tooltip_add_sound")}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.45)', borderRadius: 6, color: '#e9d5ff', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 700, marginTop: 4 }}>
          {tCanvas("btn_add_sound")}
        </button>
        {/* 🖼 UI 추가 — 유니티식 Canvas + Image/Text/Button/Panel (Phase 1: Screen Space 만) */}
        <button type="button" onClick={() => setUiAddPanelOpen(v => !v)}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.8)', fontSize: 11, padding: '6px 9px', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>
          {tCanvas("btn_add_ui_2", { arrow: uiAddPanelOpen ? '▲' : '▼' })}
        </button>
        {uiAddPanelOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginTop: 4 }}>
            <button onClick={() => addUi('canvas', 'screen')} title={tCanvas("tooltip_ui_screen_canvas")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              🖥 Screen Canvas
            </button>
            <button onClick={() => addUi('canvas', 'world')} title={tCanvas("tooltip_ui_world_canvas")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              🌍 World Canvas
            </button>
            <button onClick={() => addUi('panel')} title={tCanvas("tooltip_ui_panel")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              🟦 Panel
            </button>
            <button onClick={() => addUi('image')} title={tCanvas("tooltip_ui_image")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              🖼 Image
            </button>
            <button onClick={() => addUi('text')} title={tCanvas("tooltip_ui_text")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              📝 Text
            </button>
            <button onClick={() => addUi('button')} title={tCanvas("tooltip_ui_button")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer', gridColumn: 'span 2' }}>
              🔘 Button
            </button>
            <button onClick={() => addUi('slider')} title={tCanvas("tooltip_ui_slider")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              🎚 Slider
            </button>
            <button onClick={() => addUi('input')} title={tCanvas("tooltip_ui_input")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              ⌨ Input
            </button>
            <button onClick={() => addUi('toggle')} title={tCanvas("tooltip_ui_toggle")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              ☑ Toggle
            </button>
            <button onClick={() => addUi('scrollview')} title={tCanvas("tooltip_ui_scroll")}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
              📜 Scroll
            </button>
            <button onClick={() => { setUiJsonText(''); setUiJsonError(null); setUiJsonModalOpen(true); }} title={tCanvas("tooltip_ai_ui_json")}
              style={{ background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.5)', borderRadius: 5, color: '#e9d5ff', fontSize: 10, padding: '5px 3px', cursor: 'pointer', gridColumn: 'span 2', fontWeight: 700 }}>
              {tCanvas("btn_ai_json_import")}
            </button>
          </div>
        )}
        </div>{/* /추가 그룹 (씬 탭) */}

        {/* 환경 (Sky / HDRI / Ambient) — 환경 탭에서만 */}
        <div style={{
          display: (!isMobile && leftTab !== 'env') ? 'none' : 'block',
          marginTop: (!isMobile) ? 0 : 10,
          borderTop: (!isMobile) ? 'none' : '1px solid rgba(255,255,255,0.08)',
          paddingTop: (!isMobile) ? 0 : 8,
        }}>
          <button type="button" onClick={() => setEnvPanelOpen(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '4px 0', cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{tCanvas("section_env_hdri")}</span>
            <span>{envPanelOpen ? '▲' : '▼'}</span>
          </button>
          {envPanelOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {/* Sky 토글 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.8, cursor: 'pointer' }}>
                <input type="checkbox" checked={skyEnabled}
                  onChange={e => { setSkyEnabled(e.target.checked); pushHistory(objects); }} />
                {tCanvas("label_sky_toggle")}
              </label>

              {/* HDRI preset */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("label_hdri_preset")}
                <select value={hdriPreset}
                  onChange={e => { setHdriPreset(e.target.value as HdriPreset); pushHistory(objects); }}
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 5, padding: '5px 7px', fontSize: 11, outline: 'none' }}>
                  <option value="none">{tCanvas("opt_none")}</option>
                  <option value="apartment">apartment</option>
                  <option value="city">city</option>
                  <option value="dawn">dawn</option>
                  <option value="forest">forest</option>
                  <option value="lobby">lobby</option>
                  <option value="night">night</option>
                  <option value="park">park</option>
                  <option value="studio">studio</option>
                  <option value="sunset">sunset</option>
                  <option value="warehouse">warehouse</option>
                </select>
              </label>

              {/* HDRI URL (커스텀) — preset 보다 우선 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("label_hdri_url")}
                <input type="text" value={hdriUrl}
                  onChange={e => setHdriUrl(e.target.value)}
                  onBlur={() => pushHistory(objects)}
                  placeholder={tCanvas("placeholder_hdri_url")}
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 5, padding: '5px 7px', fontSize: 11, outline: 'none' }} />
              </label>

              {/* HDRI 를 배경으로도 표시 */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.8, cursor: 'pointer' }}>
                <input type="checkbox" checked={hdriBackground}
                  onChange={e => { setHdriBackground(e.target.checked); pushHistory(objects); }} />
                {tCanvas("label_hdri_background")}
              </label>

              {/* 노출 (tone mapping exposure) */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("exposure_label", { exposure: exposure.toFixed(2) })}
                <input type="range" min={0.1} max={2} step={0.05} value={exposure}
                  onChange={e => setExposure(Number(e.target.value))}
                  onMouseUp={() => pushHistory(objects)}
                  style={{ accentColor: '#fb923c' }} />
                <span style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>
                  {tCanvas("hint_exposure")}
                </span>
              </label>

              {/* HDRI 환경광(IBL) 강도 — Ambient/태양광 슬라이더와는 별개. HDRI 가 머티리얼에 주는 빛 세기. */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("hdri_intensity_label", { hdriIntensity: hdriIntensity.toFixed(2) })}
                <input type="range" min={0} max={3} step={0.05} value={hdriIntensity}
                  onChange={e => setHdriIntensity(Number(e.target.value))}
                  onMouseUp={() => pushHistory(objects)}
                  style={{ accentColor: '#22d3ee' }} />
                <span style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>
                  {tCanvas("hint_hdri_intensity")}
                </span>
              </label>

              {/* Ambient light 강도 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("ambient_strength_label", { lightAmbient: lightAmbient.toFixed(2) })}
                <input type="range" min={0} max={2} step={0.05} value={lightAmbient}
                  onChange={e => setLightAmbient(Number(e.target.value))}
                  onMouseUp={() => pushHistory(objects)}
                  style={{ accentColor: '#a5b4fc' }} />
              </label>

              {/* Directional light 강도 */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.75 }}>
                {tCanvas("sun_strength_label", { lightDir: lightDir.toFixed(2) })}
                <input type="range" min={0} max={5} step={0.1} value={lightDir}
                  onChange={e => setLightDir(Number(e.target.value))}
                  onMouseUp={() => pushHistory(objects)}
                  style={{ accentColor: '#fbbf24' }} />
              </label>
            </div>
          )}
        </div>

        {/* 프리팹 라이브러리 — 프리팹 탭에서만 */}
        <div style={{
          display: (!isMobile && leftTab !== 'prefab') ? 'none' : 'block',
          marginTop: (!isMobile) ? 0 : 10,
          borderTop: (!isMobile) ? 'none' : '1px solid rgba(255,255,255,0.08)',
          paddingTop: (!isMobile) ? 0 : 8,
        }}>
          <button type="button" onClick={() => setPrefabPanelOpen(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '4px 0', cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{tCanvas("section_prefabs", { count: prefabs.length })}</span>
            <span>{prefabPanelOpen ? '▲' : '▼'}</span>
          </button>
          {prefabPanelOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
              {prefabsLoading && (
                <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center', padding: '6px 0' }}>{tCanvas("msg_loading")}</div>
              )}
              {!prefabsLoading && prefabs.length === 0 && (
                <div style={{ fontSize: 10, opacity: 0.35, textAlign: 'center', padding: '6px 0', lineHeight: 1.4 }}>
                  {tCanvas("prefab_empty_hint")}
                </div>
              )}
              {prefabs.map(pf => (
                <div key={pf.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('application/x-alp-prefab', pf.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 6px', cursor: 'grab' }}
                  title={tCanvas("tooltip_drag_prefab_to_viewport")}
                >
                  {/* 썸네일 — 저장 시 자동 캡처. 없으면 📦 */}
                  <div
                    style={{
                      width: 32, height: 32, flexShrink: 0, borderRadius: 4,
                      background: pf.thumbnailUrl
                        ? `url(${pf.thumbnailUrl}) center/cover`
                        : 'rgba(99,102,241,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {!pf.thumbnailUrl && '📦'}
                  </div>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{pf.name}</span>
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); removePrefab(pf.id); }}
                    title={tCanvas("btn_delete")}
                    style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.7)', fontSize: 11, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={() => setAiGuideOpen(true)}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#a5b4fc', fontSize: 11, padding: '6px 8px', cursor: 'pointer', fontWeight: 700, marginTop: 6 }}>
          {tCanvas("btn_ai_make_map")}
        </button>
        <button type="button" onClick={() => setShortcutsOpen(true)}
          style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 11, padding: '6px 8px', cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>
          {t('shortcutsButton')}
        </button>
        {/* 그림자 캐스팅 조명이 많으면 WebGL 한계 초과 — 한 번에 OFF */}
        {(() => {
          const shadowLightCount = objects.filter(o =>
            (o.kind === 'pointlight' || o.kind === 'spotlight' || o.kind === 'dirlight') && (o.castShadow ?? false)
          ).length;
          if (shadowLightCount < 5) return null;
          return (
            <button type="button"
              onClick={() => {
                setObjects(prev => {
                  const next = prev.map(o =>
                    (o.kind === 'pointlight' || o.kind === 'spotlight' || o.kind === 'dirlight')
                      ? { ...o, castShadow: false }
                      : o
                  );
                  pushHistory(next);
                  return next;
                });
              }}
              title={tCanvas("tooltip_webgl_shadow_limit")}
              style={{ width: '100%', textAlign: 'left', background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 6, color: '#fbbf24', fontSize: 10, padding: '6px 8px', cursor: 'pointer', fontWeight: 700, marginTop: 4 }}>
              {tCanvas("btn_shadow_lights_off", { count: shadowLightCount })}
            </button>
          );
        })()}
      </div>
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

      {/* ── 우측 패널: 인스펙터 — 항상 마운트, display 로만 토글.
          position:absolute 로 부모 우측에 핀 (flex order 트릭 의존 X) ── */}
      <div style={{
        display: isMobile ? 'flex' : (rightPanelOpen ? 'flex' : 'none'),
        // 모바일: 하단 바텀시트(풀폭·58vh, 슬라이드업) / 데스크톱: 우측 300px 컬럼
        transform: isMobile ? ((rightPanelOpen && selectedId) ? 'translateY(0)' : 'translateY(120%)') : undefined,
        transition: isMobile ? (rightSheet.dragging ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1), height 0.25s cubic-bezier(0.32,0.72,0,1)') : undefined,
        pointerEvents: isMobile && !(rightPanelOpen && selectedId) ? 'none' : undefined,
        position: 'absolute',
        right: 0,
        top: isMobile ? 'auto' : 0,
        bottom: 0,
        left: isMobile ? 0 : undefined,
        width: isMobile ? '100%' : inspectorWidth,
        height: isMobile ? `${rightSheet.heightVh}vh` : undefined,
        background: isMobile ? '#172033' : '#1e293b',
        borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderTop: isMobile ? '1px solid rgba(129,140,248,0.3)' : undefined,
        borderRadius: isMobile ? '20px 20px 0 0' : undefined,
        color: '#fff',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'inherit',
        boxShadow: isMobile ? '0 -12px 40px rgba(0,0,0,0.55)' : undefined,
        zIndex: isMobile ? 216 : 50,
      }}>
        {/* 데스크톱 전용 — 좌측 가장자리 resize 핸들 (드래그로 너비 조정).
            6px 폭 좁은 띠 + 호버 시 보라색 강조. pointer capture 로 윈도우 밖도 추적. */}
        {!isMobile && (
          <div
            onPointerDown={onInspectorResizeDown}
            onPointerMove={onInspectorResizeMove}
            onPointerUp={onInspectorResizeUp}
            onPointerCancel={onInspectorResizeUp}
            title={tCanvas("tooltip_drag_inspector_width")}
            style={{
              position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, zIndex: 6,
              cursor: 'ew-resize', background: 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(129,140,248,0.45)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          />
        )}
        {/* 데스크톱 전용 패널 닫기 버튼 (좌측 상단 corner) */}
        {!isMobile && (
          <button type="button" onClick={() => { devLog('[CLOSE-RIGHT] click'); setRightPanelOpen(false); }}
            title={tCanvas("tooltip_close_panel")}
            style={{
              position: 'absolute', top: 6, left: 6, zIndex: 5,
              width: 22, height: 22, border: 'none', borderRadius: 4,
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
              fontSize: 11, cursor: 'pointer', fontWeight: 700,
            }}>
            ▶
          </button>
        )}
        {/* 모바일 바텀시트 헤더 — 그립 핸들(드래그로 높이조절) + 선택 오브젝트명 + 닫기 */}
        {isMobile && (
          <div {...rightSheet.gripHandlers} style={{
            flexShrink: 0, background: '#172033', borderRadius: '20px 20px 0 0',
            padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)',
            touchAction: 'none', cursor: 'grab',
          }}>
            <div style={{ width: 40, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.28)', margin: '0 auto 10px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected ? `${KIND_ICONS[selected.kind] ?? ''} ${selected.label || selected.kind}` : ''}
              </span>
              <button
                type="button"
                onClick={() => { setSelectedId(null); setMultiSelectedIds(new Set()); }}
                style={{ flexShrink: 0, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 999, width: 36, height: 36, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {/* 씬 트리 + 추가 버튼은 좌측 패널로 이동됨 — 우측은 인스펙터 전용 */}
        {/* ── 인스펙터 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {!selected ? (
            <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', paddingTop: 32 }}>
              {t('inspSelect')}
            </div>
          ) : selected.kind === 'sound' ? (
            <>
              {!isMobile && (
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 8, letterSpacing: 0.5 }}>
                  🔊 {selected.label || 'sound'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_audio_url")}</div>
                  <input type="text" value={selected.soundUrl || ''}
                    placeholder="https://... .mp3"
                    onChange={e => {
                      const u = e.target.value;
                      setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, soundUrl: u } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("sound_volume_label", { volume: (selected.soundVolume ?? 0.8).toFixed(2) })}</div>
                  <input type="range" min={0} max={1} step={0.05} value={selected.soundVolume ?? 0.8}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, soundVolume: v } : o));
                    }}
                    onMouseUp={() => pushHistory(objects)} onTouchEnd={() => pushHistory(objects)}
                    style={{ width: '100%' }} />
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_audible_radius")}</div>
                  <input type="number" min={0} max={500} step={1} value={selected.soundRadius ?? 10}
                    onChange={e => {
                      const r = Math.max(0, Math.min(500, Number(e.target.value) || 0));
                      setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, soundRadius: r } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.soundLoop !== false}
                    onChange={e => {
                      setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, soundLoop: e.target.checked } : o));
                      pushHistory(objects);
                    }} /> {tCanvas("label_sound_loop")}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.soundAutoplay !== false}
                    onChange={e => {
                      setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, soundAutoplay: e.target.checked } : o));
                      pushHistory(objects);
                    }} /> {tCanvas("label_sound_autoplay")}
                </label>
                <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4 }}>
                  {tCanvas("hint_sound_3d")}
                </div>
              </div>
            </>
          ) : selected.kind === 'terrain' && selected.terrain ? (
            <>
              {!isMobile && (
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 8, letterSpacing: 0.5 }}>
                  🗻 {selected.label || 'terrain'}
                </div>
              )}
              {/* Terrain 인스펙터 — size, segments, baseColor, textureUrl + 재생성 (flat/noise) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_terrain_size")}</div>
                  <input type="number" min={5} max={500} step={5} value={selected.terrain.size}
                    onChange={e => {
                      const sz = Math.max(5, Math.min(500, Number(e.target.value) || 50));
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, size: sz } } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_terrain_segments")}</div>
                  <input type="number" min={8} max={256} step={8} value={selected.terrain.segments}
                    onChange={e => {
                      const seg = Math.max(8, Math.min(256, Math.floor(Number(e.target.value) || 64)));
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, segments: seg, heights: new Array((seg + 1) * (seg + 1)).fill(0) } } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                  <div style={{ fontSize: 10, opacity: 0.45, marginTop: 3 }}>{tCanvas("hint_terrain_segments_reset")}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_terrain_base_color")}</div>
                  <input type="color" value={selected.terrain.baseColor || '#5a8a4a'}
                    onChange={e => {
                      const c = e.target.value;
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, baseColor: c } } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: 60, height: 28, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_terrain_texture_url")}</div>
                  <input type="text" value={selected.terrain.textureUrl || ''}
                    placeholder="https://... .jpg/.png"
                    onChange={e => {
                      const u = e.target.value;
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, textureUrl: u } } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ opacity: 0.65, marginBottom: 4 }}>{tCanvas("label_terrain_texture_repeat")}</div>
                  <input type="number" min={1} max={64} step={1} value={selected.terrain.textureRepeat ?? 8}
                    onChange={e => {
                      const r = Math.max(1, Math.min(64, Math.floor(Number(e.target.value) || 8)));
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, textureRepeat: r } } : o));
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ opacity: 0.7, fontSize: 11, fontWeight: 700 }}>{tCanvas("section_terrain_regenerate")}</div>
                  <button type="button"
                    onClick={() => {
                      const cur = selected.terrain!;
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, heights: new Array((cur.segments + 1) * (cur.segments + 1)).fill(0) } } : o));
                      pushHistory(objects);
                    }}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    {tCanvas("btn_terrain_flatten")}
                  </button>
                  <button type="button"
                    onClick={() => {
                      const cur = selected.terrain!;
                      const next = generateNoiseTerrain(cur.size, cur.segments, 4, 0.05, Math.floor(Math.random() * 1000));
                      setObjects(prev => prev.map(o => o.id === selected.id && o.terrain
                        ? { ...o, terrain: { ...o.terrain, heights: next.heights } } : o));
                      pushHistory(objects);
                    }}
                    style={{ background: 'rgba(132,204,22,0.18)', border: '1px solid rgba(132,204,22,0.4)', color: '#d9f99d', borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                    {tCanvas("btn_terrain_noise")}
                  </button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.4, marginTop: 6 }}>
                  {tCanvas("hint_terrain_brush_phase2")}
                </div>
              </div>
            </>
          ) : selected.kind === 'ui' ? (
            <>
              {!isMobile && (
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 8, letterSpacing: 0.5 }}>
                  🖼 {selected.label || selected.ui?.type || 'ui'}
                </div>
              )}
              <UiInspector
                selected={selected}
                onUpdate={(patch: Partial<UiData>) => {
                  setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, ui: { ...(o.ui as UiData), ...patch } } : o));
                }}
                onRectUpdate={(rectPatch: Partial<RectTransform>) => {
                  setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, ui: { ...(o.ui as UiData), rect: { ...(o.ui as UiData).rect, ...rectPatch } } } : o));
                }}
                onTransformUpdate={(patch) => {
                  setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, ...patch } : o));
                }}
                onCommit={() => pushHistory(objects)}
              />
            </>
          ) : (
            <>
              {!isMobile && (
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 8, letterSpacing: 0.5 }}>
                  {KIND_ICONS[selected.kind] ?? '❓'} {selected.label || selected.kind}
                </div>
              )}

              {/* 인스펙터 탭 (변환 / 재질) — 스크립트 탭은 컴포넌트 시스템으로 대체됨 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 7, padding: 2 }}>
                {(['transform','material'] as const).map(tab => {
                  const noMaterial = selected.kind === 'pointlight' || selected.kind === 'spotlight' || selected.kind === 'dirlight' || selected.kind === 'empty' || selected.kind === 'spawn';
                  const disabled = noMaterial && tab === 'material';
                  return (
                    <button key={tab} disabled={disabled} onClick={() => setInspTab(tab)}
                      style={{
                        background: inspTab === tab ? '#4f46e5' : 'transparent', border: 'none', borderRadius: 5,
                        color: disabled ? 'rgba(255,255,255,0.2)' : (inspTab === tab ? '#fff' : 'rgba(255,255,255,0.55)'),
                        fontSize: 11, padding: '6px 0', cursor: disabled ? 'default' : 'pointer', fontWeight: 700,
                      }}>
                      {t(tab === 'transform' ? 'inspTabTransform' : 'inspTabMaterial')}
                    </button>
                  );
                })}
              </div>

              {/* ── 변환 탭 ── */}
              {inspTab === 'transform' && <>
              {/* 레이어 (유니티 식) — Ctrl+0~9 단축키와 동일 효과 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                <span style={{ flexShrink: 0 }}>{tCanvas("inspector_layer")}</span>
                <span title={`Layer ${selected.layer ?? 0}`} style={{ flexShrink: 0, minWidth: 16, height: 16, padding: '0 5px', borderRadius: 8, background: LAYER_COLORS[selected.layer ?? 0] ?? '#475569', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{selected.layer ?? 0}</span>
                <select value={selected.layer ?? 0}
                  onChange={e => {
                    const nv = parseInt(e.target.value, 10);
                    const targets = new Set<string>([selected.id, ...multiSelectedIds]);
                    setObjects(prev => prev.map(o => targets.has(o.id) ? { ...o, layer: nv } : o));
                  }}
                  style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#fff', fontSize: 11, padding: '3px 5px', cursor: 'pointer' }}>
                  {[0,1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n === 0 ? `${n} (Default)` : `${n}`}</option>)}
                </select>
              </div>
              {/* 위치/회전/스케일 모드 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 6 }}>
                {(['translate','rotate','scale'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ background: mode === m ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 0', cursor: 'pointer', fontWeight: 600 }}>
                    {m === 'translate' ? t('inspMove') : m === 'rotate' ? t('inspRotate') : t('inspScale')}
                  </button>
                ))}
              </div>

              {/* 스냅 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <button
                  onClick={() => setSnapEnabled(v => !v)}
                  style={{ flex: 1, background: snapEnabled ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${snapEnabled ? '#34d399' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: snapEnabled ? '#34d399' : 'rgba(255,255,255,0.4)', fontSize: 10, padding: '4px 0', cursor: 'pointer', fontWeight: 600 }}>
                  {snapEnabled ? t('inspSnapOn') : t('inspSnapOff')}
                </button>
                {snapEnabled && (
                  <select value={snapSize} onChange={e => setSnapSize(Number(e.target.value))}
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '3px 5px', cursor: 'pointer' }}>
                    {[0.1, 0.25, 0.5, 1, 2].map(v => <option key={v} value={v}>{v}m</option>)}
                  </select>
                )}
              </div>

              <AxisInputRow
                label={mode === 'translate' ? t('position') : mode === 'rotate' ? t('rotation') : t('scale')}
                values={
                  mode === 'translate' ? (selected.position ?? [0, 0, 0]) :
                  mode === 'rotate'    ? ((selected.rotation ?? [0, 0, 0]).map(r => Math.round(r * 180 / Math.PI)) as [number,number,number]) :
                                         (selected.scale ?? [1, 1, 1])
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

              {/* 물리 라디오 버튼은 제거됨 — Physics 컴포넌트로 대체.
                  레거시 obj.physics 필드 있는 경우 안내: */}
              {selected.physics && selected.physics !== 'none' && !selected.components?.some(c => c.type === 'physics') && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, fontSize: 10, color: '#fbbf24', lineHeight: 1.5 }}>
                  {tCanvas("legacy_physics_warn", { physics: selected.physics })}
                  <button type="button"
                    onClick={() => {
                      const inst: ComponentInstance = { type: 'physics' as ComponentType, props: { mode: selected.physics === 'dynamic' ? 'dynamic' : 'fixed' } };
                      setObjects(prev => prev.map(o => o.id === selected.id
                        ? { ...o, components: [...(o.components ?? []), inst], physics: undefined }
                        : o));
                      pushHistory(objects);
                    }}
                    style={{ display: 'block', marginTop: 5, background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                    {tCanvas("btn_migrate_to_physics")}
                  </button>
                </div>
              )}

              {/* ── 컴포넌트 (Unity 스타일) — 모든 오브젝트 (라이트 포함) ── */}
              <ComponentsSection
                selected={selected}
                setObjects={setObjects}
                pushHistory={pushHistory}
                allObjects={objects}
                openPicker={() => setComponentPickerOpen(true)}
                scriptComponents={scriptComponents}
                officialScriptComponents={officialScriptComponents}
                onColliderAutoFit={colliderAutoFit}
                onEditScriptComponent={(id) => { setScriptEditId(id); setScriptComponentsModalOpen(true); }}
                onSelectId={(id) => setSelectedId(id)}
                onAttachFromAsset={attachScriptAssetToSelection}
              />

              {/* 조명 속성 (pointlight / spotlight 전용) */}
              {(selected.kind === 'pointlight' || selected.kind === 'spotlight' || selected.kind === 'dirlight') && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>{t('inspLightSettings')}</div>
                  {/* 색상 */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{t('lightColor')}</div>
                    <input type="color" value={selected.lightColor || '#ffffff'}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightColor: e.target.value } : o))}
                      onBlur={() => pushHistory(objects)}
                      style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
                  </div>
                  {/* 강도 */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    {t('lightIntensity')} {(selected.lightIntensity ?? 1).toFixed(1)}
                    <input type="range" min={0} max={10} step={0.1} value={selected.lightIntensity ?? 1}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightIntensity: Number(e.target.value) } : o))}
                      onMouseUp={() => pushHistory(objects)}
                      style={{ accentColor: '#fbbf24' }} />
                  </label>
                  {/* 거리 (0 = 무한) */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    {t('lightDistance')} {(selected.lightDistance ?? 0).toFixed(0)}
                    <input type="range" min={0} max={50} step={1} value={selected.lightDistance ?? 0}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightDistance: Number(e.target.value) } : o))}
                      onMouseUp={() => pushHistory(objects)}
                      style={{ accentColor: '#fbbf24' }} />
                  </label>
                  {/* 스폿 전용 */}
                  {selected.kind === 'spotlight' && (<>
                    <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      {t('lightAngle')} {(selected.lightAngle ?? 45).toFixed(0)}°
                      <input type="range" min={1} max={89} step={1} value={selected.lightAngle ?? 45}
                        onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightAngle: Number(e.target.value) } : o))}
                        onMouseUp={() => pushHistory(objects)}
                        style={{ accentColor: '#fbbf24' }} />
                    </label>
                    <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      {t('lightPenumbra')} {(selected.lightPenumbra ?? 0.2).toFixed(2)}
                      <input type="range" min={0} max={1} step={0.05} value={selected.lightPenumbra ?? 0.2}
                        onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightPenumbra: Number(e.target.value) } : o))}
                        onMouseUp={() => pushHistory(objects)}
                        style={{ accentColor: '#fbbf24' }} />
                    </label>
                  </>)}
                  {/* 그림자 — UI 와 렌더링 default 일관성 (false). WebGL 텍스처 한계(16)로 한 씬당 5~6개만 권장. */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.castShadow ?? false}
                      onChange={e => { setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, castShadow: e.target.checked } : o)); pushHistory(objects); }} />
                    {t('inspShadow')}
                  </label>
                </div>
              )}
              </>}{/* /transform 탭 끝 */}

              {/* 스크립트 탭은 제거됨 — 컴포넌트 시스템 (변환 탭의 COMPONENTS 섹션) 사용 */}

              {/* ── 재질 탭 — 색상 / 재질 / 텍스처 — 조명에서는 숨김 ── */}
              {inspTab === 'material' && selected.kind !== 'pointlight' && selected.kind !== 'spotlight' && selected.kind !== 'dirlight' && <>
              {/* 🔪 큐브 깎기 (CSG) — 도형을 빼서 구멍/홈 */}
              {selected.kind === 'cube' && (
                <div style={{ marginBottom: 10, padding: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>🔪 {t('carveTitle')}</div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {(['sphere', 'box', 'cylinder'] as const).map(s => (
                      <button key={s} onClick={() => setCarveShape(s)}
                        style={{ flex: 1, padding: '4px', borderRadius: 5, border: 'none', fontSize: 10, cursor: 'pointer', background: carveShape === s ? '#6366f1' : 'rgba(255,255,255,0.06)', color: '#fff' }}>
                        {s === 'sphere' ? t('carveSphere') : s === 'box' ? t('carveBox') : t('carveCylinder')}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 3 }}>{t('carveSize')} {carveSize.toFixed(2)}</div>
                  <input type="range" min={0.1} max={1.2} step={0.05} value={carveSize} onChange={e => setCarveSize(Number(e.target.value))} style={{ width: '100%', marginBottom: 6 }} />
                  <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 3 }}>{t('carvePos')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
                    {[0, 1, 2].map(i => (
                      <input key={i} type="number" min={-0.7} max={0.7} step={0.05} value={carvePos[i]}
                        onChange={e => { const v = Number(e.target.value) || 0; setCarvePos(p => { const n = [...p] as [number, number, number]; n[i] = v; return n; }); }}
                        style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '3px 5px', borderRadius: 4, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const cut: CsgCut = { shape: carveShape, pos: [...carvePos] as [number, number, number], size: [carveSize, carveSize, carveSize] };
                      setObjects(prev => { const next = prev.map(o => o.id === selected.id ? { ...o, csgCuts: [...(o.csgCuts || []), cut] } : o); pushHistory(next); return next; });
                    }}
                    style={{ width: '100%', padding: '6px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>
                    ➖ {t('carveAdd')}
                  </button>
                  {selected.csgCuts && selected.csgCuts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {selected.csgCuts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '3px 6px' }}>
                          <span style={{ flex: 1 }}>{c.shape} ({c.pos.map(n => n.toFixed(1)).join(', ')})</span>
                          <button onClick={() => setObjects(prev => { const next = prev.map(o => o.id === selected.id ? { ...o, csgCuts: (o.csgCuts || []).filter((_, k) => k !== i) } : o); pushHistory(next); return next; })}
                            style={{ background: 'rgba(239,68,68,0.6)', border: 'none', color: '#fff', borderRadius: 4, fontSize: 9, padding: '1px 5px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button type="button" onClick={() => setMatPanelOpen(v => !v)}
                style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '5px 8px', cursor: 'pointer', fontWeight: 600, marginBottom: matPanelOpen ? 8 : 10 }}>
                {t('inspMatPanelTitle')} {matPanelOpen ? '▲' : '▼'}
              </button>
              {matPanelOpen && (
                <>
                  {selected.kind !== 'asset' && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{t('color')}</div>
                      <input type="color" value={selected.color}
                        onChange={e => updateColor(selected.id, e.target.value)}
                        onBlur={() => pushHistory(objects)}
                        style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
                    </div>
                  )}

                  {/* 머티리얼 */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{t('material')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                      {(['default','wood','metal','stone','glass','plastic','emissive'] as const).map(key => {
                        const labels: Record<string,string> = { default: t('matDefault'), wood: t('matWood'), metal: t('matMetal'), stone: t('matStone'), glass: t('matGlass'), plastic: t('matPlastic'), emissive: t('matEmissive') };
                        const active = (selected.material ?? 'default') === key;
                        return (
                          <button key={key} onClick={() => { updateMaterialField('material', key); pushHistory(objects); }}
                            style={{ background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 4px', cursor: 'pointer', textAlign: 'left' }}>
                            {labels[key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

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
                  <div style={{ marginBottom: 10, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{t('texture')}</div>
                    {([['albedo', t('texAlbedo'), selected.textureAlbedo, 'textureAlbedo'], ['normal', t('texNormal'), selected.textureNormal, 'textureNormal'], ['roughness', t('texRoughness'), selected.textureRoughness, 'textureRoughness']] as const).map(([slot, label, value, field]) => (
                      <div key={slot}
                        onDragOver={e => {
                          if (!e.dataTransfer.types.includes('text/plain')) return;
                          e.preventDefault(); e.stopPropagation();
                          setDragOverTex(slot);
                        }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTex(null); }}
                        onDrop={e => {
                          e.preventDefault(); e.stopPropagation();
                          setDragOverTex(null);
                          const assetId = e.dataTransfer.getData('text/plain');
                          const asset = myAssets.find(a => a.id === assetId);
                          if (asset && /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.modelUrl)) {
                            updateMaterialField(field, asset.modelUrl);
                            pushHistory(objects);
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3,
                          borderRadius: 4, padding: '1px 2px',
                          background: dragOverTex === slot ? 'rgba(99,102,241,0.2)' : 'transparent',
                          outline: dragOverTex === slot ? '1px dashed #6366f1' : 'none',
                          transition: 'background 0.1s',
                        }}>
                        <span style={{ fontSize: 9, opacity: 0.55, width: 56, flexShrink: 0 }}>{label}</span>
                        {value ? (
                          <>
                            <div
                              onClick={() => setTexPicker(slot)}
                              title={tCanvas("tooltip_click_change_texture")}
                              style={{ width: 22, height: 22, background: `url(${value}) center/cover`, borderRadius: 3, cursor: 'pointer', flexShrink: 0 }} />
                            <button onClick={() => { updateMaterialField(field, undefined); pushHistory(objects); }}
                              style={{ flex: 1, fontSize: 9, padding: '3px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'none', borderRadius: 3, cursor: 'pointer' }}>{t('texRemove')}</button>
                          </>
                        ) : (
                          <button onClick={() => setTexPicker(slot)}
                            style={{ flex: 1, fontSize: 10, padding: '3px', background: dragOverTex === slot ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: `1px dashed ${dragOverTex === slot ? '#818cf8' : 'rgba(255,255,255,0.15)'}`, borderRadius: 3, cursor: 'pointer' }}>
                            {dragOverTex === slot ? tCanvas("msg_drop_here") : t('texChoose')}
                          </button>
                        )}
                      </div>
                    ))}
                    {(selected.textureAlbedo || selected.textureNormal || selected.textureRoughness) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
                        {(['textureTilingX','textureTilingY'] as const).map(field => (
                          <label key={field} style={{ fontSize: 10, opacity: 0.55, display: 'flex', alignItems: 'center', gap: 3 }}>
                            {field === 'textureTilingX' ? t('texTilingX') : t('texTilingY')}
                            <input type="number" step={0.5} min={0.1} value={(selected[field] ?? 1) as number}
                              onChange={e => updateMaterialField(field, Number(e.target.value))}
                              onBlur={() => pushHistory(objects)}
                              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 3, outline: 'none' }} />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 📺 비디오 스크린 — 표면에 영상 재생 (TV 화면) */}
                  <div style={{ marginBottom: 10, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}
                    onDragOver={e => { if (e.dataTransfer.types.includes('text/plain')) { e.preventDefault(); e.stopPropagation(); setDragOverTex('video'); } }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTex(null); }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation(); setDragOverTex(null);
                      const asset = myAssets.find(a => a.id === e.dataTransfer.getData('text/plain'));
                      if (asset && /\.(mp4|webm|mov)$/i.test(asset.modelUrl)) { updateMaterialField('videoUrl', asset.modelUrl); pushHistory(objects); }
                    }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>{tCanvas("section_video_screen")}</div>
                    {selected.videoUrl ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ flex: 1, fontSize: 10, color: '#86efac', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {parseYouTubeId(selected.videoUrl) ? tCanvas("msg_youtube_set") : tCanvas("msg_video_file_set")}
                        </span>
                        <button onClick={() => { updateMaterialField('videoUrl', undefined); pushHistory(objects); }} style={{ fontSize: 9, padding: '3px 6px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'none', borderRadius: 3, cursor: 'pointer' }}>{tCanvas("tooltip_remove")}</button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => setVideoPicker(true)}
                          style={{ width: '100%', fontSize: 10, padding: '5px', marginBottom: 4, background: dragOverTex === 'video' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: `1px dashed ${dragOverTex === 'video' ? '#818cf8' : 'rgba(255,255,255,0.15)'}`, borderRadius: 4, cursor: 'pointer' }}>
                          {dragOverTex === 'video' ? tCanvas("msg_drop_here") : tCanvas("btn_pick_video")}
                        </button>
                        <input key={selected.id} type="text" placeholder={tCanvas("placeholder_youtube_link")}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          onBlur={e => { const v = e.target.value.trim(); if (v && parseYouTubeId(v)) { updateMaterialField('videoUrl', v); pushHistory(objects); } }}
                          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 10, padding: '5px', borderRadius: 4, outline: 'none' }} />
                      </>
                    )}
                    <div style={{ fontSize: 9, opacity: 0.4, marginTop: 3, lineHeight: 1.4 }}>{tCanvas("hint_video_screen")}</div>
                  </div>
                </>
              )}
              </>}

              {/* 오브젝트 액션 (복제 / 삭제 / 프리팹) — 속성 편집기와 구분선으로 분리 */}
              <div style={{ display: 'flex', gap: 4, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={duplicate}
                  style={{ flex: 1, background: 'rgba(99,102,241,0.2)', border: 'none', color: '#a5b4fc', fontSize: 11, padding: '7px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  {tCanvas("btn_duplicate")}
                </button>
                <button onClick={deleteSelected}
                  style={{ flex: 1, background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '7px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  {t('delete')}
                </button>
              </div>
              {/* 프리팹으로 저장 */}
              <button onClick={savePrefab}
                style={{ width: '100%', marginTop: 4, background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24', fontSize: 11, padding: '7px', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>
                {tCanvas("btn_save_as_prefab")}
              </button>

              <div style={{ fontSize: 10, opacity: 0.3, marginTop: 10, textAlign: 'center' }}>
                {t('stats', { count: objects.length, idx: hist.idx + 1, total: hist.stack.length })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 패널 열기 strip — 항상 마운트, display 로만 토글 (mount/unmount race 회피).
          z-index 9999 로 항상 최상위, 단순 onClick 으로 패널 강제 OPEN. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          devLog('[STRIP-LEFT] click — opening left panel');
          setLeftPanelOpen(true);
          if (isMobile) setStudioMode('settings');
        }}
        title={tCanvas("tooltip_open_left_panel")}
        style={{
          display: leftPanelOpen ? 'none' : 'flex',
          position: 'absolute', left: 0, top: 0, bottom: activeAssetPicker ? 340 : 0, width: 40, zIndex: 9999,
          border: 'none', borderRight: '2px solid #818cf8',
          background: '#4f46e5',
          color: '#fff', cursor: 'pointer', fontWeight: 800,
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: '4px 0 16px rgba(79,70,229,0.5)',
          pointerEvents: 'auto',
        }}>
        <span style={{ fontSize: 22 }}>▶</span>
        <span style={{ fontSize: 12, letterSpacing: 2, writingMode: 'vertical-rl' }}>{tCanvas("strip_scene_tools")}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          devLog('[STRIP-RIGHT] click — opening right panel');
          setRightPanelOpen(true);
          if (isMobile) setStudioMode('scene');
        }}
        title={tCanvas("tooltip_open_right_panel")}
        style={{
          display: rightPanelOpen ? 'none' : 'flex',
          position: 'absolute', right: 0, top: 0, bottom: activeAssetPicker ? 340 : 0, width: 40, zIndex: 9999,
          border: 'none', borderLeft: '2px solid #818cf8',
          background: '#4f46e5',
          color: '#fff', cursor: 'pointer', fontWeight: 800,
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: '-4px 0 16px rgba(79,70,229,0.5)',
          pointerEvents: 'auto',
        }}>
        <span style={{ fontSize: 22 }}>◀</span>
        <span style={{ fontSize: 12, letterSpacing: 2, writingMode: 'vertical-rl' }}>{tCanvas("strip_inspector")}</span>
      </button>

      {/* ── 3D 뷰포트 ─────────────────────── */}
      <div
        ref={viewportRef}
        style={{ flex: 1, position: 'relative' }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={handleMarqueeDown}
        onMouseMove={handleMarqueeMove}
        onMouseUp={handleMarqueeUp}
        onMouseLeave={handleMarqueeUp}
        onDragOver={e => {
          // 에셋·프리팹·씬 노드 드래그 + OS .alp 파일 드롭 허용
          if (
            e.dataTransfer.types.includes('text/plain') ||
            e.dataTransfer.types.includes('application/x-alp-prefab') ||
            e.dataTransfer.types.includes('application/x-alp-shape') ||
            e.dataTransfer.types.includes('sceneobjid') ||  // dataTransfer.types 는 소문자
            e.dataTransfer.types.includes('Files')
          ) {
            e.preventDefault();
          }
        }}
        onDrop={e => {
          e.preventDefault();
          // 0) OS 파일 드롭 — .alp / .alpmap.json 만 허용. 객체 merge.
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = Array.from(e.dataTransfer.files).find(f =>
              /\.(alp|alpmap\.json)$/i.test(f.name));
            if (file) {
              file.text().then(text => {
                let data;
                try { data = JSON.parse(text); }
                catch { alert('.alp 파일 파싱 실패 — JSON 형식이 아닙니다.'); return; }
                if (data?.format !== 'alp-map') {
                  alert('.alp 파일이 아닙니다. (format !== "alp-map")');
                  return;
                }
                if (!Array.isArray(data.objects) || data.objects.length === 0) {
                  alert('맵 파일에 오브젝트가 없습니다.');
                  return;
                }
                window.dispatchEvent(new CustomEvent(MAP_APPLY_EVENT, {
                  detail: { data, name: data.name || file.name },
                }));
              }).catch(err => {
                alert('.alp 파일 읽기 실패: ' + (err?.message || err));
              });
              return;
            }
            // .alp 가 아닌 일반 파일 드롭은 무시 (FBX 등은 에셋 페이지에서 업로드)
          }
          // 씬 노드 드래그 — 트리에서 뷰포트로 끌어다 놓으면 그 위치의 오브젝트의 자식으로 reparent.
          // (오브젝트 위가 아니라 빈 공간에 떨어지면 루트로 빼냄.)
          const sceneObjId = e.dataTransfer.getData('sceneObjId');
          if (sceneObjId) {
            const targetId = pickObjectIdFromXY(e.clientX, e.clientY);
            if (targetId && targetId !== sceneObjId) {
              reparentObject(sceneObjId, targetId);
            } else if (!targetId) {
              // 빈 공간 드롭 → 루트로
              reparentObject(sceneObjId, null);
            }
            return;
          }
          // 도형 — application/x-alp-shape MIME (드롭 위치에 생성)
          const shapeKind = e.dataTransfer.getData('application/x-alp-shape');
          if (shapeKind === 'cube' || shapeKind === 'sphere' || shapeKind === 'cylinder' || shapeKind === 'plane') {
            addPrimitive(shapeKind, dropPositionFromEvent(e));
            return;
          }
          // 프리팹 — application/x-alp-prefab MIME
          const prefabId = e.dataTransfer.getData('application/x-alp-prefab');
          if (prefabId) {
            const pf = prefabs.find(p => p.id === prefabId);
            if (pf) instantiatePrefab(pf, dropPositionFromEvent(e));
            return;
          }
          // 일반 에셋 드롭
          const assetId = e.dataTransfer.getData('text/plain');
          const asset = myAssets.find(a => a.id === assetId);
          if (!asset) return;
          const pos = dropPositionFromEvent(e);
          addAsset(asset, pos);
        }}
      >
        <Canvas
          shadows={{ enabled: true, type: THREE.PCFSoftShadowMap, autoUpdate: true }}
          camera={{ position: [8, 8, 8], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: exposure }}
          onPointerMissed={() => {
            // 터레인 조각 도구 사용 중엔 빈 곳 클릭/브러시 드래그 해제로 선택이 풀리지 않게 (유니티식 — ESC 나 도구 버튼으로만 종료)
            if (!isGizmoActive() && !terrainTool) { setSelectedId(null); setStudioMode('scene'); }
          }}
        >
          <ExposureUpdater exposure={exposure} hdriIntensity={hdriIntensity} />
          <CanvasPointerEventsKeeper simulating={simulating} />
          <ambientLight intensity={lightAmbient} />
          {/* 하늘 채움광 제거 — 전역 hemisphere 는 밀폐 공간 안까지 밝혀서(GI 없음) "빛 없는 곳 캄캄" 목표와 충돌.
              야외 그림자 부드럽게 하려면: 방향광을 하나 더(약하게, 반대 각도, 그림자 ON) 추가 — 천장에 막혀 실내는 안 밝아짐. */}
          {/* 태양 = 카메라 추적 단일 그림자 광원. 방향은 첫 방향광 오브젝트의 회전(E)이 결정, 강도도 그 오브젝트 강도.
              방향광 없으면 기본 각도 + 태양광 강도 슬라이더. 카메라 추적이라 그림자 frustum 이 항상 씬을 덮어
              → 지형/큐브가 빛을 제대로 막음(고정 위치 dirlight 의 frustum 빗나감 문제 해결). */}
          {(() => {
            const dl = objects.find(o => o.kind === 'dirlight' && !o.hidden);
            const dir = dl ? computeSunDir(dl.rotation) : ([-0.53, -0.80, -0.27] as [number, number, number]);
            return <FollowingStudioSun intensity={dl?.lightIntensity ?? lightDir} dir={dir} />;
          })()}
          {skyEnabled && !hdriBackground && <Sky sunPosition={[20, 10, 10]} />}
          {/* HDRI 환경맵 — 커스텀 URL 우선, 없으면 프리셋, none이면 미사용 */}
          {hdriUrl.trim() ? (
            <Environment files={hdriUrl.trim()} background={hdriBackground} />
          ) : hdriPreset !== 'none' ? (
            <Environment preset={hdriPreset} background={hdriBackground} />
          ) : null}

          {/* 에디터 격자 — 편집 모드만. y=-0.05 로 지형(y=0) 아래 배치 → 지형과 coplanar z-fighting 방지
              (이게 "지형 가로 이음새"의 진짜 원인이었음: 격자가 지형과 같은 평면이라 깊이 충돌 + fade 링). */}
          {!simulating && <Grid position={[0, -0.05, 0]} renderOrder={-1} args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={120} infiniteGrid />}

          {simulating ? (
            /* ── 시뮬레이션 모드 ── */
            <Suspense fallback={null}>
              <VideoScreenCtx.Provider value={{ live: true, withSound: true, registry: simVideoRegistry }}>
              <VideoDistanceUpdater registry={simVideoRegistry} objectsById={new Map(simObjs.map(o => [o.id, o]))}
                // 어떤 videoRemote 든 globalAudio=true 면 전역 음향
                globalAudio={simObjs.some(o => o.components?.some(c => c.type === 'videoRemote' && c.props?.globalAudio))} />
              <VideoInitialStateApplier registry={simVideoRegistry}
                initiallyPaused={simObjs.some(o => o.components?.some(c => c.type === 'videoRemote' && c.props?.initiallyPlaying === false))}
                initialVolume={(() => {
                  for (const o of simObjs) {
                    for (const c of o.components ?? []) {
                      if (c.type === 'videoRemote' && typeof c.props?.initialVolume === 'number') return c.props.initialVolume as number;
                    }
                  }
                  return undefined;
                })()}
                unlockedRef={simVideoUnlockedRef} />
              <Physics gravity={[0, worldPhysics.gravity, 0]} interpolate={false}>
                <SimScene objects={simObjs} transforms={simTransforms} myAssets={myAssets} gameApi={simGameRuntime.api} gameStore={simGameRuntime}
                  player={simCharacter ? {
                    character: simCharacter,
                    cameraMode: simCameraMode,
                    onToggleCameraMode: () => setSimCameraMode(m => m === 'first' ? 'third' : 'first'),
                    onGrabUiChange: setSimCrosshair,
                    freeCam: simCamView === 'free',
                    jumpPower: worldPhysics.jumpPower,
                    ownersRef: simOwnersRef,
                    grabbedStateRef: simGrabbedStateRef,
                    grabbableIdsRef: simGrabbableIdsRef,
                    remoteGrabbedByRef: simRemoteGrabbedRef,
                    spawnPos: simSpawn.pos,
                    spawnRotY: simSpawn.rotY,
                  } : undefined}
                />
                {/* 비디오 리모컨 — videoRemote 컴포넌트 오브젝트 위치에 3D 조작 패널 (시뮬 중) */}
                {simObjs
                  .filter(o => o.components?.some(c => c.type === 'videoRemote'))
                  .map(obj => {
                    const inst = obj.components!.find(c => c.type === 'videoRemote')!;
                    const tokensRaw = String(inst.props?.target ?? '').trim();
                    const tokens = tokensRaw ? tokensRaw.split(/[,\s]+/).filter(Boolean) : [];
                    const targets = tokens.length === 0
                      ? simObjs.filter(x => x.videoUrl && !x.components?.some(c => c.type === 'videoRemote'))
                      : simObjs.filter(x => {
                          if (tokens.includes(x.id)) return true;
                          const nm = x.label || (x as { name?: string }).name || '';
                          return !!nm && tokens.includes(nm);
                        });
                    if (targets.length === 0) return null;
                    const pos = simTransforms[obj.id]?.pos ?? obj.position;
                    const firstId = targets[0].id;
                    const targetIds = targets.map(t => t.id);
                    const rW  = Number(inst.props?.width  ?? 1.6);
                    const rH  = Number(inst.props?.height ?? 0.8);
                    const rOy = Number(inst.props?.offsetY ?? 1);
                    return (
                      <group key={'vr-' + obj.id} position={pos}>
                        <VideoRemotePanel
                          registry={simVideoRegistry} targetId={firstId} videoUrl={targets[0].videoUrl || ''}
                          width={rW} height={rH} offsetY={rOy}
                          firstPerson={!!simCharacter && simCamView === 'follow' && simCameraMode === 'first'}
                          onSeekBy={(d) => targetIds.forEach(tid => runSimVideoControl({ seekBy: d }, tid))}
                          onSeekTo={(t) => targetIds.forEach(tid => runSimVideoControl({ seekTo: t }, tid))}
                          onTogglePlay={(p) => targetIds.forEach(tid => runSimVideoControl({ playing: p }, tid))}
                          onSetVolume={(v) => targetIds.forEach(tid => runSimVideoControl({ volume: v, muted: false }, tid))}
                          onToggleMute={(m) => targetIds.forEach(tid => runSimVideoControl({ muted: !m }, tid))}
                          onChangeUrl={() => {
                            const u = window.prompt(tCanvas("prompt_new_url"), targets[0].videoUrl || '');
                            if (u && u.trim()) targetIds.forEach(tid => runSimVideoControl({ url: u.trim() }, tid));
                          }}
                        />
                      </group>
                    );
                  })}
              </Physics>
              </VideoScreenCtx.Provider>
            </Suspense>
          ) : (
            /* ── 편집 모드 ── */
            <>
              {/* 모든 오브젝트를 평탄 렌더 — 각자 월드 TRS 로. 부모 비균등 스케일에 의한 자식 전단 방지 */}
              {objects.filter(o => !o.hidden && isLayerVisible(o.layer)).map(obj => {
                const w = worldTRSFor(obj);
                return (
                  <SceneNode key={obj.id} obj={obj}
                    wpos={w.p} wrot={w.r} wscale={w.s}
                    selectedId={selectedId}
                    multiSelectedIds={multiSelectedIds}
                    myAssets={myAssets}
                    sculpt={(terrainTool && obj.kind === 'terrain' && obj.id === selectedId) ? {
                      tool: terrainTool, radius: brushSize, strength: brushStrength,
                      onCommit: (heights) => {
                        pushHistory(objects);
                        setObjects(prev => prev.map(o => o.id === obj.id && o.terrain ? { ...o, terrain: { ...o.terrain, heights } } : o));
                      },
                      onActiveChange: setSculptDragging,
                    } : undefined}
                    onObjectClick={id => {
                      // 뷰포트 다중 선택은 Ctrl+클릭 (트리 다중과 일관성). Shift 는 카메라 가속 우선.
                      if (ctrlHeldRef.current) {
                        shiftClickObject(id);
                      } else {
                        setStudioMode('scene');
                        setMultiSelectedIds(new Set());
                        setSelectedId(id);
                      }
                    }}
                  />
                );
              })}
              {/* 파티클 레이어 — 빈 오브젝트 포함 모든 kind 를 월드 TRS 로 방출 */}
              {objects.filter(o => !o.hidden && o.components?.some(c => c.type === 'particle')).map(obj => {
                const inst = obj.components!.find(c => c.type === 'particle')!;
                const w = worldTRSFor(obj);
                return (
                  <group key={'pfx-' + obj.id} position={w.p} rotation={w.r} scale={w.s}>
                    <Particles s={deriveParticleSettings(inst)} />
                  </group>
                );
              })}
              {/* 표지판 미리보기 — 편집 모드에서 글자/위치 확인 */}
              {objects.filter(o => !o.hidden && o.components?.some(c => c.type === 'sign')).map(obj => {
                const inst = obj.components!.find(c => c.type === 'sign')!;
                const w = worldTRSFor(obj);
                return (
                  <group key={'sign-' + obj.id} position={w.p} rotation={w.r} scale={w.s}>
                    <SignText inst={inst} />
                  </group>
                );
              })}
              {/* 비디오 리모컨 미리보기 — 편집 모드에서 크기/위치 확인용 (interactive=false). 영상 없어도 표시. */}
              {objects.filter(o => !o.hidden && o.components?.some(c => c.type === 'videoRemote')).map(obj => {
                const inst = obj.components!.find(c => c.type === 'videoRemote')!;
                const tokensRaw = String(inst.props?.target ?? '').trim();
                const tokens = tokensRaw ? tokensRaw.split(/[,\s]+/).filter(Boolean) : [];
                const targets = tokens.length === 0
                  ? objects.filter(x => x.videoUrl && !x.components?.some(c => c.type === 'videoRemote'))
                  : objects.filter(x => {
                      if (tokens.includes(x.id)) return true;
                      const nm = x.label || (x as { name?: string }).name || '';
                      return !!nm && tokens.includes(nm);
                    });
                const curUrl = targets[0]?.videoUrl || String(inst.props?.url ?? '');
                const w = worldTRSFor(obj);
                const rW  = Number(inst.props?.width  ?? 1.6);
                const rH  = Number(inst.props?.height ?? 0.8);
                const rOy = Number(inst.props?.offsetY ?? 1);
                return (
                  <group key={'vr-prev-' + obj.id} position={w.p} rotation={w.r}>
                    <VideoRemotePanel
                      registry={simVideoRegistry} targetId="" videoUrl={curUrl}
                      width={rW} height={rH} offsetY={rOy}
                      interactive={false}
                      onSeekBy={() => {}} onSeekTo={() => {}} onTogglePlay={() => {}} onChangeUrl={() => {}}
                    />
                  </group>
                );
              })}
              {mode === 'scale' ? (
                <BoxResizeWrap
                  targetId={objects.find(o => o.id === selectedId)?.locked ? null : selectedId}
                  toLocal={worldTRSToLocal}
                  onChange={updateObjectTransform}
                  onDragStart={onTransformDragStart}
                  onDragEnd={() => pushHistory(objects)}
                />
              ) : (
                <SelectedTransform
                  targetId={objects.find(o => o.id === selectedId)?.locked ? null : selectedId}
                  mode={mode}
                  toLocal={worldTRSToLocal}
                  onChange={updateObjectTransform}
                  onDragStart={onTransformDragStart}
                  onDragEnd={() => {
                    // 기즈모 이동은 위치만 바꾼다 — 부모 설정은 씬 트리에서 드래그로 명시적으로만.
                    pushHistory(objects);
                  }}
                  snapTranslate={snapEnabled ? snapSize : null}
                  snapRotate={snapEnabled ? (Math.PI / 12) : null}
                  snapScale={snapEnabled ? 0.1 : null}
                />
              )}
            </>
          )}
          <SceneRefCapture target={threeSceneRef} />

          {/* follow 모드(캐릭터 빙의)에선 Player 가 카메라 소유 → 에디터 카메라 끔.
              free 모드(자유시점) 또는 편집 모드에선 OrbitControls/WasdFly 활성. */}
          {!(simulating && simCharacter && simCamView === 'follow') && (
            <>
              <OrbitControls
                ref={orbitRef}
                enabled={orbitEnabled && !terrainTool}
                makeDefault
                enableZoom={true}
                // 모바일: 1손가락 회전 + 2손가락 핀치줌/팬. 데스크톱: 좌클릭은 선택/마키용으로 비움, 가운데=팬.
                enableRotate={isMobile}
                touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
                mouseButtons={{
                  LEFT:   undefined as unknown as THREE.MOUSE,
                  MIDDLE: THREE.MOUSE.PAN,
                  RIGHT:  undefined as unknown as THREE.MOUSE,
                }}
              />
              <DraggingDetector setOrbitEnabled={setOrbitEnabled} />
              {/* 키보드/마우스 전용 카메라 — 데스크톱만. 모바일은 OrbitControls 터치로 대체 */}
              {!isMobile && <WasdFlyCamera orbitRef={orbitRef} rmbHeldRef={rmbHeldRef} />}
              {!isMobile && <RightClickLook orbitRef={orbitRef} />}
            </>
          )}
          <CanvasCapture captureFnRef={captureFnRef} />
          <CanvasDomCapture canvasDomRef={canvasDomRef} />
          {/* 거리 기반 culling — 시뮬레이션에서만 활성 (편집 모드는 멀리 있는 오브젝트도 보여야).
              스튜디오는 별도 graphics 옵션 X — 큰 맵 미리보기용 보수적 값(400m). */}
          {simulating && <PerfManager cullDistance={400} />}
          <CameraRefCapture cameraRef={cameraRef} />
          <PostFXZoneWatcher zones={postFXZones} onZone={setActivePostFXZone} />
          <CameraWaterWatcher volsRef={waterPostFXRef} onChange={setActiveWaterFX} />
          {/* World Space UI — canvas.space === 'world' 인 UI 오브젝트를 3D 공간에 렌더 */}
          <UIWorldRenderer
            objects={(simulating ? simObjs : objects).filter(o => o.kind === 'ui' && o.ui).map(o => ({
              id: o.id, parentId: o.parentId ?? null, hidden: o.hidden, ui: o.ui!,
              position: (simulating ? (simTransforms[o.id]?.pos ?? o.position) : o.position) as [number, number, number],
              rotation: o.rotation, scale: o.scale,
            }))}
            editMode={!simulating}
            onButtonClick={simulating ? (_id, script) => execUiButtonScript(script, simGameRuntime.api) : undefined}
          onValueChange={simulating ? (_id, script, value) => execUiButtonScript(script, simGameRuntime.api, value) : undefined}
          onLocalValueChange={(id, patch) => setObjects(prev => prev.map(o => o.id === id && o.ui ? { ...o, ui: { ...o.ui, ...patch } } : o))}
          />
          <PostFX s={
            (activeWaterFX >= 0 && waterPostFX[activeWaterFX]) ? waterPostFX[activeWaterFX].s
            : (activePostFXZone >= 0 && postFXZones[activePostFXZone]) ? postFXZones[activePostFXZone].s
            : postFX
          } />
        </Canvas>

        {/* UI Renderer — Screen Space HTML overlay (Phase 1). 편집 모드에선 editMode=true.
            편집 모드에서 UI 요소 클릭 → 인스펙터 선택 연동 + 시각 outline. */}
        <UIRenderer
          objects={(simulating ? simObjs : objects).filter(o => o.kind === 'ui' && o.ui).map(o => ({ id: o.id, parentId: o.parentId ?? null, hidden: o.hidden, ui: o.ui! }))}
          editMode={!simulating}
          selectedId={!simulating ? selectedId : null}
          onSelect={!simulating ? (id) => { setStudioMode('scene'); setMultiSelectedIds(new Set()); setSelectedId(id); } : undefined}
          onButtonClick={simulating ? (_id, script) => execUiButtonScript(script, simGameRuntime.api) : undefined}
          onValueChange={simulating ? (_id, script, value) => execUiButtonScript(script, simGameRuntime.api, value) : undefined}
          onLocalValueChange={(id, patch) => setObjects(prev => prev.map(o => o.id === id && o.ui ? { ...o, ui: { ...o.ui, ...patch } } : o))}
        />

        {/* 게임 HUD — 스크립트 ui.text/ui.bar 가 그림. 시뮬레이션 중에만 뷰포트 위에 오버레이. */}
        {simulating && <GameHud runtime={simGameRuntime} />}
        {/* 스크립트 디버그 콘솔 (백틱 ` 키 토글) — 시뮬 중 print/에러 확인 */}
        {simulating && <WorldDevConsole />}

        {/* 1인칭 시뮬레이션 크로스헤어 — follow 모드 + 1인칭일 때만. 월드와 동일 십자가 + 가운데 점.
            위치: 캔버스 영역 중앙 (viewport 중앙 X — 좌측 사이드바 등으로 어긋남). raycast NDC(0,0) 과 일치. */}
        {simulating && simCharacter && simCamView === 'follow' && simCameraMode === 'first' && (() => {
          const ch = simCrosshair === 'grab' ? '#fbbf24' : simCrosshair === 'aim' ? '#34d399' : '#fff';
          const useBlend = simCrosshair === 'idle';
          const hint = simCrosshair === 'grab' ? tCanvas("hint_crosshair_grab")
                     : simCrosshair === 'aim'  ? tCanvas("hint_crosshair_aim") : null;
          return (
            <>
              <div style={{ position: 'fixed', top: canvasCenter.y, left: canvasCenter.x, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 16777274, mixBlendMode: useBlend ? 'difference' : 'normal' }}>
                <div style={{ position: 'absolute', width: 14, height: 2, background: ch, left: -7, top: -1 }} />
                <div style={{ position: 'absolute', width: 2, height: 14, background: ch, left: -1, top: -7 }} />
                <div style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: ch, left: -1.5, top: -1.5 }} />
              </div>
              {hint && (
                <div style={{
                  position: 'fixed', top: canvasCenter.y + 28, left: canvasCenter.x, transform: 'translateX(-50%)',
                  pointerEvents: 'none', zIndex: 16777274,
                  fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: 600,
                  textShadow: '0 1px 2px rgba(0,0,0,0.7)', whiteSpace: 'nowrap',
                }}>{hint}</div>
              )}
            </>
          );
        })()}

        {/* 시뮬레이션 카메라 모드 토글 (우상단) — 캐릭터 빙의 / 자유시점 */}
        {simulating && simCharacter && (
          <button
            type="button"
            onClick={() => { setSimCamView(v => v === 'follow' ? 'free' : 'follow'); if (document.pointerLockElement) document.exitPointerLock(); }}
            style={{
              position: 'absolute', top: 16, right: 16, zIndex: 25,
              padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)',
              background: simCamView === 'free' ? 'rgba(16,185,129,0.85)' : 'rgba(99,102,241,0.85)',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)',
            }}
          >
            {simCamView === 'free' ? tCanvas("btn_freecam") : tCanvas("btn_follow_cam")} (F8)
          </button>
        )}

        {/* 시뮬레이션 조작 안내 (하단) */}
        {simulating && simCharacter && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 20, fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.45)', padding: '6px 14px', borderRadius: 8, backdropFilter: 'blur(6px)', whiteSpace: 'nowrap' }}>
            {simCamView === 'free'
              ? tCanvas("hint_sim_freecam")
              : tCanvas("hint_sim_follow")}
          </div>
        )}

        {/* 시뮬레이션 시작/중지 버튼은 상단 툴바로 이동됨 */}

        {/* 🎬 Timeline — 선택 오브젝트(또는 조상)에 Timeline 컴포넌트가 있으면 그 루트+자식 스코프로 노출 (편집 전용) */}
        {!simulating && (() => {
          const tlRoot = findTimelineRoot(selectedId, objects);
          if (!tlRoot) return null;
          return (
            <>
              <button
                type="button"
                onClick={() => setShowTimeline(v => !v)}
                style={{ position: 'fixed', right: 16, bottom: showTimeline ? 150 : 72, zIndex: 51,
                  padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)',
                  background: showTimeline ? 'rgba(99,102,241,0.9)' : 'rgba(40,40,52,0.9)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)' }}
              >🎬 타임라인 {showTimeline ? '닫기' : '열기'}</button>
              {showTimeline && (
                <KeyframeTimelinePanel
                  root={tlRoot}
                  objects={objects}
                  selectedId={selectedId}
                  onChangeObj={(id, anim) => { pushHistory(objects); setObjects(prev => prev.map(o => o.id === id ? { ...o, keyframeAnim: anim } : o)); }}
                  onSelectObj={(id) => setSelectedId(id)}
                  onPatchTimeline={(props) => {
                    pushHistory(objects);
                    const ids = subtreeIds(tlRoot.id, objects);
                    setObjects(prev => prev.map(o => {
                      let next = o;
                      if (o.id === tlRoot.id) {
                        const comps = (o.components ?? []).map(c => c.type === 'timeline' ? { ...c, props: { ...c.props, ...props } } : c);
                        next = { ...next, components: comps };
                      }
                      // 서브트리 오브젝트의 keyframeAnim 에도 길이/반복/자동재생 전파 → 시뮬 재생 일관.
                      if (ids.includes(o.id) && next.keyframeAnim) {
                        next = { ...next, keyframeAnim: { ...next.keyframeAnim, ...props } };
                      }
                      return next;
                    }));
                  }}
                  onPreviewAll={(poses) => setKfPreviews(poses)}
                />
              )}
            </>
          );
        })()}

        {/* 터레인 조각(sculpt) 도구 — 선택한 터레인 지형 올리고/내리기 (유니티/언리얼식 브러시) */}
        {!simulating && (() => {
          const selObj = objects.find(o => o.id === selectedId);
          if (!selObj || selObj.kind !== 'terrain') return null;
          const tools: { id: TerrainTool; label: string }[] = [
            { id: 'raise', label: '⛰️ 올리기' }, { id: 'lower', label: '🕳️ 내리기' },
            { id: 'smooth', label: '🌫️ 부드럽게' }, { id: 'flatten', label: '▭ 평탄화' },
          ];
          return (
            <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 51,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
              background: 'rgba(20,20,28,0.94)', border: '1px solid #333', borderRadius: 12, padding: '8px 14px',
              color: '#eee', font: '12px sans-serif', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              <strong style={{ color: '#a5b4fc' }}>🏔️ 지형 조각</strong>
              {tools.map(tl => (
                <button key={tl.id} onClick={() => setTerrainTool(t => t === tl.id ? null : tl.id)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700,
                    background: terrainTool === tl.id ? '#6366f1' : 'rgba(255,255,255,0.08)', color: '#fff' }}>{tl.label}</button>
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>크기
                <input type="range" min={1} max={20} step={0.5} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: 90 }} />{brushSize}m</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>세기
                <input type="range" min={0.05} max={1.5} step={0.05} value={brushStrength} onChange={e => setBrushStrength(Number(e.target.value))} style={{ width: 80 }} />{brushStrength.toFixed(2)}</label>
              {terrainTool && <span style={{ color: '#86efac' }}>지형 위를 드래그하세요</span>}
            </div>
          );
        })()}

        {/* 빈 씬 온보딩 안내 — 오브젝트 없을 때만 표시 */}
        {!simulating && objects.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 5,
            textAlign: 'center', maxWidth: 420, padding: 24,
            background: 'rgba(15,23,42,0.85)', borderRadius: 14,
            border: '1px solid rgba(99,102,241,0.3)', backdropFilter: 'blur(8px)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              {t('emptyTitle')}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              {t('emptyHint')}
            </div>
          </div>
        )}

        {/* 전체화면 토글 — 모바일 전용 (뷰포트 우상단) */}
        {isMobile && (
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? t('fullscreenExit') : t('fullscreenEnter')}
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 218,
              width: 40, height: 40, borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(2,6,23,0.78)', color: '#fff',
              fontSize: 18, fontWeight: 700, backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isFullscreen ? '🡼' : '⛶'}
          </button>
        )}

        {/* 마퀴 셀렉션 사각형 */}
        {marqueeStart && marqueeEnd && (
          <div style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 8,
            left:   Math.min(marqueeStart.x, marqueeEnd.x),
            top:    Math.min(marqueeStart.y, marqueeEnd.y),
            width:  Math.abs(marqueeEnd.x - marqueeStart.x),
            height: Math.abs(marqueeEnd.y - marqueeStart.y),
            border: '1px solid rgba(99,102,241,0.9)',
            background: 'rgba(99,102,241,0.1)',
          }} />
        )}

        {/* 모바일 변환 툴바 — 키보드 없는 환경에서 이동/회전/스케일/복제/삭제 */}
        {isMobile && !simulating && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, zIndex: 217, background: 'rgba(10,15,30,0.82)', borderRadius: 14, padding: 5, backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
            {([['translate','↔',t('modeTranslate')],['rotate','⟳',t('modeRotate')],['scale','⤢',t('modeScale')]] as const).map(([m, icon, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 54, height: 50, border: 'none', borderRadius: 10, cursor: 'pointer', background: mode === m ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>{label}
              </button>
            ))}
            {selectedId && (
              <>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)', margin: '4px 2px' }} />
                <button type="button" onClick={duplicate}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 54, height: 50, border: 'none', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ fontSize: 19, lineHeight: 1 }}>⎘</span>{t('mobileDup')}
                </button>
                <button type="button" onClick={deleteSelected}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 54, height: 50, border: 'none', borderRadius: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.22)', color: '#fca5a5', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ fontSize: 19, lineHeight: 1 }}>🗑</span>{t('mobileDel')}
                </button>
              </>
            )}
          </div>
        )}

        {/* 단축키 힌트 — 데스크톱만 (모바일은 키보드 없음) */}
        {!isMobile && (
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', pointerEvents: 'none' }}>
          {[
            ['W', tCanvas("shortcut_move")], ['E', tCanvas("shortcut_rotate")], ['R', tCanvas("shortcut_scale")],
            ['우클릭+WASD', tCanvas("shortcut_camera")], ['우클릭+QE', tCanvas("shortcut_up_down")], ['Shift', tCanvas("shortcut_accel")],
            ['F', tCanvas("shortcut_focus")], ['Ctrl+D', tCanvas("shortcut_duplicate")], ['Alt+드래그', tCanvas("shortcut_alt_drag")], ['Ctrl+Z', tCanvas("shortcut_undo")], ['Del', tCanvas("btn_delete")],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 7px', backdropFilter: 'blur(6px)' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace', color: '#e2e8f0', fontWeight: 700 }}>{key}</kbd>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{desc}</span>
            </div>
          ))}
        </div>
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
        {videoPicker && (
          <TexturePickerModal
            assets={myAssets}
            mode="video"
            title={tCanvas("title_video_picker")}
            onClose={() => setVideoPicker(false)}
            onSelect={(url) => { updateMaterialField('videoUrl', url); pushHistory(objects); setVideoPicker(false); }}
          />
        )}

        {/* FBX 에셋 토글 버튼 */}
        <button
          onClick={() => setActiveAssetPicker(v => !v)}
          style={{
            position: 'absolute', bottom: 14, left: 14, zIndex: 13,
            background: activeAssetPicker ? 'rgba(129,140,248,0.25)' : 'rgba(2,6,23,0.6)',
            border: `1px solid ${activeAssetPicker ? '#818cf8' : 'rgba(255,255,255,0.2)'}`,
            color: activeAssetPicker ? '#a5b4fc' : '#fff',
            borderRadius: 8, padding: '6px 13px', fontSize: 12, cursor: 'pointer',
            backdropFilter: 'blur(8px)', fontWeight: 700, transition: 'all 0.15s',
          }}>
          {t('myFbxAssets', { count: fbxAssets.length })}
        </button>

        {/* FBX 에셋 바텀 슬라이딩 패널 — 인스펙터 열렸을 땐 우측 300px 비워 가려지지 않게 */}
        <div
          onDragOver={e => { if (e.dataTransfer.types.includes('text/plain')) e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.stopPropagation(); }}
          style={{
          position: 'absolute', bottom: 0, left: 0,
          // 인스펙터 열림: 300px, 닫힘: strip 40px — 어떤 상황에도 우측 가려지지 않음 (모바일은 풀폭)
          right: isMobile ? 0 : (rightPanelOpen ? inspectorWidth : 40),
          zIndex: 14,
          background: 'rgba(2,6,23,0.93)',
          borderTop: '1px solid rgba(129,140,248,0.25)',
          backdropFilter: 'blur(14px)',
          transform: `translateY(${activeAssetPicker ? '0%' : '100%'})`,
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), right 0.2s ease',
          height: assetH,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* 높이 리사이즈 핸들 (위쪽 가장자리 드래그 ↑ 크게) */}
          <div
            onPointerDown={e => beginResize(e, { axis: 'y', from: assetH, dir: -1, min: 180, max: Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.8), set: setAssetH })}
            title={tCanvas("tooltip_drag_height")}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, cursor: 'ns-resize', zIndex: 2 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          />
          {/* 헤더 */}
          <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
              {t('myFbxAssets', { count: fbxAssets.length })}
            </div>
            <button onClick={() => setActiveAssetPicker(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
          </div>

          {/* 2분할 본문 */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            {/* 왼쪽: 폴더 트리 */}
            <div style={{
              width: 200, flexShrink: 0, overflowY: 'auto',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              padding: '4px 4px', display: 'flex', flexDirection: 'column',
            }}>
              {/* 새 폴더 버튼 */}
              <div style={{ padding: '4px 6px 6px', flexShrink: 0 }}>
                {showNewFolder ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmNewFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                      placeholder={tCanvas("placeholder_folder_name")}
                      style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid #6366f1', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 6px', outline: 'none' }}
                    />
                    <button onClick={confirmNewFolder} style={{ background: '#4f46e5', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 7px', cursor: 'pointer' }}>✓</button>
                    <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 7px', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowNewFolder(true)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 5, color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>
                    {t('newFolder')}
                  </button>
                )}
              </div>

              {/* 루트(폴더 없음) 항목 */}
              <div
                onClick={() => setSelectedFolder(null)}
                onDragOver={e => { e.preventDefault(); setDragOverPath('__root__'); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPath(undefined); }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation();
                  const id = e.dataTransfer.getData('text/plain');
                  const fromFolder = e.dataTransfer.getData('folderPath');
                  if (id) moveAssetToFolder(id, null);
                  else if (fromFolder) moveFolderTo(fromFolder, null);
                  setDragOverPath(undefined);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
                  userSelect: 'none' as const,
                  background: dragOverPath === '__root__' ? 'rgba(52,211,153,0.18)' : selectedFolder === null ? 'rgba(129,140,248,0.22)' : 'transparent',
                  color: dragOverPath === '__root__' ? '#6ee7b7' : selectedFolder === null ? '#c7d2fe' : '#94a3b8',
                  fontSize: 12, fontWeight: selectedFolder === null ? 700 : 400,
                  outline: dragOverPath === '__root__' ? '1px dashed #34d399' : 'none',
                }}
              >
                <span style={{ width: 12 }} />
                <span style={{ fontSize: 13 }}>🗂️</span>
                <span>{tCanvas("folder_root_all")}</span>
              </div>

              {/* 폴더 트리 */}
              {fbxFolderTree.map(node => (
                <FbxFolderNode key={node.path} node={node} depth={0}
                  openFolders={openFolders} selectedFolder={selectedFolder}
                  onSelect={setSelectedFolder} onToggle={toggleFolder}
                  onDrop={moveAssetToFolder} onFolderDrop={moveFolderTo} dragOverPath={dragOverPath} setDragOverPath={setDragOverPath}
                  onDeleteFolder={deleteFolderInStudio} onRenameFolder={renameFolderInStudio} />
              ))}
            </div>

            {/* 오른쪽: 선택된 폴더의 에셋 그리드 */}
            <div
              ref={assetGridRef}
              style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', position: 'relative',
                outline: dropZoneActive ? '2px dashed #34d399' : 'none',
                background: dropZoneActive ? 'rgba(52,211,153,0.06)' : 'transparent',
                transition: 'outline 0.1s, background 0.1s',
              }}
              onPointerDown={onAssetGridPointerDown}
              onPointerMove={onAssetGridPointerMove}
              onPointerUp={onAssetGridPointerUp}
              onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropZoneActive(true); } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropZoneActive(false); }}
              onDrop={e => { e.preventDefault(); setDropZoneActive(false); if (e.dataTransfer.files.length > 0) uploadFilesToFolder(e.dataTransfer.files); }}
              onContextMenu={e => { e.preventDefault(); setAssetCtxMenu({ x: e.clientX, y: e.clientY }); }}
            >
              {/* 다중선택 삭제 바 */}
              {assetSel.size > 0 && (
                <div style={{ position: 'sticky', top: -8, zIndex: 3, margin: '-8px -10px 6px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(30,41,59,0.96)', borderBottom: '1px solid rgba(129,140,248,0.25)' }}>
                  <span style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600 }}>{tCanvas("msg_count_selected", { count: assetSel.size })}</span>
                  <button onClick={() => deleteAssetsBatch([...assetSel])}
                    style={{ background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>{tCanvas("btn_delete_selected")}</button>
                  <button onClick={() => setAssetSel(new Set())}
                    style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 5, color: '#cbd5e1', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>{tCanvas("btn_deselect")}</button>
                </div>
              )}
              {/* 드롭 오버레이 */}
              {dropZoneActive && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
                  <div style={{ fontSize: 13, color: '#6ee7b7', fontWeight: 700 }}>{tCanvas("msg_drop_to_upload")}</div>
                </div>
              )}
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.6)', zIndex: 2, fontSize: 13, color: '#a5b4fc', fontWeight: 700 }}>
                  {tCanvas("msg_uploading")}
                </div>
              )}
              {fbxAssets.length === 0 && selectedSubfolders.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.4, textAlign: 'center', paddingTop: 24 }}>
                  {t('noAssets')}&nbsp;
                  <a href="/assets" style={{ color: '#818cf8' }}>/assets</a> {t('uploadAt')}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 7 }}>
                  {/* 서브폴더 카드 — 파일보다 앞에 */}
                  {selectedSubfolders.map(n => (
                    <StudioFolderCard
                      key={n.path}
                      name={n.name}
                      path={n.path}
                      onNavigate={setSelectedFolder}
                      onFolderDrop={moveFolderTo}
                      onAssetDrop={moveAssetToFolder}
                    />
                  ))}
                  {/* FBX 파일 카드 */}
                  {selectedFolderAssets.map(a => (
                    <StudioAssetCard key={a.id} asset={a} onDelete={deleteAsset} onRename={renameAsset}
                      onPreview={(asset) => {
                        // script 에셋은 일반 모델 프리뷰 대신 코드 편집기로 라우팅
                        if (asset.kind === 'script') { setScriptEditTarget(asset); setScriptEditorOpen(true); }
                        else setPickerPreview(asset);
                      }}
                      selected={assetSel.has(a.id)} />
                  ))}
                  {/* 폴더/파일 모두 없을 때 안내 */}
                  {selectedSubfolders.length === 0 && selectedFolderAssets.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, opacity: 0.35, textAlign: 'center', paddingTop: 16 }}>
                      {tCanvas("msg_drop_fbx_here")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 에셋 마퀴 선택 박스 — 패널이 transform 되어 있어 portal 로 body 에 (뷰포트 좌표) */}
      {assetMarq && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', left: assetMarq.x, top: assetMarq.y, width: assetMarq.w, height: assetMarq.h,
          border: '1px solid #818cf8', background: 'rgba(129,140,248,0.18)', zIndex: 99999, pointerEvents: 'none' }} />,
        document.body
      )}

      {/* 내 에셋 미리보기 모달 */}
      {pickerPreview && (
        <StudioAssetPreview
          asset={pickerPreview}
          allAssets={myAssets}
          onClose={() => setPickerPreview(null)}
          onSaved={(updated) => setMyAssets(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))}
        />
      )}

      {/* 스크립트 에셋 작성/편집 모달 — 컨텍스트 메뉴 "새 스크립트" 또는 카드 클릭 진입점 */}
      <ScriptAssetEditor
        open={scriptEditorOpen}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editing={scriptEditTarget as any}
        folder={selectedFolder}
        onClose={() => { setScriptEditorOpen(false); setScriptEditTarget(null); }}
        onSaved={() => {
          // myAssets 목록 새로고침
          fetch(`${API}/api/assets/my`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.json())
            .then(d => setMyAssets(d.assets || []))
            .catch(() => {});
        }}
      />

      {/* 에셋 그리드 빈 영역 우클릭 → 폴더 만들기 컨텍스트 메뉴 */}
      {assetCtxMenu && (
        <>
          <div
            onClick={() => setAssetCtxMenu(null)}
            onContextMenu={e => { e.preventDefault(); setAssetCtxMenu(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 500 }}
          />
          <div style={{
            position: 'fixed', left: assetCtxMenu.x, top: assetCtxMenu.y, zIndex: 501,
            background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', padding: 4, minWidth: 170,
          }}>
            <button
              type="button"
              onClick={() => { setShowNewFolder(true); setNewFolderName(''); setAssetCtxMenu(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, padding: '9px 11px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              📁 {t('newFolder')}
            </button>
            <button
              type="button"
              onClick={() => { setScriptEditTarget(null); setScriptEditorOpen(true); setAssetCtxMenu(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, padding: '9px 11px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              📜 {tCanvas("ctx_new_script")}
            </button>
            <button
              type="button"
              onClick={() => { setShowMarket(true); setAssetCtxMenu(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, padding: '9px 11px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              🛒 {tAssets("marketTitle")}
            </button>
          </div>
        </>
      )}

      {/* 마켓플레이스 모달 — 공개 에셋 가져오기 → import 시 myAssets 즉시 동기화 */}
      {showMarket && (
        <StudioMarketModal
          token={token()}
          onClose={() => setShowMarket(false)}
          onImported={loadMyAssets}
        />
      )}

      {/* 씬 트리 우클릭 컨텍스트 메뉴 */}
      {treeCtxMenu && (() => {
        const node = treeCtxMenu.objId ? objects.find(o => o.id === treeCtxMenu.objId) : null;
        const itemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, padding: '9px 11px', borderRadius: 6, cursor: 'pointer' };
        const hover = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = on ? 'rgba(129,140,248,0.22)' : 'none'; };
        return (
          <>
            <div
              onClick={() => setTreeCtxMenu(null)}
              onContextMenu={e => { e.preventDefault(); setTreeCtxMenu(null); }}
              style={{ position: 'fixed', inset: 0, zIndex: 500 }}
            />
            <div style={{
              position: 'fixed', left: treeCtxMenu.x, top: treeCtxMenu.y, zIndex: 501,
              background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', padding: 4, minWidth: 180,
            }}>
              {treeCtxMenu.objId === null ? (
                <>
                  <button type="button" style={itemStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                    onClick={() => { addEmpty(); setTreeCtxMenu(null); }}>🔵 {t('addEmpty')}</button>
                  <button type="button" style={itemStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                    onClick={() => { addSpawn(); setTreeCtxMenu(null); }}>🎯 {t('addSpawn')}</button>
                </>
              ) : (
                <>
                  <button type="button" style={itemStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                    onClick={() => { addEmptyChild(treeCtxMenu.objId!); setTreeCtxMenu(null); }}>🔵 {t('addEmptyChild')}</button>
                  {node?.parentId && (
                    <button type="button" style={itemStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                      onClick={() => { reparentObject(treeCtxMenu.objId!, null); setTreeCtxMenu(null); }}>⤴ {t('unparent')}</button>
                  )}
                  <button type="button" style={itemStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                    onClick={() => {
                      // 우클릭 노드를 selected 로 만들고 기존 savePrefab() 호출 (자식 트리 + 썸네일 자동)
                      const id = treeCtxMenu.objId!;
                      setTreeCtxMenu(null);
                      setSelectedId(id);
                      // selRef 동기화 위해 다음 tick 에 호출
                      setTimeout(() => { void savePrefab(); }, 0);
                    }}>🧩 {t('saveAsPrefab') ?? '프리팹으로 저장'}</button>
                  <button type="button" style={{ ...itemStyle, color: '#fca5a5' }} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                    onClick={() => {
                      const id = treeCtxMenu.objId!;
                      if (multiSelectedIds.has(id) && multiSelectedIds.size > 1) {
                        // 다중 선택 안의 노드를 우클릭 → 선택 전체 삭제
                        deleteSelected();
                      } else {
                        setObjects(prev => { const next = prev.filter(o => o.id !== id); pushHistory(next); return next; });
                        if (selectedId === id) setSelectedId(null);
                      }
                      setTreeCtxMenu(null);
                    }}>🗑 {t('mobileDel')}</button>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* 트리 드래그 고스트 — 커서 따라다니는 이름표 */}
      {treeDrag && (() => {
        const o = objects.find(x => x.id === treeDrag.id);
        if (!o) return null;
        return (
          <div style={{
            position: 'fixed', left: treeDrag.x + 12, top: treeDrag.y + 8, zIndex: 600,
            pointerEvents: 'none', background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(129,140,248,0.6)',
            borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, color: '#c7d2fe',
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          }}>
            {KIND_ICONS[o.kind] ?? '❓'} {o.label || o.kind}
          </div>
        );
      })()}

      {/* AI 로 맵 만들기 가이드 */}
      <AiGuideModal
        open={aiGuideOpen}
        onClose={() => setAiGuideOpen(false)}
        onImport={importFromAi}
      />
      {/* 키보드 단축키 안내 */}
      <StudioShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* 내 스크립트 컴포넌트 관리 */}
      <ScriptComponentsModal
        open={scriptComponentsModalOpen}
        editId={scriptEditId}
        onClose={() => { setScriptComponentsModalOpen(false); setScriptEditId(null); }}
        components={scriptComponents}
        onChanged={setScriptComponents}
      />

      {/* 컴포넌트 picker 모달 — 선택된 오브젝트에 컴포넌트 추가 */}
      {componentPickerOpen && selected && (
        <div
          onClick={() => setComponentPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.75)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(520px, 96vw)', maxHeight: '80vh', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{tCanvas("modal_title_add_component")}</div>
              <button type="button" onClick={() => setComponentPickerOpen(false)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ padding: 10 }}>
              <input
                autoFocus
                value={componentPickerSearch}
                onChange={e => setComponentPickerSearch(e.target.value)}
                placeholder={tCanvas("placeholder_component_search")}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 10px', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ padding: '0 10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* 빌트인 컴포넌트 */}
              <button type="button" onClick={() => setPickerCollapsed(p => ({ ...p, builtin: !p.builtin }))}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', marginTop: 2 }}>
                <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: 0.5 }}>BUILT-IN ({COMPONENT_DEFS.length})</span>
                <span style={{ fontSize: 9, opacity: 0.4 }}>{pickerCollapsed.builtin ? '▶' : '▼'}</span>
              </button>
              {!pickerCollapsed.builtin && COMPONENT_DEFS
                .filter(def => {
                  const q = componentPickerSearch.toLowerCase().trim();
                  if (!q) return true;
                  return def.type.toLowerCase().includes(q) || def.name.toLowerCase().includes(q);
                })
                .map(def => {
                  // 선택된 것 전부가 이미 가지고 있을 때만 비활성화 (일부만 있으면 나머지에 추가 가능)
                  const alreadyHas = allSelectedHaveComponent(def.type);
                  return (
                    <button key={def.type} type="button"
                      disabled={alreadyHas}
                      onClick={() => {
                        if (alreadyHas) return;
                        // 선택된 오브젝트 전부에 추가 (이미 있는 건 스킵 — 빌트인은 유일)
                        addComponentToSelection(() => {
                          const inst: ComponentInstance = { type: def.type as ComponentType };
                          if (def.props) {
                            inst.props = {};
                            def.props.forEach(p => { inst.props![p.key] = p.default; });
                          }
                          return inst;
                        }, true);
                      }}
                      style={{
                        textAlign: 'left',
                        background: alreadyHas ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.12)',
                        border: `1px solid ${alreadyHas ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.35)'}`,
                        borderRadius: 8, padding: '10px 12px',
                        cursor: alreadyHas ? 'default' : 'pointer',
                        color: alreadyHas ? 'rgba(255,255,255,0.35)' : '#fff',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{def.icon} {def.name}</span>
                        {alreadyHas && <span style={{ fontSize: 10, opacity: 0.65 }}>{tCanvas("msg_already_added")}</span>}
                      </div>
                      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, lineHeight: 1.4 }}>{def.description}</span>
                    </button>
                  );
                })}

              {/* 공식 컴포넌트 (운영자가 만든 것, 모든 유저 사용 가능) */}
              <button type="button" onClick={() => setPickerCollapsed(p => ({ ...p, official: !p.official }))}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', marginTop: 8 }}>
                <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: 0.5 }}>OFFICIAL ({officialScriptComponents.length})</span>
                <span style={{ fontSize: 9, opacity: 0.4 }}>{pickerCollapsed.official ? '▶' : '▼'}</span>
              </button>
              {!pickerCollapsed.official && officialScriptComponents
                .filter(c => {
                  const q = componentPickerSearch.toLowerCase().trim();
                  if (!q) return true;
                  return c.name.toLowerCase().includes(q);
                })
                .map(c => {
                  const type = `user:${c.id}`;
                  return (
                    <button key={c.id} type="button"
                      onClick={() => {
                        // 선택된 오브젝트 전부에 추가 (유저/공식은 중복 부착 허용)
                        addComponentToSelection(() => {
                          const initProps: Record<string, number | string | boolean> = {};
                          (c.propsSchema ?? []).forEach(p => { initProps[p.key] = p.default; });
                          return { type: type as ComponentType, props: initProps };
                        }, false);
                      }}
                      style={{
                        textAlign: 'left',
                        background: 'rgba(52,211,153,0.10)',
                        border: '1px solid rgba(52,211,153,0.35)',
                        borderRadius: 8, padding: '10px 12px',
                        cursor: 'pointer', color: '#fff',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{c.icon || '🧩'} {c.name}</span>
                        <span style={{ fontSize: 9, background: 'rgba(52,211,153,0.3)', color: '#86efac', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{tCanvas("badge_official")}</span>
                      </div>
                      {c.description && (
                        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, lineHeight: 1.4 }}>{c.description}</span>
                      )}
                    </button>
                  );
                })}
              {!pickerCollapsed.official && officialScriptComponents.length === 0 && (
                <div style={{ fontSize: 10, opacity: 0.35, textAlign: 'center', padding: '6px 0' }}>{tCanvas("msg_no_official_components")}</div>
              )}

              {/* 내 (유저 정의) 컴포넌트 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <button type="button" onClick={() => setPickerCollapsed(p => ({ ...p, my: !p.my }))}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
                  <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: 0.5 }}>MY COMPONENTS ({scriptComponents.length})</span>
                  <span style={{ fontSize: 9, opacity: 0.4 }}>{pickerCollapsed.my ? '▶' : '▼'}</span>
                </button>
                <button type="button"
                  onClick={() => { setComponentPickerOpen(false); setScriptComponentsModalOpen(true); }}
                  style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                  {tCanvas("btn_manage_create")}
                </button>
              </div>
              {!pickerCollapsed.my && scriptComponents
                .filter(c => {
                  const q = componentPickerSearch.toLowerCase().trim();
                  if (!q) return true;
                  return c.name.toLowerCase().includes(q);
                })
                .map(c => {
                  // user: 접두사로 부착. 같은 컴포넌트 여러 번 부착 허용 (props 만 다르면 동작 다르게 가능)
                  const type = `user:${c.id}`;
                  return (
                    <button key={c.id} type="button"
                      onClick={() => {
                        // 선택된 오브젝트 전부에 추가 (유저/공식은 중복 부착 허용)
                        addComponentToSelection(() => {
                          const initProps: Record<string, number | string | boolean> = {};
                          (c.propsSchema ?? []).forEach(p => { initProps[p.key] = p.default; });
                          return { type: type as ComponentType, props: initProps };
                        }, false);
                      }}
                      style={{
                        textAlign: 'left',
                        background: 'rgba(251,191,36,0.10)',
                        border: '1px solid rgba(251,191,36,0.35)',
                        borderRadius: 8, padding: '10px 12px',
                        cursor: 'pointer', color: '#fff',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{c.icon || '🧩'} {c.name}</span>
                      {c.description && (
                        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, lineHeight: 1.4 }}>{c.description}</span>
                      )}
                    </button>
                  );
                })}
              {!pickerCollapsed.my && scriptComponents.length === 0 && (
                <div style={{ fontSize: 11, opacity: 0.4, textAlign: 'center', padding: '10px 0', lineHeight: 1.5 }}>
                  {tCanvas("msg_no_my_components")}<br/>
                  {tCanvas("msg_create_via_manage")}
                </div>
              )}

              {/* 내 Script Asset — 에셋 라이브러리에서 가져와 부착 */}
              {scriptAssets.length > 0 && (
                <>
                  <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 700, letterSpacing: 0.5, marginTop: 8, padding: '2px 0' }}>
                    📜 FROM ASSETS ({scriptAssets.length})
                  </div>
                  {scriptAssets
                    .filter(a => {
                      const q = componentPickerSearch.toLowerCase().trim();
                      if (!q) return true;
                      return a.name.toLowerCase().includes(q);
                    })
                    .map(a => {
                      // 이미 같은 이름의 내 컴포넌트 있으면 "이미 가져옴" 표시
                      const already = scriptComponents.some(c => c.name === a.name);
                      return (
                        <button key={a.id} type="button"
                          disabled={already}
                          onClick={async () => {
                            const tok = session.getToken();
                            if (!tok) return;
                            try {
                              const meta = (a.metadata || {}) as { code?: string; icon?: string; propsSchema?: import('@/lib/api').ScriptComponentPropDef[] };
                              const created = await api.createScriptComponent(tok, {
                                name: a.name,
                                icon: meta.icon || '📜',
                                description: tCanvas("desc_imported_from_asset"),
                                code: meta.code || '',
                                propsSchema: Array.isArray(meta.propsSchema) ? meta.propsSchema : [],
                              });
                              // 목록 갱신 + 자동 부착
                              setScriptComponents(prev => [...prev, created.component]);
                              const initProps: Record<string, number | string | boolean> = {};
                              (created.component.propsSchema ?? []).forEach(p => { initProps[p.key] = p.default; });
                              addComponentToSelection(() => ({
                                type: `user:${created.component.id}` as ComponentType,
                                props: initProps,
                              }), false);
                            } catch (e) {
                              console.warn('[scriptAsset] import fail', e);
                            }
                          }}
                          style={{
                            textAlign: 'left',
                            background: already ? 'rgba(168,85,247,0.04)' : 'rgba(168,85,247,0.12)',
                            border: `1px solid ${already ? 'rgba(168,85,247,0.15)' : 'rgba(168,85,247,0.4)'}`,
                            borderRadius: 8, padding: '10px 12px',
                            cursor: already ? 'default' : 'pointer',
                            color: already ? 'rgba(255,255,255,0.4)' : '#fff',
                            display: 'flex', flexDirection: 'column', gap: 3,
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{(a.metadata?.icon as string) || '📜'} {a.name}</span>
                            <span style={{ fontSize: 9, background: 'rgba(168,85,247,0.3)', color: '#e9d5ff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{tCanvas("kind_asset")}</span>
                            {already && <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 'auto' }}>{tCanvas("msg_already_imported")}</span>}
                          </div>
                        </button>
                      );
                    })}
                </>
              )}

              {!pickerCollapsed.my && false && (
                <div style={{ display: 'none' }}></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI UI JSON 가져오기 모달 ── */}
      {uiJsonModalOpen && (
        <div
          onClick={() => setUiJsonModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)', zIndex: 16777280, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, width: 'min(720px, 100%)', maxHeight: '90vh', padding: 20, color: '#fff', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{tCanvas("modal_title_ai_ui_json")}</div>
              <button onClick={() => setUiJsonModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', padding: '0 6px' }}>×</button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
              {tCanvas("ai_ui_json_intro")}
            </div>
            <details style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#c4b5fd' }}>{tCanvas("section_ai_spec")}</summary>
              <textarea readOnly value={AI_UI_PROMPT_GUIDE}
                style={{ width: '100%', height: 240, marginTop: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#cbd5e1', fontFamily: 'monospace', fontSize: 11, padding: 10, resize: 'vertical', outline: 'none' }}
                onClick={e => (e.target as HTMLTextAreaElement).select()} />
              <button
                onClick={() => { navigator.clipboard?.writeText(AI_UI_PROMPT_GUIDE).catch(() => {}); }}
                style={{ marginTop: 6, background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 6, color: '#e9d5ff', fontSize: 11, padding: '5px 12px', cursor: 'pointer', fontWeight: 700 }}>
                {tCanvas("btn_copy_spec")}
              </button>
            </details>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{tCanvas("label_json_paste")}</div>
            <textarea
              value={uiJsonText}
              onChange={e => { setUiJsonText(e.target.value); setUiJsonError(null); }}
              placeholder='{"canvases":[{"type":"canvas","space":"screen","children":[...]}]}'
              style={{ flex: 1, minHeight: 200, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#fff', fontFamily: 'monospace', fontSize: 12, padding: 12, resize: 'vertical', outline: 'none' }} />
            {uiJsonError && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 11, padding: '8px 12px' }}>{uiJsonError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setUiJsonModalOpen(false)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, color: '#fff', fontSize: 12, padding: '8px 16px', cursor: 'pointer' }}>{tCanvas("btn_cancel")}</button>
              <button
                onClick={() => {
                  const res = importUiFromJson(uiJsonText);
                  if (res.ok) { setUiJsonModalOpen(false); setUiJsonText(''); setUiJsonError(null); }
                  else setUiJsonError(res.error);
                }}
                style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, padding: '8px 18px', cursor: 'pointer', fontWeight: 700 }}>
                {tCanvas("btn_import")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
