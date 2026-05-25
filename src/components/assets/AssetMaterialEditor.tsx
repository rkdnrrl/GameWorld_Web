'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useTranslations } from 'next-intl';
import * as THREE from 'three';
import { session } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';

type MaterialPreset = 'default' | 'wood' | 'metal' | 'stone' | 'glass' | 'plastic' | 'emissive';

export interface MaterialConfig {
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
  thumbnailUrl?: string | null;
  isPublic?: boolean;
  createdAt?: string;
  materialConfig?: MaterialConfig | null;
}

const PRESETS: Record<Exclude<MaterialPreset, 'default'>, {
  metalness: number; roughness: number; opacity?: number; transparent?: boolean;
  defaultColor: string; emissive?: string; emissiveIntensity?: number;
}> = {
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

function buildMat(cfg: MaterialConfig, onTexLoad?: () => void): THREE.MeshStandardMaterial | null {
  const presetKey = cfg.material && cfg.material !== 'default' ? cfg.material : null;
  const preset = presetKey ? PRESETS[presetKey] : null;
  const hasAnyTex = cfg.textureAlbedo || cfg.textureNormal || cfg.textureRoughness;
  if (!presetKey && !hasAnyTex && !cfg.materialColor) return null; // default = 원본 유지

  const baseColor = cfg.materialColor || (preset ? preset.defaultColor : '#ffffff');
  const mat = new THREE.MeshStandardMaterial({
    color:       hasAnyTex && !cfg.materialColor ? '#ffffff' : baseColor,
    metalness:   preset?.metalness ?? 0,
    roughness:   preset?.roughness ?? 0.5,
    opacity:     preset?.opacity ?? 1,
    transparent: preset?.transparent ?? false,
    emissive:    preset?.emissive ?? '#000000',
    emissiveIntensity: preset?.emissiveIntensity ?? 0,
  });
  const tx = cfg.textureTilingX || 1;
  const ty = cfg.textureTilingY || 1;
  const trig = () => { mat.needsUpdate = true; onTexLoad?.(); };
  if (cfg.textureAlbedo)    mat.map         = loadTex(cfg.textureAlbedo,    THREE.SRGBColorSpace, tx, ty, trig);
  if (cfg.textureNormal)    mat.normalMap   = loadTex(cfg.textureNormal,    THREE.NoColorSpace,   tx, ty, trig);
  if (cfg.textureRoughness) mat.roughnessMap = loadTex(cfg.textureRoughness, THREE.NoColorSpace,   tx, ty, trig);
  return mat;
}

function disposeMat(mat: THREE.MeshStandardMaterial) {
  mat.map?.dispose(); mat.normalMap?.dispose(); mat.roughnessMap?.dispose(); mat.dispose();
}

/* ── 미리보기 ─────────────────────────────── */
function PreviewModel({ url, config }: { url: string; config: MaterialConfig }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const originalMats = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => {
      new FBXLoader().load(url, (fbx) => {
        if (cancelled) return;
        fbx.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.x, size.y, size.z);
        if (h > 0) fbx.scale.multiplyScalar(2 / h);
        const c2 = box.getCenter(new THREE.Vector3());
        fbx.position.sub(c2.multiplyScalar(2 / h));
        originalMats.current.clear();
        fbx.traverse(c => {
          const m = c as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; originalMats.current.set(m, m.material); }
        });
        setObj(fbx);
      });
    });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!obj) return;
    const mat = buildMat(config);
    if (!mat) {
      obj.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.isMesh) { const o = originalMats.current.get(m); if (o) m.material = o; }
      });
      return;
    }
    obj.traverse(c => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    return () => {
      obj.traverse(c => {
        const m = c as THREE.Mesh;
        if (m.isMesh) { const o = originalMats.current.get(m); if (o) m.material = o; }
      });
      disposeMat(mat);
    };
  }, [obj, config]);

  if (!obj) return null;
  return <primitive object={obj} />;
}

/* ── 텍스처 선택 ─────────────────────────── */
function TexturePicker({ images, onSelect, onClose, title }: {
  images: Asset[];
  onSelect: (url: string) => void;
  onClose: () => void;
  title: string;
}) {
  const t = useTranslations('Studio');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
      onClick={onClose}>
      <div style={{ background: '#1e293b', borderRadius: 14, padding: 18, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {images.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', padding: 30 }}>
            {t('noTextures')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, overflowY: 'auto' }}>
            {images.map(a => (
              <button key={a.id} onClick={() => onSelect(a.modelUrl)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', overflow: 'hidden', padding: 0 }}>
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

/* ── 메인 에디터 모달 ────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AssetMaterialEditor({ asset, allAssets, onClose, onSaved }: {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const t = useTranslations('Studio');
  const [cfg, setCfg] = useState<MaterialConfig>(asset.materialConfig || {});
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | 'albedo' | 'normal' | 'roughness'>(null);

  const imageAssets = allAssets.filter(a => /\.(png|jpe?g|webp)$/i.test(a.modelUrl));

  function update<K extends keyof MaterialConfig>(key: K, val: MaterialConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const tok = session.getToken();
      const res = await fetch(`${API}/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ materialConfig: cfg }),
      });
      if (!res.ok) throw new Error('저장 실패');
      const { asset: updated } = await res.json();
      onSaved(updated);
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}>
      <div style={{
        background: '#0f172a', borderRadius: 16, width: 820, maxHeight: '85vh', display: 'flex',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* 좌측 — 미리보기 */}
        <div style={{ width: 380, background: '#1e293b', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📦 {asset.name}</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, background: 'linear-gradient(160deg,#1e293b,#0f172a)', position: 'relative' }}>
            <div style={{
              position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1,
              background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.7)',
              fontSize: 10, padding: '4px 10px', borderRadius: 10, backdropFilter: 'blur(4px)',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              좌클릭 회전 · 우클릭 이동 · 휠 확대/축소
            </div>
            <Canvas camera={{ position: [0, 1, 4], fov: 45 }} shadows>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
              <Suspense fallback={null}>
                <PreviewModel url={asset.modelUrl} config={cfg} />
              </Suspense>
              <OrbitControls
                enableDamping
                minDistance={1}
                maxDistance={20}
                target={[0, 0, 0]}
              />
            </Canvas>
          </div>
        </div>

        {/* 우측 — 컨트롤 */}
        <div style={{ flex: 1, padding: 18, overflowY: 'auto', color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 8 }}>{t('material')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
            {([
              ['default',  t('matDefault')],
              ['wood',     t('matWood')],
              ['metal',    t('matMetal')],
              ['stone',    t('matStone')],
              ['glass',    t('matGlass')],
              ['plastic',  t('matPlastic')],
              ['emissive', t('matEmissive')],
            ] as const).map(([k, label]) => {
              const active = (cfg.material ?? 'default') === k;
              return (
                <button key={k} onClick={() => update('material', k)}
                  style={{
                    background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)',
                    border: 'none', borderRadius: 6, color: '#fff', fontSize: 12,
                    padding: '8px', cursor: 'pointer', textAlign: 'left',
                  }}>{label}</button>
              );
            })}
          </div>

          {cfg.material && cfg.material !== 'default' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{t('materialColor')}</div>
              <input type="color" value={cfg.materialColor || '#ffffff'}
                onChange={e => update('materialColor', e.target.value)}
                style={{ width: '100%', height: 30, border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer' }} />
            </div>
          )}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 8 }}>{t('texture')}</div>
            {([
              ['albedo',    t('texAlbedo'),    cfg.textureAlbedo,    'textureAlbedo'],
              ['normal',    t('texNormal'),    cfg.textureNormal,    'textureNormal'],
              ['roughness', t('texRoughness'), cfg.textureRoughness, 'textureRoughness'],
            ] as const).map(([slot, label, value, field]) => (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 11, opacity: 0.6, width: 78 }}>{label}</span>
                {value ? (
                  <>
                    <div style={{ width: 28, height: 28, background: `url(${value}) center/cover`, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button onClick={() => update(field, undefined)}
                      style={{ flex: 1, fontSize: 11, padding: '5px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      {t('texRemove')}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setPicker(slot)}
                    style={{ flex: 1, fontSize: 11, padding: '5px', background: 'rgba(255,255,255,0.06)', color: '#a5b4fc', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer' }}>
                    {t('texChoose')}
                  </button>
                )}
              </div>
            ))}

            {(cfg.textureAlbedo || cfg.textureNormal || cfg.textureRoughness) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                <label style={{ fontSize: 11, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t('texTilingX')}
                  <input type="number" step={0.5} min={0.1}
                    value={cfg.textureTilingX ?? 1}
                    onChange={e => update('textureTilingX', Number(e.target.value))}
                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 11, padding: '3px 5px', borderRadius: 4, outline: 'none' }} />
                </label>
                <label style={{ fontSize: 11, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t('texTilingY')}
                  <input type="number" step={0.5} min={0.1}
                    value={cfg.textureTilingY ?? 1}
                    onChange={e => update('textureTilingY', Number(e.target.value))}
                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 11, padding: '3px 5px', borderRadius: 4, outline: 'none' }} />
                </label>
              </div>
            )}
          </div>

          <button onClick={save} disabled={saving}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#10b981,#06b6d4)',
              color: '#fff', fontWeight: 800, fontSize: 14, cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
        </div>

        {picker && (
          <TexturePicker
            images={imageAssets}
            title={t('texPickerTitle')}
            onClose={() => setPicker(null)}
            onSelect={(url) => {
              const field =
                picker === 'albedo'    ? 'textureAlbedo' :
                picker === 'normal'    ? 'textureNormal' :
                                          'textureRoughness';
              update(field, url);
              setPicker(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
