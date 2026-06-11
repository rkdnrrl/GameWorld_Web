'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GraphicsSettings } from '@/lib/world/graphicsSettings';
import { PRESETS } from '@/lib/world/graphicsSettings';

interface Props {
  settings: GraphicsSettings;
  updateSettings: (partial: Partial<GraphicsSettings>) => void;
  applyPreset: (name: Exclude<GraphicsSettings['preset'], 'custom'>) => void;
  /** 'standalone' = 자기 ⚙ button + 인라인 패널 (기본).
   *  'embedded' = content 만 렌더 — 외부 모달 안에 포함될 때 사용. */
  mode?: 'standalone' | 'embedded';
}

const SHADOW_OPTIONS = [
  { value: 0,    labelKey: 'shadowOff'   },
  { value: 512,  labelKey: 'shadowLow'   },
  { value: 1024, labelKey: 'shadowMid'   },
  { value: 2048, labelKey: 'shadowHigh'  },
  { value: 4096, labelKey: 'shadowUltra' },
] as const;

export default function GraphicsPanel({ settings, updateSettings, applyPreset, mode = 'standalone' }: Props) {
  const t = useTranslations('Graphics');
  const [open, setOpen] = useState(false);

  // 그래픽 설정 내용만 — embedded 와 standalone 둘 다 동일하게 사용
  const Content = (
    <>
      {/* 프리셋 */}
      <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 6 }}>{t('preset')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
              {(['low','medium','high','ultra'] as const).map(name => (
                <button key={name} onClick={() => applyPreset(name)}
                  style={{
                    padding: '6px 0', borderRadius: 6, border: 'none',
                    background: settings.preset === name
                      ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
                      : 'rgba(255,255,255,0.06)',
                    color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                  {t(`preset${name.charAt(0).toUpperCase() + name.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 그림자 품질 */}
          <Section label={t('shadowSize')}>
            <select
              value={settings.shadowSize}
              onChange={e => updateSettings({ shadowSize: Number(e.target.value) })}
              style={selectStyle}
            >
              {SHADOW_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}{o.value > 0 ? ` (${o.value})` : ''}</option>
              ))}
            </select>
          </Section>

          {/* 그림자 필터 */}
          <Section label={t('shadowFilter')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {(['basic','pcf','pcfsoft'] as const).map(f => (
                <button key={f} onClick={() => updateSettings({ shadowFilter: f })}
                  style={buttonStyle(settings.shadowFilter === f)}>
                  {f === 'basic' ? t('shadowFilterBasic') : f === 'pcf' ? t('shadowFilterPCF') : t('shadowFilterPCFSoft')}
                </button>
              ))}
            </div>
          </Section>

          {/* 그림자 부드러움 (radius) */}
          <Section label={`${t('shadowSoftness')} (${settings.shadowRadius})`}>
            <input type="range" min={0} max={10} step={1}
              value={settings.shadowRadius}
              onChange={e => updateSettings({ shadowRadius: Number(e.target.value) })}
              style={{ width: '100%' }} />
          </Section>

          {/* 다른 플레이어 그림자 */}
          <Section label={t('remoteShadows')}>
            <ToggleButtons
              value={settings.remoteShadows}
              onChange={v => updateSettings({ remoteShadows: v })}
              labels={[t('off'), t('on')]}
            />
          </Section>

          {/* 픽셀 비율 */}
          <Section label={`${t('pixelRatio')} (${settings.dpr.toFixed(1)}x)`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {[1.0, 1.5, 2.0].map(v => (
                <button key={v} onClick={() => updateSettings({ dpr: v })}
                  style={{ ...buttonStyle(settings.dpr === v) }}>
                  {v.toFixed(1)}x
                </button>
              ))}
            </div>
          </Section>

          {/* 시야 거리 */}
          <Section label={`${t('farClip')} (${settings.farClip}m)`}>
            <input type="range" min={100} max={1000} step={50}
              value={settings.farClip}
              onChange={e => updateSettings({ farClip: Number(e.target.value) })}
              style={{ width: '100%' }} />
          </Section>

          {/* 거리 culling — 멀리 있는 오브젝트 안 그리기 (0 = 끔) */}
          <Section label={`${t('cullDistance')} (${settings.cullDistance === 0 ? t('off') : settings.cullDistance + 'm'})`}>
            <input type="range" min={0} max={800} step={50}
              value={settings.cullDistance}
              onChange={e => updateSettings({ cullDistance: Number(e.target.value) })}
              style={{ width: '100%' }} />
          </Section>

          {/* 프러스텀 culling — 화면 밖 오브젝트 안 그리기 */}
          <Section label={t('frustumCull')}>
            <ToggleButtons
              value={settings.frustumCull}
              onChange={v => updateSettings({ frustumCull: v })}
              labels={[t('off'), t('on')]}
            />
          </Section>

          {/* 오클루전 culling — 벽 뒤 가려진 오브젝트 안 그리기 (실험적) */}
          <Section label={t('occlusionCull')}>
            <ToggleButtons
              value={settings.occlusionCull}
              onChange={v => updateSettings({ occlusionCull: v })}
              labels={[t('off'), t('on')]}
            />
          </Section>

      {/* 리셋 */}
      <button onClick={() => applyPreset('ultra')}
        style={{
          width: '100%', marginTop: 8, padding: '8px', borderRadius: 8, border: 'none',
          background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
          fontSize: 12, cursor: 'pointer',
        }}>
        {t('reset')}
      </button>
    </>
  );

  // embedded 모드 — 외부 컨테이너 (모달 등) 안에 content 만 렌더
  if (mode === 'embedded') {
    return <div style={{ color: '#fff' }}>{Content}</div>;
  }

  // standalone 모드 — 우상단 ⚙ button + 인라인 패널 (기본)
  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title={t('title')}
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 16777274,
          width: 40, height: 40, borderRadius: '50%',
          background: open ? '#4f46e5' : 'rgba(0,0,0,0.45)',
          border: 'none', color: '#fff', fontSize: 18,
          cursor: 'pointer', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⚙️
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 64, right: 16, zIndex: 16777274,
          width: 280, background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
          padding: 16, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('title')}</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          {Content}
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function ToggleButtons({ value, onChange, labels }: { value: boolean; onChange: (v: boolean) => void; labels: [string, string] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      <button onClick={() => onChange(false)} style={buttonStyle(!value)}>{labels[0]}</button>
      <button onClick={() => onChange(true)}  style={buttonStyle(value)}>{labels[1]}</button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
  color: '#fff', fontSize: 12, padding: '6px 8px', outline: 'none',
};

const buttonStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 0', borderRadius: 6, border: 'none',
  background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)',
  color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
});

// 사용한 함수: void 처리하지 않기 위해 export 안 함
void PRESETS;
