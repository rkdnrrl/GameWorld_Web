'use client';
/**
 * 캐릭터 관리 페이지 — 통합 humanoid 시스템 (VRChat 식).
 *
 * 옛 시스템 (FBX 전용, X 회전, 9슬롯 매핑, oneShot, trim 등) 완전 폐기.
 *
 * 새 구조:
 *   - 어떤 포맷 (.vrm/.glb/.fbx) 이든 OK
 *   - 본 매칭 자동 (alias DB) + 매칭 실패 본 수동 매핑 UI
 *   - 표정/입모양 자동 매핑 (VRM expression 또는 morph target)
 *   - 5개 슬롯 (idle/walk/run/jump/fall) — 운영자 등록 마스터 클립 사용
 *
 * appearance v2 스키마:
 *   { schemaVersion: 2, modelUrl, scale, offsetY, manualBoneMap?, manualExpressionMap? }
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { session } from '@/lib/api';
import { HumanoidMesh } from '@/components/world/HumanoidMesh';
import type { HumanoidCharacter as HumanoidChar } from '@/lib/character/humanoidCharacter';
import { HUMANOID_BONES, REQUIRED_HUMANOID_BONES, type HumanoidBoneName, type AnimSlot } from '@/lib/character/humanoid';
import { AssetPicker } from '@/components/character/AssetPicker';

const API = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

interface Character {
  id: string;
  name: string;
  isActive: boolean;
  isShared?: boolean;
  appearance?: AppearanceV2;
}
interface AppearanceV2 {
  schemaVersion?: number;
  modelUrl?: string;
  scale?: number;
  offsetY?: number;
  manualBoneMap?: Partial<Record<HumanoidBoneName, string>>;
  manualExpressionMap?: Record<string, string>;
  /** 커스텀 이모트 — { 이모트이름: 애니메이션 에셋 URL }. 월드 1~9 픽커 + 스크립트 playEmote 에서 사용. */
  animSlotUrls?: Record<string, string>;
}

export default function CharacterPage() {
  const router = useRouter();
  const t = useTranslations('Character');
  const tCommon = useTranslations('Common');

  // ── 캐릭터 목록 + 폼 ──
  const [myChars, setMyChars] = useState<Character[]>([]);
  const [official, setOfficial] = useState<Character[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);
  const [name, setName] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [scale, setScale] = useState(1.0);
  const [offsetY, setOffsetY] = useState(0);
  const [manualBoneMap, setManualBoneMap] = useState<Partial<Record<HumanoidBoneName, string>>>({});
  // 커스텀 이모트 — { 이름: 애니메이션 에셋 URL }
  const [emotes, setEmotes] = useState<Record<string, string>>({});
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  // 에셋 선택 후 이름 입력 대기 (window.prompt 대신 인앱 입력 — 자동화·UX 개선)
  const [pendingEmote, setPendingEmote] = useState<{ url: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAllBones, setShowAllBones] = useState(false);

  // ── 진단 (모델 로드 후 자동 매칭 결과) ──
  const [diagnosis, setDiagnosis] = useState<{
    total: number; matched: number; missingRequired: HumanoidBoneName[]; missingOptional: HumanoidBoneName[];
    allBoneNames: string[];
  } | null>(null);

  // 현재 active 캐릭터 (수정 모드)
  const active = myChars.find((c) => c.isActive);

  // 캐릭터 목록 로드 + 폼 초기값
  const loadCharacters = async () => {
    const token = session.getToken();
    try {
      const res = await fetch(`${API}/api/characters`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyChars(data.characters || []);
        const act = (data.characters as Character[])?.find((c) => c.isActive);
        if (act && !creatingNew) {
          setName(act.name);
          const ap = (act.appearance || {}) as AppearanceV2;
          setModelUrl(ap.modelUrl || '');
          setScale(ap.scale ?? 1.0);
          setOffsetY(ap.offsetY ?? 0);
          setManualBoneMap(ap.manualBoneMap || {});
          setEmotes(ap.animSlotUrls || {});
        }
      }
      // official 목록 (공유된 캐릭터)
      const ofs = await fetch(`${API}/api/characters/official`);
      if (ofs.ok) {
        const d = await ofs.json();
        setOfficial(d.characters || []);
      }
    } catch { /* noop */ }
  };
  useEffect(() => { loadCharacters(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // 진단은 HumanoidMesh 의 onLoaded callback 에서 받음 (별도 로드 X — 인스턴스 1개)
  const handleCharLoaded = (char: HumanoidChar) => {
    setDiagnosis({
      total: char.diagnosis.total,
      matched: char.diagnosis.matched,
      missingRequired: char.diagnosis.missingRequired,
      missingOptional: char.diagnosis.missingOptional,
      allBoneNames: char.allBoneNames,
    });
  };
  useEffect(() => {
    if (!modelUrl) setDiagnosis(null);
  }, [modelUrl]);

  // ── 저장 ──
  const handleSave = async () => {
    if (!name.trim() || !modelUrl) { setError(t('nameRequired')); return; }
    setError('');
    setSaving(true);
    const appearance: AppearanceV2 = {
      schemaVersion: 2,
      modelUrl,
      scale,
      offsetY,
      ...(Object.keys(manualBoneMap).length ? { manualBoneMap } : {}),
      ...(Object.keys(emotes).length ? { animSlotUrls: emotes } : {}),
    };
    try {
      const token = session.getToken();
      const targetUrl = active && !creatingNew
        ? `${API}/api/characters/${encodeURIComponent(active.id)}`
        : `${API}/api/characters`;
      const method = active && !creatingNew ? 'PATCH' : 'POST';
      const res = await fetch(targetUrl, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), appearance }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message || t('saveFailed'));
        return;
      }
      await loadCharacters();
      setCreatingNew(false);
      if (typeof window !== 'undefined' && window.self !== window.top) {
        try { window.parent.postMessage({ type: 'alp:character-saved' }, window.location.origin); } catch { /* noop */ }
      } else {
        router.replace('/world');
      }
    } catch {
      setError(t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  // 캐릭터 CRUD
  const handleSelect = async (id: string) => {
    const token = session.getToken();
    await fetch(`${API}/api/characters/${id}/select`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await loadCharacters();
  };
  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const token = session.getToken();
    await fetch(`${API}/api/characters/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadCharacters();
  };
  const handleShare = async (id: string) => {
    const token = session.getToken();
    await fetch(`${API}/api/characters/${id}/share`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    await loadCharacters();
  };

  // 새 캐릭터 시작
  const handleNew = () => {
    setCreatingNew(true);
    setName('');
    setModelUrl('');
    setScale(1.0);
    setOffsetY(0);
    setManualBoneMap({});
    setEmotes({});
    setDiagnosis(null);
  };

  // 단독 진입도 허용 — 신규 유저는 캐릭터가 없어서 /world 가 여기로 보냄.
  // 옛 코드는 무조건 /world 로 되돌렸는데, 그 결과 신규 유저 무한 리다이렉트 루프 발생했음.
  // iframe 모드면 저장 후 postMessage 로 닫고, 단독 모드면 저장 후 /world 로 router.replace (handleSave 참조).

  // ── 렌더 ──
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a, #1e1b4b)', color: '#fff', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        {/* 좌측 — 미리보기 */}
        <div style={{ width: 380, height: 560, background: 'rgba(0,0,0,0.35)', borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
          <Canvas camera={{ position: [0, 1.2, 3], fov: 35 }} shadows>
            <ambientLight intensity={0.6} />
            <directionalLight position={[3, 6, 3]} intensity={0.8} castShadow />
            <gridHelper args={[6, 12, '#444', '#222']} position={[0, 0, 0]} />
            {modelUrl && (
              <PreviewWrap modelUrl={modelUrl} manualBoneMap={manualBoneMap} scale={scale} offsetY={offsetY} onLoaded={handleCharLoaded} />
            )}
            <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={1.5} maxDistance={6} />
          </Canvas>
          {!modelUrl && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
              {t('selectModelHint')}
            </div>
          )}
        </div>

        {/* 우측 — 편집 패널 */}
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 캐릭터 목록 */}
          <Section title={t('myCharacters')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myChars.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>{c.name}</div>
                  {c.isActive ? (
                    <span style={{ fontSize: 11, color: '#34d399' }}>{t('inUse')}</span>
                  ) : (
                    <button onClick={() => handleSelect(c.id)} style={btnStyle('#6366f1')}>{t('select')}</button>
                  )}
                  <button onClick={() => handleDelete(c.id)} style={btnStyle('#ef4444')}>{t('delete')}</button>
                  <button onClick={() => handleShare(c.id)} style={btnStyle('#10b981')}>{c.isShared ? t('shared') : t('share')}</button>
                </div>
              ))}
              <button onClick={handleNew} style={{ ...btnStyle('#a855f7'), padding: '8px 0', marginTop: 6 }}>{t('newCharacter')}</button>
            </div>
          </Section>

          {/* 이름 */}
          <Section title={t('characterName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff' }} />
          </Section>

          {/* 모델 */}
          <Section title={t('model3D')}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {modelUrl || t('noModelSelected')}
              </div>
              <button onClick={() => setPickerOpen(true)} style={btnStyle('#6366f1')}>{t('selectAnotherModel')}</button>
            </div>
          </Section>

          {/* 크기 / Y 오프셋 */}
          <Section title={`${t('size')} (1.0 = 1.8m)`}>
            <SliderRow value={scale} onChange={setScale} min={0.5} max={2.0} step={0.05} fmt={(v) => `${v.toFixed(2)}x`} />
          </Section>
          <Section title={t('yOffset')}>
            <SliderRow value={offsetY} onChange={setOffsetY} min={-0.3} max={0.3} step={0.01} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}m`} />
          </Section>

          {/* 본 매칭 진단 */}
          {modelUrl && diagnosis && (
            <Section title={t('boneDiagnosis')}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                {diagnosis.matched}/{diagnosis.total} {t('matched')} ·
                {diagnosis.missingRequired.length > 0
                  ? <span style={{ color: '#ef4444' }}> ❌ {diagnosis.missingRequired.length} {t('missingRequired')}</span>
                  : <span style={{ color: '#34d399' }}> ✅ {t('allRequiredMatched')}</span>
                }
              </div>
              {diagnosis.missingRequired.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                  {t('missingBones')}: {diagnosis.missingRequired.slice(0, 5).join(', ')}
                  {diagnosis.missingRequired.length > 5 && ` +${diagnosis.missingRequired.length - 5}`}
                </div>
              )}
              <button onClick={() => setShowAllBones((v) => !v)}
                style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>
                {showAllBones ? t('hideManualMap') : t('showManualMap')}
              </button>
              {showAllBones && (
                <ManualMapUI diagnosis={diagnosis} manualBoneMap={manualBoneMap} setManualBoneMap={setManualBoneMap} />
              )}
            </Section>
          )}

          {/* 이모트 — 내 애니메이션 에셋을 1~9 단축키 / 스크립트 playEmote 로 사용 */}
          {modelUrl && (
            <Section title={t('emotesTitle')}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{t('emotesHint')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {Object.keys(emotes).length === 0 && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '6px 0' }}>{t('emotesEmpty')}</div>
                )}
                {Object.entries(emotes).map(([name, url], i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', minWidth: 18 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <button onClick={() => { const next = { ...emotes }; delete next[name]; setEmotes(next); }}
                      aria-label={tCommon('delete')}
                      style={{ border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
              {pendingEmote ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={pendingEmote.name}
                    onChange={e => setPendingEmote(p => p ? { ...p, name: e.target.value } : p)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const nm = pendingEmote.name.trim();
                        if (nm) setEmotes(prev => ({ ...prev, [nm]: pendingEmote.url }));
                        setPendingEmote(null);
                      } else if (e.key === 'Escape') setPendingEmote(null);
                    }}
                    placeholder={t('emotesNamePrompt')}
                    style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(168,85,247,0.5)', color: '#fff', fontSize: 13, padding: '9px 10px', borderRadius: 8, outline: 'none' }}
                  />
                  <button
                    onClick={() => {
                      const nm = pendingEmote.name.trim();
                      if (nm) setEmotes(prev => ({ ...prev, [nm]: pendingEmote.url }));
                      setPendingEmote(null);
                    }}
                    style={{ padding: '9px 14px', background: 'linear-gradient(135deg,#6366f1,#a855f7)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {tCommon('confirm')}
                  </button>
                  <button onClick={() => setPendingEmote(null)}
                    style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
                    {tCommon('cancel')}
                  </button>
                </div>
              ) : (
                <button onClick={() => setEmotePickerOpen(true)}
                  style={{ width: '100%', padding: '10px 0', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  + {t('emotesAdd')}
                </button>
              )}
            </Section>
          )}

          {/* 저장 */}
          {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
          <button onClick={handleSave} disabled={saving || !name.trim() || !modelUrl}
            style={{
              padding: '12px 0', background: saving ? '#525252' : 'linear-gradient(135deg, #6366f1, #a855f7)',
              border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', opacity: saving || !name.trim() || !modelUrl ? 0.6 : 1,
            }}>
            {saving ? t('saving') : t('saveAndEnterWorld')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <AssetPicker
          onSelect={(url) => { setModelUrl(url); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
          accept=".vrm,.glb,.gltf,.fbx"
          tCommon={tCommon}
        />
      )}

      {emotePickerOpen && (
        <AssetPicker
          onSelect={(url) => {
            setEmotePickerOpen(false);
            // 기본 이름은 파일명 — 사용자가 인앱 입력에서 바로 수정 가능.
            const base = (url.split('/').pop() || 'emote').split('?')[0].replace(/\.[^.]+$/, '');
            setPendingEmote({ url, name: base });
          }}
          onClose={() => setEmotePickerOpen(false)}
          accept=".fbx,.vrma,.glb,.gltf"
          tCommon={tCommon}
        />
      )}
    </div>
  );
}

/* ── 작은 헬퍼 컴포넌트들 ─────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

function SliderRow({ value, onChange, min, max, step, fmt }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 12, fontFamily: 'monospace', minWidth: 56, textAlign: 'right' }}>{fmt(value)}</span>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: '4px 10px', background: color, border: 'none', borderRadius: 6,
    color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  };
}

/** Canvas 안 미리보기 wrapper — animStateRef 와 grid 등 보조. */
function PreviewWrap({ modelUrl, manualBoneMap, scale, offsetY, onLoaded }: {
  modelUrl: string; manualBoneMap: Partial<Record<HumanoidBoneName, string>>; scale: number; offsetY: number;
  onLoaded?: (char: HumanoidChar) => void;
}) {
  const animStateRef = useRef<AnimSlot>('idle');
  void useFrame;  // dt-rotation 시 lint
  return (
    <group position={[0, offsetY, 0]}>
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <HumanoidMesh
        url={modelUrl}
        manualBoneMap={manualBoneMap as Record<string, string>}
        animStateRef={animStateRef}
        userScale={scale}
        enableLookAt={false}
        targetHeight={1.8}
        onLoaded={onLoaded}
      />
    </group>
  );
}

/** 수동 본 매핑 UI — 매칭 실패한 본 마다 모델 안 본 이름 드롭다운. */
function ManualMapUI({
  diagnosis, manualBoneMap, setManualBoneMap,
}: {
  diagnosis: { missingRequired: HumanoidBoneName[]; allBoneNames: string[] };
  manualBoneMap: Partial<Record<HumanoidBoneName, string>>;
  setManualBoneMap: (m: Partial<Record<HumanoidBoneName, string>>) => void;
}) {
  // 매칭 안 된 필수 본 + 모든 humanoid 본을 수동 매핑 가능
  const targets: HumanoidBoneName[] = Array.from(new Set([
    ...diagnosis.missingRequired,
    ...REQUIRED_HUMANOID_BONES,
  ]));
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
      {targets.map((humanoidName) => (
        <div key={humanoidName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', minWidth: 110, fontFamily: 'monospace' }}>{humanoidName}</span>
          <select
            value={manualBoneMap[humanoidName] ?? ''}
            onChange={(e) => {
              const next = { ...manualBoneMap };
              if (e.target.value) next[humanoidName] = e.target.value;
              else delete next[humanoidName];
              setManualBoneMap(next);
            }}
            style={{ flex: 1, padding: '3px 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#fff', fontSize: 11 }}>
            <option value="">— (auto)</option>
            {diagnosis.allBoneNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ))}
      {void HUMANOID_BONES /* lint */}
    </div>
  );
}
