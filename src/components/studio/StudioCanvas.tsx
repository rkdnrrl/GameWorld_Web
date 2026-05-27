'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Sky, Environment } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { buildFolderTree, normalizeFolder } from '@/lib/assets/folders';
import type { FolderNode } from '@/lib/assets/folders';

const KIND_LABELS: Record<string, string> = { cube: '큐브', sphere: '구체', cylinder: '실린더', plane: '평면', asset: '에셋', pointlight: '포인트 라이트', spotlight: '스폿 라이트', dirlight: '방향광' };
const KIND_ICONS:  Record<string, string> = { cube: '📦', sphere: '⚪', cylinder: '🥫', plane: '▭', asset: '🎲', pointlight: '💡', spotlight: '🔦', dirlight: '☀' };

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
type ObjectKind = 'cube' | 'sphere' | 'cylinder' | 'plane' | 'asset' | 'pointlight' | 'spotlight' | 'dirlight';

type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

interface MapObject {
  id: string;
  label?: string;
  locked?: boolean;
  hidden?: boolean;
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
  // 조명 전용
  lightColor?:     string;
  lightIntensity?: number;
  lightDistance?:  number;
  lightAngle?:     number;   // 스폿 각도 (degrees)
  lightPenumbra?:  number;   // 스폿 경계 부드러움 0-1
  castShadow?:     boolean;
  // 물리
  physics?: 'none' | 'fixed' | 'dynamic';
  // JavaScript 스크립트
  script?: string;
}

interface Asset {
  id: string;
  name: string;
  modelUrl: string;
  folder?: string | null;
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

/* ── 에셋 카드 (우측 그리드) ─────────────── */
function StudioAssetCard({ asset, onDelete, onRename }: {
  asset: Asset;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');

  function confirmRename() {
    const v = editVal.trim();
    if (v && v !== asset.name) onRename(asset.id, v);
    setEditing(false);
  }

  return (
    <div
      style={{ position: 'relative', borderRadius: 8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        tabIndex={0}
        draggable={!editing}
        onDragStart={e => { e.dataTransfer.setData('text/plain', asset.id); e.dataTransfer.effectAllowed = 'move'; }}
        style={{
          background: hovered ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8, color: '#e2e8f0', fontSize: 11, padding: '8px 6px',
          cursor: editing ? 'default' : 'grab',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          userSelect: 'none', transition: 'background 0.12s',
        }}>
        <span style={{ fontSize: 22 }}>
          {/\.(fbx|obj|glb|gltf)$/i.test(asset.modelUrl) ? '📦' :
           /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.modelUrl) ? '🖼️' :
           /\.(mp3|wav|ogg|aac)$/i.test(asset.modelUrl) ? '🎵' :
           /\.(mp4|webm|mov)$/i.test(asset.modelUrl) ? '🎬' : '📄'}
        </span>
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
            title="더블클릭하여 이름 변경"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', fontWeight: 500 }}>
            {asset.name}
          </span>
        )}
      </div>
      {hovered && !editing && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(asset.id); }}
          title="에셋 삭제"
          style={{
            position: 'absolute', top: 3, right: 3,
            background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 4,
            color: '#fff', fontSize: 10, cursor: 'pointer', padding: '2px 5px', lineHeight: 1,
          }}>🗑</button>
      )}
    </div>
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
function StudioFolderCard({ name, path, onNavigate, onFolderDrop }: {
  name: string;
  path: string;
  onNavigate: (path: string) => void;
  onFolderDrop: (fromPath: string, toPath: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('folderPath', path); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setDragOver(false);
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
              title="더블클릭하여 이름 변경"
              style={{ fontSize: 12, fontWeight: isSelected ? 700 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDeleteFolder(node.path); }}
          title="폴더 삭제"
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
function Mesh3D({ obj, selected, onClick, assetConfig, noTransform = false }: {
  obj: MapObject;
  selected: boolean;
  onClick: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetConfig?: any;
  noTransform?: boolean;
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

  const geometry =
    obj.kind === 'sphere'   ? <sphereGeometry args={[0.5, 24, 16]} /> :
    obj.kind === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 16]} /> :
    obj.kind === 'plane'    ? <planeGeometry args={[1, 1]} /> :
                              <boxGeometry args={[1, 1, 1]} />;
  // noTransform=true: 위치/userData는 외부 SceneNode group이 담당
  return (
    <mesh ref={ref}
      position={noTransform ? undefined : obj.position}
      rotation={noTransform ? undefined : obj.rotation}
      scale={noTransform ? undefined : obj.scale}
      onPointerDown={handle} castShadow receiveShadow
      userData={noTransform ? {} : { id: obj.id }}>
      {geometry}
      <PrimitiveMaterial obj={obj} selected={selected} />
    </mesh>
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

  const side = obj.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
  if (matRef.current) {
    matRef.current.side = side;
    matRef.current.emissive.set(selected ? '#334155' : '#000000');
    matRef.current.emissiveIntensity = selected ? 0.4 : 0;
    return <primitive object={matRef.current} attach="material" />;
  }
  return <meshStandardMaterial color={obj.color} side={side}
    emissive={selected ? '#334155' : '#000000'}
    emissiveIntensity={selected ? 0.4 : 0} />;
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
        angle={angle} penumbra={penumbra} decay={2} castShadow={castShadow}
      />
      {/* 그룹이 같은 parent group 안에 있으므로 회전이 적용된 local -Y 방향을 target으로 사용 */}
      <group ref={targetRef} position={[0, -5, 0]} />
    </>
  );
}

/* ── 씬 노드 (부모→자식 재귀 렌더링) ─────── */
function SceneNode({ obj, allObjects, selectedId, multiSelectedIds, onObjectClick, myAssets }: {
  obj: MapObject;
  allObjects: MapObject[];
  selectedId: string | null;
  multiSelectedIds: Set<string>;
  onObjectClick: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  myAssets: any[];
}) {
  const isSelected = obj.id === selectedId || multiSelectedIds.has(obj.id);
  const children = allObjects.filter(c => c.parentId === obj.id);

  // 조명 오브젝트
  if (obj.kind === 'pointlight' || obj.kind === 'spotlight' || obj.kind === 'dirlight') {
    return (
      <group position={obj.position} rotation={obj.rotation} scale={[1, 1, 1]} userData={{ id: obj.id }}>
        {obj.kind === 'dirlight' && (
          <directionalLight
            color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1}
            castShadow={obj.castShadow ?? false}
          />
        )}
        {obj.kind === 'pointlight' && (
          <pointLight
            color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1}
            distance={obj.lightDistance ?? 0}
            decay={2}
            castShadow={obj.castShadow ?? false}
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
        {children.map(child => (
          <SceneNode key={child.id} obj={child} allObjects={allObjects}
            selectedId={selectedId} multiSelectedIds={multiSelectedIds}
            onObjectClick={onObjectClick} myAssets={myAssets} />
        ))}
      </group>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetConfig: any = obj.kind === 'asset' && obj.assetUrl
    ? (myAssets.find((a: any) => a.modelUrl === obj.assetUrl)?.metadata?.materialConfig ??
       myAssets.find((a: any) => a.modelUrl === obj.assetUrl)?.materialConfig ?? null)
    : undefined;

  return (
    /* userData.id는 이 group에 → TransformControls이 이 group을 조작 → 자식도 함께 이동 */
    <group position={obj.position} rotation={obj.rotation} scale={obj.scale} userData={{ id: obj.id }}>
      <Mesh3D obj={obj} selected={isSelected} onClick={() => onObjectClick(obj.id)} assetConfig={assetConfig} noTransform />
      {children.map(child => (
        <SceneNode key={child.id} obj={child} allObjects={allObjects}
          selectedId={selectedId} multiSelectedIds={multiSelectedIds}
          onObjectClick={onObjectClick} myAssets={myAssets} />
      ))}
    </group>
  );
}

/* ── 씬 목록 노드 (UI 계층 트리) ──────────── */
function SceneListNode({ obj, allObjects, depth, selectedId, multiSelectedIds, editingLabelId, editingLabelValue, setEditingLabelId, setEditingLabelValue, setObjects, selectedCallback, pushHistory, onReparent, onFocusObject }: {
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
  onReparent: (childId: string, newParentId: string | null) => void;
  onFocusObject: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const children = allObjects.filter(c => c.parentId === obj.id);
  const hasChildren = children.length > 0;
  const isSel = obj.id === selectedId || multiSelectedIds.has(obj.id);
  const i = allObjects.findIndex(o => o.id === obj.id);

  return (
    <div>
      <div
        draggable
        onDragStart={e => { e.dataTransfer.setData('sceneObjId', obj.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setDragOver(false);
          const childId = e.dataTransfer.getData('sceneObjId');
          if (childId && childId !== obj.id) onReparent(childId, obj.id);
        }}
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
          onClick={e => { e.stopPropagation(); if (hasChildren) setOpen(!open); }}
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
            title="더블클릭 이름 변경 / 드래그하여 부모 설정"
            style={{ flex: 1, fontSize: 11, fontWeight: isSel ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSel ? '#a5b4fc' : '#e2e8f0' }}>
            {obj.label || `${KIND_LABELS[obj.kind] ?? obj.kind} ${i + 1}`}
          </span>
        )}
        {/* 아이콘 버튼들 */}
        <button onClick={e => { e.stopPropagation(); setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, hidden: !o.hidden } : o)); }}
          style={{ background: 'none', border: 'none', color: obj.hidden ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)', fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>
          {obj.hidden ? '🙈' : '👁'}
        </button>
        <button onClick={e => { e.stopPropagation(); setObjects(prev => prev.map(o => o.id === obj.id ? { ...o, locked: !o.locked } : o)); }}
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
          pushHistory={pushHistory} onReparent={onReparent} onFocusObject={onFocusObject} />
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

/* ── 시뮬레이션: 물리 씬 렌더러 (평면화 — 세계좌표 기준) ── */
type SimTransforms = Record<string, { pos: [number, number, number]; rot: [number, number, number]; scl: [number, number, number] }>;
function SimScene({ objects, transforms, myAssets }: {
  objects: MapObject[];
  transforms: SimTransforms;
  myAssets: Asset[];
}) {
  return (
    <>
      {objects.map(obj => {
        const t = transforms[obj.id] ?? { pos: obj.position, rot: obj.rotation, scl: obj.scale };
        // 조명은 Three.js 라이트로 렌더링 (물리 없음)
        if (obj.kind === 'pointlight') return (
          <pointLight key={obj.id} position={t.pos} color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1} distance={obj.lightDistance ?? 0} decay={2} castShadow={obj.castShadow ?? false} />
        );
        if (obj.kind === 'dirlight') return (
          <directionalLight key={obj.id} position={t.pos} color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1} castShadow={obj.castShadow ?? false} />
        );
        if (obj.kind === 'spotlight') return (
          <spotLight key={obj.id} position={t.pos} color={obj.lightColor || '#ffffff'}
            intensity={obj.lightIntensity ?? 1} distance={obj.lightDistance ?? 0}
            angle={(obj.lightAngle ?? 45) * Math.PI / 180} penumbra={obj.lightPenumbra ?? 0.2}
            decay={2} castShadow={obj.castShadow ?? false} />
        );

        const assetConfig = getAssetMaterialConfig(myAssets.find(a => a.modelUrl === obj.assetUrl));
        // noTransform=true → 위치/스케일은 부모(RigidBody or group)가 담당
        const mesh = <Mesh3D obj={obj} selected={false} onClick={() => {}} assetConfig={assetConfig} noTransform />;
        const phys = obj.physics ?? 'fixed';

        if (phys === 'none') {
          return <group key={obj.id} position={t.pos} rotation={t.rot} scale={t.scl}>{mesh}</group>;
        }
        const colliders =
          obj.kind === 'sphere'  ? 'ball'    :
          obj.kind === 'asset'   ? (phys === 'dynamic' ? 'hull' : 'trimesh') :
                                   'cuboid';
        return (
          <RigidBody key={obj.id} type={phys} colliders={colliders}
            position={t.pos} rotation={t.rot} scale={t.scl}>
            {mesh}
          </RigidBody>
        );
      })}
    </>
  );
}

/* ── 변환 컨트롤 ──────────────────────────── */
function SelectedTransform({ targetId, mode, onChange, onDragEnd, onDragStart, snapTranslate, snapRotate, snapScale }: {
  targetId: string | null;
  mode: 'translate' | 'rotate' | 'scale';
  onChange: (id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) => void;
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

/** 우클릭 드래그 = 카메라 제자리 시점 회전 (look-around) */
function RightClickLook({ orbitRef }: { orbitRef: React.MutableRefObject<OrbitRef | null> }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0, lastY = 0;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
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

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
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
  // 시뮬레이션
  const [simulating, setSimulating] = useState(false);
  const [simTransforms, setSimTransforms] = useState<SimTransforms>({});
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const [name, setName]             = useState(t('newWorldDefault'));
  const [description, setDescription] = useState('');
  const [savedId, setSavedId]       = useState<string | null>(editingId);
  const [saving, setSaving]         = useState(false);
  const [myAssets, setMyAssets]     = useState<Asset[]>([]);
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
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [texPicker, setTexPicker] = useState<null | 'albedo' | 'normal' | 'roughness'>(null);
  const [dragOverTex, setDragOverTex] = useState<string | null>(null);
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
  const [lightAmbient, setLightAmbient] = useState(0.04);  // 기본: 거의 꺼짐
  const [lightDir, setLightDir] = useState(0.0);            // 기본: 없음
  const [skyEnabled, setSkyEnabled] = useState(false);
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  const [shapePanelOpen, setShapePanelOpen] = useState(false);
  const [lightAddPanelOpen, setLightAddPanelOpen] = useState(false);
  const [matPanelOpen, setMatPanelOpen] = useState(false);
  const [studioMode, setStudioMode] = useState<'settings' | 'scene'>('settings');
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [marqueeStart, setMarqueeStart] = useState<{x:number,y:number}|null>(null);
  const [marqueeEnd,   setMarqueeEnd]   = useState<{x:number,y:number}|null>(null);
  const isMarqueeRef = useRef(false);
  const dragStartRef = useRef<Map<string, {p:[number,number,number];r:[number,number,number];s:[number,number,number]}>>(new Map());
  const shiftHeldRef = useRef(false);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);
  // HDRI 환경
  type HdriPreset = 'none' | 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'studio' | 'sunset' | 'warehouse';
  const [hdriPreset, setHdriPreset] = useState<HdriPreset>('none');
  const [hdriUrl, setHdriUrl] = useState('');          // 커스텀 URL (.hdr/.exr)
  const [hdriBackground, setHdriBackground] = useState(false); // HDRI를 배경으로 표시
  // 썸네일 캡처 함수 (Canvas 내부에서 등록)
  const captureFnRef = useRef<(() => string | null) | null>(null);
  const cameraRef    = useRef<THREE.Camera | null>(null);
  const viewportRef  = useRef<HTMLDivElement | null>(null);

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
        setDescription(d.world.description || '');
        setIsPublic(Boolean(d.world.isPublic));
        // 씬 설정 복원
        const ss = d.world.mapData?.sceneSettings || {};
        if (ss.lightAmbient  !== undefined) setLightAmbient(ss.lightAmbient);
        if (ss.lightDir      !== undefined) setLightDir(ss.lightDir);
        if (ss.skyEnabled    !== undefined) setSkyEnabled(ss.skyEnabled);
        if (ss.hdriPreset    !== undefined) setHdriPreset(ss.hdriPreset);
        if (ss.hdriUrl       !== undefined) setHdriUrl(ss.hdriUrl);
        if (ss.hdriBackground !== undefined) setHdriBackground(ss.hdriBackground);
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
      // 시뮬레이션 중: Escape로 중지, 나머지 단축키 무시
      if (simulating) {
        if (e.key === 'Escape') stopSim();
        return;
      }
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
      else if ((e.key === 'f' || e.key === 'F') && selectedId) focusObject(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, simulating, undo, redo, pushHistory, focusObject]);

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

  // KIND_LABELS / KIND_ICONS — 모듈 상단으로 이동됨

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
    setSimulating(true);
  }

  function stopSim() {
    setSimulating(false);
    setSimTransforms({});
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
        castShadow:     true,
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
        position,
        rotation: [0, 0, 0],
        scale:    [1, 1, 1],
        color:    '#fff',
        ...(getAssetMaterialConfig(asset) || {}),
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
    if (!window.confirm(`"${asset?.name ?? assetId}" 에셋을 영구 삭제하시겠습니까?`)) return;
    setMyAssets(prev => prev.filter(a => a.id !== assetId));
    try {
      await fetch(`${API}/api/assets/${assetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
    } catch (e) { console.error('삭제 실패', e); }
  }

  async function deleteFolderInStudio(folderPath: string) {
    const folderName = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
    const toDelete = myAssets.filter(a => {
      const f = normalizeFolder(a.folder);
      return f === folderPath || (f !== null && f.startsWith(folderPath + '/'));
    });
    const msg = toDelete.length > 0
      ? `"${folderName}" 폴더를 삭제하면 안에 있는 에셋 ${toDelete.length}개도 모두 영구 삭제됩니다.\n\n계속하시겠습니까?`
      : `"${folderName}" 폴더를 삭제하시겠습니까?`;
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

  function onTransformDragStart() {
    // 드래그 시작 시 모든 선택 오브젝트의 transform 스냅샷
    const map = new Map<string, {p:[number,number,number];r:[number,number,number];s:[number,number,number]}>();
    const ids = multiSelectedIds.size > 0 ? [...multiSelectedIds] : selectedId ? [selectedId] : [];
    for (const oid of ids) {
      const obj = objects.find(o => o.id === oid);
      if (obj) map.set(oid, { p: [...obj.position] as [number,number,number], r: [...obj.rotation] as [number,number,number], s: [...obj.scale] as [number,number,number] });
    }
    dragStartRef.current = map;
  }

  /** 오브젝트의 world matrix 계산 (조상을 재귀적으로 곱함) */
  function computeWorldMatrix(objId: string, allObjs: MapObject[]): THREE.Matrix4 {
    const obj = allObjs.find(o => o.id === objId);
    if (!obj) return new THREE.Matrix4();
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...obj.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.rotation, 'XYZ')),
      new THREE.Vector3(...obj.scale),
    );
    if (obj.parentId) {
      return computeWorldMatrix(obj.parentId, allObjs).multiply(local);
    }
    return local;
  }

  function reparentObject(childId: string, newParentId: string | null) {
    // 순환 방지
    const isDescendant = (targetId: string, ancestorId: string): boolean => {
      const obj = objects.find(o => o.id === targetId);
      if (!obj || !obj.parentId) return false;
      if (obj.parentId === ancestorId) return true;
      return isDescendant(obj.parentId, ancestorId);
    };
    if (newParentId && isDescendant(newParentId, childId)) return;

    // child의 현재 world transform
    const childWorld = computeWorldMatrix(childId, objects);

    // 새 부모 공간으로 변환 (없으면 world 그대로)
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

  function updateObjectTransform(id: string, t: { p: [number,number,number]; r: [number,number,number]; s: [number,number,number] }) {
    const start = dragStartRef.current;
    const primaryStart = start.get(id);

    if (!primaryStart || multiSelectedIds.size <= 1) {
      // 단일 선택 — 그대로
      setObjects(prev => prev.map(o => o.id === id ? { ...o, position: t.p, rotation: t.r, scale: t.s } : o));
      return;
    }

    // delta 계산 (start 기준)
    const dp: [number,number,number] = [t.p[0]-primaryStart.p[0], t.p[1]-primaryStart.p[1], t.p[2]-primaryStart.p[2]];
    const dr: [number,number,number] = [t.r[0]-primaryStart.r[0], t.r[1]-primaryStart.r[1], t.r[2]-primaryStart.r[2]];
    const ds: [number,number,number] = [
      primaryStart.s[0] !== 0 ? t.s[0]/primaryStart.s[0] : 1,
      primaryStart.s[1] !== 0 ? t.s[1]/primaryStart.s[1] : 1,
      primaryStart.s[2] !== 0 ? t.s[2]/primaryStart.s[2] : 1,
    ];

    setObjects(prev => prev.map(o => {
      if (o.id === id) return { ...o, position: t.p, rotation: t.r, scale: t.s };
      if (!multiSelectedIds.has(o.id)) return o;
      const os = start.get(o.id);
      if (!os) return o;
      return {
        ...o,
        position: [os.p[0]+dp[0], os.p[1]+dp[1], os.p[2]+dp[2]] as [number,number,number],
        rotation: [os.r[0]+dr[0], os.r[1]+dr[1], os.r[2]+dr[2]] as [number,number,number],
        scale:    [os.s[0]*ds[0], os.s[1]*ds[1], os.s[2]*ds[2]] as [number,number,number],
      };
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

      const sceneSettings = { lightAmbient, lightDir, skyEnabled, hdriPreset, hdriUrl, hdriBackground };
      const payload: Record<string, unknown> = { name, description, mapData: { objects, sceneSettings }, isPublic };
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
      {(isMobile || studioMode === 'settings') && <div style={{
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

        {/* 월드 이름 + 설명 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>{t('worldName')}</div>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '7px 10px', outline: 'none' }} />
          <div style={{ fontSize: 11, opacity: 0.5, margin: '8px 0 4px' }}>설명 (선택)</div>
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
            placeholder="월드를 소개하는 짧은 글을 써주세요"
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 11, padding: '6px 10px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
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
      </div>}
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

      {/* ── 우측 패널: 씬 계층 + 인스펙터 ─── */}
      {studioMode === 'scene' && <div style={{
        width: 260, flexShrink: 0,
        background: '#1e293b',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        color: '#fff',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        {/* ── 뒤로가기 버튼 ── */}
        <div style={{ flexShrink: 0, padding: '8px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => { setStudioMode('settings'); setSelectedId(null); setMultiSelectedIds(new Set()); }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700 }}>
            ← 스튜디오
          </button>
        </div>
        {/* ── 씬 계층 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.1)', minHeight: 0, flex: '0 0 auto', maxHeight: '40%' }}>
          <div style={{ padding: '6px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, letterSpacing: 0.5 }}>씬 오브젝트</span>
            <span style={{ fontSize: 10, opacity: 0.35, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '1px 7px' }}>{objects.length}</span>
          </div>
          {/* 루트 드롭 영역 (자식 → 루트로 올리기) */}
          <div
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('sceneObjId'); if (id) reparentObject(id, null); }}
            style={{ overflowY: 'auto', flex: 1, padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            {objects.length === 0 ? (
              <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', paddingTop: 20 }}>오브젝트 없음</div>
            ) : objects.filter(o => !o.parentId).map(obj => (
              <SceneListNode key={obj.id} obj={obj} allObjects={objects} depth={0}
                selectedId={selectedId} multiSelectedIds={multiSelectedIds}
                editingLabelId={editingLabelId} editingLabelValue={editingLabelValue}
                setEditingLabelId={setEditingLabelId} setEditingLabelValue={setEditingLabelValue}
                setObjects={setObjects} pushHistory={pushHistory}
                onReparent={reparentObject}
                onFocusObject={focusObject}
                selectedCallback={id => {
                  if (shiftHeldRef.current) {
                    shiftClickObject(id);
                  } else {
                    setStudioMode('scene');
                    setMultiSelectedIds(new Set());
                    setSelectedId(id);
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* ── 추가 버튼: 도형 + 조명 ── */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px 8px' }}>
          {/* 도형 추가 */}
          <button type="button" onClick={() => setShapePanelOpen(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '4px 8px', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
            📦 {t('addShape')} {shapePanelOpen ? '▲' : '▼'}
          </button>
          {shapePanelOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 5 }}>
              {([['cube','📦','shapeCube'],['sphere','⚪','shapeSphere'],['cylinder','🥫','shapeCylinder'],['plane','▭','shapePlane']] as const).map(([kind, icon, labelKey]) => (
                <button key={kind} onClick={() => addPrimitive(kind)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
                  {icon} {t(labelKey)}
                </button>
              ))}
            </div>
          )}
          {/* 조명 추가 */}
          <button type="button" onClick={() => setLightAddPanelOpen(v => !v)}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}>
            💡 조명 추가 {lightAddPanelOpen ? '▲' : '▼'}
          </button>
          {lightAddPanelOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginTop: 4 }}>
              <button onClick={() => addLight('pointlight')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
                💡 포인트
              </button>
              <button onClick={() => addLight('spotlight')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
                🔦 스폿
              </button>
              <button onClick={() => addLight('dirlight')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 3px', cursor: 'pointer' }}>
                ☀ 방향광
              </button>
            </div>
          )}
        </div>

        {/* ── 인스펙터 ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {!selected ? (
            <div style={{ fontSize: 11, opacity: 0.3, textAlign: 'center', paddingTop: 32 }}>
              오브젝트를 선택하세요
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, marginBottom: 10, letterSpacing: 0.5 }}>
                {KIND_ICONS[selected.kind] ?? '❓'} {selected.label || selected.kind}
              </div>

              {/* 위치/회전/스케일 탭 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 6 }}>
                {(['translate','rotate','scale'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    style={{ background: mode === m ? '#4f46e5' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 10, padding: '5px 0', cursor: 'pointer', fontWeight: 600 }}>
                    {m === 'translate' ? '이동' : m === 'rotate' ? '회전' : '스케일'}
                  </button>
                ))}
              </div>

              {/* 스냅 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <button
                  onClick={() => setSnapEnabled(v => !v)}
                  style={{ flex: 1, background: snapEnabled ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${snapEnabled ? '#34d399' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: snapEnabled ? '#34d399' : 'rgba(255,255,255,0.4)', fontSize: 10, padding: '4px 0', cursor: 'pointer', fontWeight: 600 }}>
                  {snapEnabled ? '⊞ 스냅 ON' : '⊟ 스냅 OFF'}
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

              {/* 물리 — 조명 외 오브젝트에만 표시 */}
              {selected.kind !== 'pointlight' && selected.kind !== 'spotlight' && selected.kind !== 'dirlight' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>물리 / 콜라이더</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                    {(['none', 'fixed', 'dynamic'] as const).map(mode => {
                      const active = (selected.physics ?? 'fixed') === mode;
                      const labels = { none: '🚫 없음', fixed: '🧱 고정', dynamic: '🎲 동적' };
                      return (
                        <button key={mode}
                          onClick={() => { setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, physics: mode } : o)); pushHistory(objects); }}
                          style={{ background: active ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)', border: `1px solid ${active ? '#818cf8' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: active ? '#c7d2fe' : 'rgba(255,255,255,0.65)', fontSize: 10, padding: '5px 3px', cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
                          {labels[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 조명 속성 (pointlight / spotlight 전용) */}
              {(selected.kind === 'pointlight' || selected.kind === 'spotlight' || selected.kind === 'dirlight') && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6 }}>조명 설정</div>
                  {/* 색상 */}
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>색상</div>
                    <input type="color" value={selected.lightColor || '#ffffff'}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightColor: e.target.value } : o))}
                      onBlur={() => pushHistory(objects)}
                      style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
                  </div>
                  {/* 강도 */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    강도 {(selected.lightIntensity ?? 1).toFixed(1)}
                    <input type="range" min={0} max={10} step={0.1} value={selected.lightIntensity ?? 1}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightIntensity: Number(e.target.value) } : o))}
                      onMouseUp={() => pushHistory(objects)}
                      style={{ accentColor: '#fbbf24' }} />
                  </label>
                  {/* 거리 (0 = 무한) */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                    거리 (0=무한) {(selected.lightDistance ?? 0).toFixed(0)}
                    <input type="range" min={0} max={50} step={1} value={selected.lightDistance ?? 0}
                      onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightDistance: Number(e.target.value) } : o))}
                      onMouseUp={() => pushHistory(objects)}
                      style={{ accentColor: '#fbbf24' }} />
                  </label>
                  {/* 스폿 전용 */}
                  {selected.kind === 'spotlight' && (<>
                    <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      각도 {(selected.lightAngle ?? 45).toFixed(0)}°
                      <input type="range" min={1} max={89} step={1} value={selected.lightAngle ?? 45}
                        onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightAngle: Number(e.target.value) } : o))}
                        onMouseUp={() => pushHistory(objects)}
                        style={{ accentColor: '#fbbf24' }} />
                    </label>
                    <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                      경계 부드러움 {(selected.lightPenumbra ?? 0.2).toFixed(2)}
                      <input type="range" min={0} max={1} step={0.05} value={selected.lightPenumbra ?? 0.2}
                        onChange={e => setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, lightPenumbra: Number(e.target.value) } : o))}
                        onMouseUp={() => pushHistory(objects)}
                        style={{ accentColor: '#fbbf24' }} />
                    </label>
                  </>)}
                  {/* 그림자 */}
                  <label style={{ fontSize: 10, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.castShadow ?? true}
                      onChange={e => { setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, castShadow: e.target.checked } : o)); pushHistory(objects); }} />
                    그림자 투영
                  </label>
                </div>
              )}

              {/* ── JavaScript 스크립트 에디터 ── */}
              {selected.kind !== 'pointlight' && selected.kind !== 'spotlight' && selected.kind !== 'dirlight' && (
                <div style={{ marginBottom: 10 }}>
                  <button type="button" onClick={() => setObjects(prev => prev.map(o =>
                    o.id === selected.id ? { ...o, _scriptOpen: !(o as MapObject & { _scriptOpen?: boolean })._scriptOpen } : o
                  ))}
                    style={{ width: '100%', textAlign: 'left', background: selected.script ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${selected.script ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, color: selected.script ? '#a5b4fc' : 'rgba(255,255,255,0.65)', fontSize: 11, padding: '5px 8px', cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}>
                    📝 JavaScript 스크립트 {selected.script ? '✓' : ''} {(selected as MapObject & { _scriptOpen?: boolean })._scriptOpen ? '▲' : '▼'}
                  </button>
                  {(selected as MapObject & { _scriptOpen?: boolean })._scriptOpen && (
                    <div>
                      <textarea
                        value={selected.script ?? ''}
                        onChange={e => setObjects(prev => prev.map(o =>
                          o.id === selected.id ? { ...o, script: e.target.value } : o
                        ))}
                        onBlur={() => pushHistory(objects)}
                        spellCheck={false}
                        placeholder={`// JavaScript 스크립트\nlet startY = 0;\n\nfunction onStart() {\n  let p = self.getPosition();\n  startY = p.y;\n}\n\nfunction onUpdate(dt) {\n  let p = self.getPosition();\n  self.setPosition(p.x, startY + Math.sin(world.time) * 2, p.z);\n}\n\nfunction onNetEvent(event, data, fromId) {\n  if (event === "hit") {\n    self.setVisible(false);\n  }\n}`}
                        style={{
                          width: '100%', minHeight: 200, resize: 'vertical',
                          background: '#0d1117', color: '#e6edf3',
                          border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6,
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
                          padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
                          tabSize: 2,
                        }}
                        onKeyDown={e => {
                          // Tab → 2 spaces
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const el = e.currentTarget;
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            const val = el.value;
                            el.value = val.slice(0, start) + '  ' + val.slice(end);
                            el.selectionStart = el.selectionEnd = start + 2;
                            setObjects(prev => prev.map(o =>
                              o.id === selected.id ? { ...o, script: el.value } : o
                            ));
                          }
                        }}
                      />
                      {selected.script && (
                        <button onClick={() => { setObjects(prev => prev.map(o => o.id === selected.id ? { ...o, script: '' } : o)); pushHistory(objects); }}
                          style={{ marginTop: 4, fontSize: 10, padding: '3px 8px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                          스크립트 제거
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 색상 / 재질 / 텍스처 — 조명에서는 숨김 */}
              {selected.kind !== 'pointlight' && selected.kind !== 'spotlight' && selected.kind !== 'dirlight' && <>
              <button type="button" onClick={() => setMatPanelOpen(v => !v)}
                style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '5px 8px', cursor: 'pointer', fontWeight: 600, marginBottom: matPanelOpen ? 8 : 10 }}>
                🎨 색상 / 재질 / 텍스처 {matPanelOpen ? '▲' : '▼'}
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
                              title="클릭하여 텍스처 변경"
                              style={{ width: 22, height: 22, background: `url(${value}) center/cover`, borderRadius: 3, cursor: 'pointer', flexShrink: 0 }} />
                            <button onClick={() => { updateMaterialField(field, undefined); pushHistory(objects); }}
                              style={{ flex: 1, fontSize: 9, padding: '3px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'none', borderRadius: 3, cursor: 'pointer' }}>{t('texRemove')}</button>
                          </>
                        ) : (
                          <button onClick={() => setTexPicker(slot)}
                            style={{ flex: 1, fontSize: 10, padding: '3px', background: dragOverTex === slot ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: `1px dashed ${dragOverTex === slot ? '#818cf8' : 'rgba(255,255,255,0.15)'}`, borderRadius: 3, cursor: 'pointer' }}>
                            {dragOverTex === slot ? '📥 여기에 놓기' : t('texChoose')}
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
                </>
              )}
              </>}

              {/* 복제 / 삭제 */}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button onClick={duplicate}
                  style={{ flex: 1, background: 'rgba(99,102,241,0.2)', border: 'none', color: '#a5b4fc', fontSize: 11, padding: '7px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  복제 (Ctrl+D)
                </button>
                <button onClick={deleteSelected}
                  style={{ flex: 1, background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, padding: '7px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                  {t('delete')}
                </button>
              </div>

              <div style={{ fontSize: 10, opacity: 0.3, marginTop: 10, textAlign: 'center' }}>
                {t('stats', { count: objects.length, idx: hist.idx + 1, total: hist.stack.length })}
              </div>
            </>
          )}
        </div>
      </div>}

      {/* ── 3D 뷰포트 ─────────────────────── */}
      <div
        ref={viewportRef}
        style={{ flex: 1, position: 'relative' }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={handleMarqueeDown}
        onMouseMove={handleMarqueeMove}
        onMouseUp={handleMarqueeUp}
        onMouseLeave={handleMarqueeUp}
        onDragOver={e => { if (e.dataTransfer.types.includes('text/plain')) e.preventDefault(); }}
        onDrop={e => {
          e.preventDefault();
          const assetId = e.dataTransfer.getData('text/plain');
          const asset = myAssets.find(a => a.id === assetId);
          if (!asset) return;
          const pos = dropPositionFromEvent(e);
          addAsset(asset, pos);
        }}
      >
        <Canvas
          shadows
          camera={{ position: [8, 8, 8], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onPointerMissed={() => { if (!isGizmoActive()) { setSelectedId(null); setStudioMode('scene'); } }}
        >
          <ambientLight intensity={lightAmbient} />
          <directionalLight position={[20, 30, 10]} intensity={lightDir} castShadow shadow-mapSize={[2048, 2048]} />
          {skyEnabled && !hdriBackground && <Sky sunPosition={[20, 10, 10]} />}
          {/* HDRI 환경맵 — 커스텀 URL 우선, 없으면 프리셋, none이면 미사용 */}
          {hdriUrl.trim() ? (
            <Environment files={hdriUrl.trim()} background={hdriBackground} />
          ) : hdriPreset !== 'none' ? (
            <Environment preset={hdriPreset} background={hdriBackground} />
          ) : null}

          <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} infiniteGrid />

          {simulating ? (
            /* ── 시뮬레이션 모드 ── */
            <Suspense fallback={null}>
              <Physics gravity={[0, -9.81, 0]}>
                <SimScene objects={objects.filter(o => !o.hidden)} transforms={simTransforms} myAssets={myAssets} />
              </Physics>
            </Suspense>
          ) : (
            /* ── 편집 모드 ── */
            <>
              {/* 루트 오브젝트만 렌더링 — SceneNode가 자식을 재귀로 렌더링 */}
              {objects.filter(o => !o.hidden && !o.parentId).map(obj => (
                <SceneNode key={obj.id} obj={obj}
                  allObjects={objects.filter(o => !o.hidden)}
                  selectedId={selectedId}
                  multiSelectedIds={multiSelectedIds}
                  myAssets={myAssets}
                  onObjectClick={id => {
                    if (shiftHeldRef.current) {
                      shiftClickObject(id);
                    } else {
                      setStudioMode('scene');
                      setMultiSelectedIds(new Set());
                      setSelectedId(id);
                    }
                  }}
                />
              ))}
              <SelectedTransform
                targetId={objects.find(o => o.id === selectedId)?.locked ? null : selectedId}
                mode={mode}
                onChange={updateObjectTransform}
                onDragStart={onTransformDragStart}
                onDragEnd={() => pushHistory(objects)}
                snapTranslate={snapEnabled ? snapSize : null}
                snapRotate={snapEnabled ? (Math.PI / 12) : null}
                snapScale={snapEnabled ? 0.1 : null}
              />
            </>
          )}
          <SceneRefCapture target={threeSceneRef} />

          <OrbitControls
            ref={orbitRef}
            enabled={orbitEnabled}
            makeDefault
            enableZoom={true}
            mouseButtons={{
              LEFT:   undefined as unknown as THREE.MOUSE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT:  undefined as unknown as THREE.MOUSE,
            }}
          />
          <DraggingDetector setOrbitEnabled={setOrbitEnabled} />
          <WasdFlyCamera orbitRef={orbitRef} />
          <RightClickLook orbitRef={orbitRef} />
          <CanvasCapture captureFnRef={captureFnRef} />
          <CameraRefCapture cameraRef={cameraRef} />
        </Canvas>

        {/* ── 시뮬레이션 ▶/⏹ 버튼 — 뷰포트 상단 중앙 ── */}
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 6, pointerEvents: 'none' }}>
          {simulating ? (
            <button onClick={stopSim}
              style={{ pointerEvents: 'auto', background: 'rgba(239,68,68,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '6px 20px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 2px 10px rgba(0,0,0,0.5)', letterSpacing: 0.5 }}>
              ⏹ 중지 (Esc)
            </button>
          ) : (
            <button onClick={startSim}
              style={{ pointerEvents: 'auto', background: 'rgba(34,197,94,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '6px 20px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 2px 10px rgba(0,0,0,0.5)', letterSpacing: 0.5 }}>
              ▶ 시뮬레이션
            </button>
          )}
        </div>

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

        {/* 단축키 힌트 */}
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', pointerEvents: 'none' }}>
          {[
            ['G', '이동'], ['R', '회전'], ['S', '스케일'],
            ['WASD', '카메라'], ['QE', '상승/하강'], ['Shift', '가속'],
            ['F', '포커스'], ['Ctrl+D', '복제'], ['Ctrl+Z', '실행취소'], ['Del', '삭제'],
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
          📦 내 에셋 ({fbxAssets.length})
        </button>

        {/* FBX 에셋 바텀 슬라이딩 패널 */}
        <div
          onDragOver={e => { if (e.dataTransfer.types.includes('text/plain')) e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.stopPropagation(); }}
          style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 14,
          background: 'rgba(2,6,23,0.93)',
          borderTop: '1px solid rgba(129,140,248,0.25)',
          backdropFilter: 'blur(14px)',
          transform: `translateY(${activeAssetPicker ? '0%' : '100%'})`,
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          height: 340,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* 헤더 */}
          <div style={{ padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
              📦 내 에셋 ({fbxAssets.length})
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
                      placeholder="폴더명"
                      style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid #6366f1', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 6px', outline: 'none' }}
                    />
                    <button onClick={confirmNewFolder} style={{ background: '#4f46e5', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 7px', cursor: 'pointer' }}>✓</button>
                    <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '4px 7px', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowNewFolder(true)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 5, color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>
                    ＋ 새 폴더
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
                <span>전체 (루트)</span>
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
              style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', position: 'relative',
                outline: dropZoneActive ? '2px dashed #34d399' : 'none',
                background: dropZoneActive ? 'rgba(52,211,153,0.06)' : 'transparent',
                transition: 'outline 0.1s, background 0.1s',
              }}
              onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropZoneActive(true); } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropZoneActive(false); }}
              onDrop={e => { e.preventDefault(); setDropZoneActive(false); if (e.dataTransfer.files.length > 0) uploadFilesToFolder(e.dataTransfer.files); }}
            >
              {/* 드롭 오버레이 */}
              {dropZoneActive && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
                  <div style={{ fontSize: 13, color: '#6ee7b7', fontWeight: 700 }}>📂 여기에 놓으면 업로드됩니다</div>
                </div>
              )}
              {uploading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.6)', zIndex: 2, fontSize: 13, color: '#a5b4fc', fontWeight: 700 }}>
                  ⏳ 업로드 중...
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
                    />
                  ))}
                  {/* FBX 파일 카드 */}
                  {selectedFolderAssets.map(a => (
                    <StudioAssetCard key={a.id} asset={a} onDelete={deleteAsset} onRename={renameAsset} />
                  ))}
                  {/* 폴더/파일 모두 없을 때 안내 */}
                  {selectedSubfolders.length === 0 && selectedFolderAssets.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', fontSize: 12, opacity: 0.35, textAlign: 'center', paddingTop: 16 }}>
                      FBX 파일을 여기에 드래그하여 업로드
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
