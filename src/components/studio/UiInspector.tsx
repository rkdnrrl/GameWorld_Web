'use client';
/**
 * UI 오브젝트 (kind === 'ui') 전용 인스펙터 — RectTransform + 요소별 props 편집.
 *
 * Phase 2 prototype: 입력 단순 (text input 위주, 시각 핸들 X). Phase 후속에서 시각 anchor/pivot picker.
 */
import React, { useState, useEffect } from 'react';
import type { UiData, RectTransform } from '@/lib/world/uiObjects';

interface UiObj {
  id: string;
  label?: string;
  ui?: UiData;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

interface Props {
  selected: UiObj;
  onUpdate: (patch: Partial<UiData>) => void;
  onRectUpdate: (rectPatch: Partial<RectTransform>) => void;
  onCommit: () => void;
  /** World Canvas 일 때 3D 위치/회전/크기 편집용. screen canvas 면 X */
  onTransformUpdate?: (patch: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }) => void;
}

/** Anchor 9-점 preset (유니티 식) — TL/T/TR / L/C/R / BL/B/BR + Stretch */
const ANCHOR_PRESETS: { label: string; min: { x: number; y: number }; max: { x: number; y: number }; pivot: { x: number; y: number } }[] = [
  { label: '↖', min: { x: 0,   y: 1 }, max: { x: 0,   y: 1 }, pivot: { x: 0,   y: 1 } },
  { label: '↑', min: { x: 0.5, y: 1 }, max: { x: 0.5, y: 1 }, pivot: { x: 0.5, y: 1 } },
  { label: '↗', min: { x: 1,   y: 1 }, max: { x: 1,   y: 1 }, pivot: { x: 1,   y: 1 } },
  { label: '↔', min: { x: 0,   y: 1 }, max: { x: 1,   y: 1 }, pivot: { x: 0.5, y: 1 } },
  { label: '←', min: { x: 0,   y: 0.5 }, max: { x: 0,   y: 0.5 }, pivot: { x: 0,   y: 0.5 } },
  { label: '⊙', min: { x: 0.5, y: 0.5 }, max: { x: 0.5, y: 0.5 }, pivot: { x: 0.5, y: 0.5 } },
  { label: '→', min: { x: 1,   y: 0.5 }, max: { x: 1,   y: 0.5 }, pivot: { x: 1,   y: 0.5 } },
  { label: '⤢', min: { x: 0,   y: 0 }, max: { x: 1,   y: 1 }, pivot: { x: 0.5, y: 0.5 } },
  { label: '↙', min: { x: 0,   y: 0 }, max: { x: 0,   y: 0 }, pivot: { x: 0,   y: 0 } },
  { label: '↓', min: { x: 0.5, y: 0 }, max: { x: 0.5, y: 0 }, pivot: { x: 0.5, y: 0 } },
  { label: '↘', min: { x: 1,   y: 0 }, max: { x: 1,   y: 0 }, pivot: { x: 1,   y: 0 } },
  { label: '↕', min: { x: 0.5, y: 0 }, max: { x: 0.5, y: 1 }, pivot: { x: 0.5, y: 0.5 } },
];

export function UiInspector({ selected, onUpdate, onRectUpdate, onCommit, onTransformUpdate }: Props) {
  const ui = selected.ui;
  if (!ui) return <div style={{ fontSize: 11, opacity: 0.5 }}>(ui 데이터 없음)</div>;
  const r = ui.rect;
  const isCanvas = ui.type === 'canvas';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 10, opacity: 0.7 }}>
        UI 요소: <b style={{ color: '#a5b4fc' }}>{ui.type}</b>
      </div>

      {/* ── Canvas: space 선택 ── */}
      {isCanvas && (
        <Section label="Space" hint={(ui.space ?? 'screen') === 'world' ? '3D 공간 — MapObject position/rotation/scale 로 위치 조절' : 'HTML overlay — 화면 고정'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {(['screen', 'world'] as const).map(s => (
              <button key={s}
                onClick={() => {
                  if ((ui.space ?? 'screen') === s) return;
                  // space 전환 시 rect 자동 변경 — screen 은 stretch, world 는 1920x1080 고정
                  if (s === 'screen') {
                    onUpdate({ space: 'screen' });
                    onRectUpdate({ anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, pivot: { x: 0.5, y: 0.5 }, posX: 0, posY: 0, width: 0, height: 0 });
                  } else {
                    onUpdate({ space: 'world' });
                    onRectUpdate({ anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 }, pivot: { x: 0.5, y: 0.5 }, posX: 0, posY: 0, width: 1920, height: 1080 });
                  }
                  onCommit();
                }}
                style={{
                  ...btnStyle,
                  background: (ui.space ?? 'screen') === s ? '#4f46e5' : 'rgba(255,255,255,0.06)',
                }}>
                {s === 'screen' ? '🖥 Screen' : '🌍 World'}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ── World Canvas: 영역 크기 (px) ── */}
      {isCanvas && (ui.space ?? 'screen') === 'world' && (
        <Section label="Canvas 영역 (px)" hint="자식 RectTransform 의 기준 영역. 실제 3D 크기는 오브젝트 scale 로 조절">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <NumIn label="W" value={r.width}  onChange={v => onRectUpdate({ width: v })}  onCommit={onCommit} />
            <NumIn label="H" value={r.height} onChange={v => onRectUpdate({ height: v })} onCommit={onCommit} />
          </div>
        </Section>
      )}

      {/* ── World Canvas: 3D Transform ── */}
      {isCanvas && (ui.space ?? 'screen') === 'world' && onTransformUpdate && selected.position && selected.rotation && selected.scale && (
        <>
          <Section label="3D 위치 (m)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              <NumIn label="X" step={0.1} value={selected.position[0]} onChange={v => onTransformUpdate({ position: [v, selected.position![1], selected.position![2]] })} onCommit={onCommit} />
              <NumIn label="Y" step={0.1} value={selected.position[1]} onChange={v => onTransformUpdate({ position: [selected.position![0], v, selected.position![2]] })} onCommit={onCommit} />
              <NumIn label="Z" step={0.1} value={selected.position[2]} onChange={v => onTransformUpdate({ position: [selected.position![0], selected.position![1], v] })} onCommit={onCommit} />
            </div>
          </Section>
          <Section label="3D 회전 (rad)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              <NumIn label="X" step={0.05} value={selected.rotation[0]} onChange={v => onTransformUpdate({ rotation: [v, selected.rotation![1], selected.rotation![2]] })} onCommit={onCommit} />
              <NumIn label="Y" step={0.05} value={selected.rotation[1]} onChange={v => onTransformUpdate({ rotation: [selected.rotation![0], v, selected.rotation![2]] })} onCommit={onCommit} />
              <NumIn label="Z" step={0.05} value={selected.rotation[2]} onChange={v => onTransformUpdate({ rotation: [selected.rotation![0], selected.rotation![1], v] })} onCommit={onCommit} />
            </div>
          </Section>
          <Section label="3D 크기" hint="기본 0.005 (1920px ≈ 9.6m 시 ~5m). 작을수록 작게 보임">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              <NumIn label="X" step={0.001} value={selected.scale[0]} onChange={v => onTransformUpdate({ scale: [v, selected.scale![1], selected.scale![2]] })} onCommit={onCommit} />
              <NumIn label="Y" step={0.001} value={selected.scale[1]} onChange={v => onTransformUpdate({ scale: [selected.scale![0], v, selected.scale![2]] })} onCommit={onCommit} />
              <NumIn label="Z" step={0.001} value={selected.scale[2]} onChange={v => onTransformUpdate({ scale: [selected.scale![0], selected.scale![1], v] })} onCommit={onCommit} />
            </div>
          </Section>
        </>
      )}

      {/* ── 자식 요소 (Canvas 아님): RectTransform ── */}
      {!isCanvas && (
        <>
          <Section label="Anchor / Pivot 프리셋">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
              {ANCHOR_PRESETS.map((p, i) => {
                const active = r.anchorMin.x === p.min.x && r.anchorMin.y === p.min.y && r.anchorMax.x === p.max.x && r.anchorMax.y === p.max.y;
                return (
                  <button key={i}
                    onClick={() => { onRectUpdate({ anchorMin: p.min, anchorMax: p.max, pivot: p.pivot, posX: 0, posY: 0 }); onCommit(); }}
                    title={`anchor (${p.min.x},${p.min.y})~(${p.max.x},${p.max.y})`}
                    style={{
                      ...btnStyle, padding: '4px 0', fontSize: 11,
                      background: active ? '#4f46e5' : 'rgba(255,255,255,0.06)',
                    }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label="Position (px)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <NumIn label="X" value={r.posX} onChange={v => onRectUpdate({ posX: v })} onCommit={onCommit} />
              <NumIn label="Y" value={r.posY} onChange={v => onRectUpdate({ posY: v })} onCommit={onCommit} />
            </div>
          </Section>

          <Section label="Size (px)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <NumIn label="W" value={r.width}  onChange={v => onRectUpdate({ width: v })}  onCommit={onCommit} />
              <NumIn label="H" value={r.height} onChange={v => onRectUpdate({ height: v })} onCommit={onCommit} />
            </div>
          </Section>

          <Section label="Pivot (0~1)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <NumIn label="X" value={r.pivot.x} step={0.1} onChange={v => onRectUpdate({ pivot: { x: v, y: r.pivot.y } })} onCommit={onCommit} />
              <NumIn label="Y" value={r.pivot.y} step={0.1} onChange={v => onRectUpdate({ pivot: { x: r.pivot.x, y: v } })} onCommit={onCommit} />
            </div>
          </Section>
        </>
      )}

      {/* ── 요소별 props ── */}
      {(ui.type === 'text' || ui.type === 'button') && (
        <>
          <Section label="텍스트">
            <TextIn value={ui.text || ''} onChange={v => onUpdate({ text: v })} onCommit={onCommit} multiline />
          </Section>
          <Section label="폰트 크기">
            <NumIn value={ui.fontSize ?? (ui.type === 'text' ? 24 : 18)} onChange={v => onUpdate({ fontSize: v })} onCommit={onCommit} />
          </Section>
          <Section label="글자색">
            <ColorIn value={ui.color || '#ffffff'} onChange={v => { onUpdate({ color: v }); onCommit(); }} />
          </Section>
        </>
      )}

      {ui.type === 'button' && (
        <>
          <Section label="배경색">
            <ColorIn value={ui.bgColor || '#4f46e5'} onChange={v => { onUpdate({ bgColor: v }); onCommit(); }} />
          </Section>
          <Section label="onClick 스크립트 (JS)" hint="누르면 실행. game.* / ui.* 등 ALP API 사용 가능">
            <TextIn value={ui.onClickScript || ''} onChange={v => onUpdate({ onClickScript: v })} onCommit={onCommit} multiline />
          </Section>
        </>
      )}

      {ui.type === 'image' && (
        <>
          <Section label="이미지 URL">
            <TextIn value={ui.imageUrl || ''} onChange={v => onUpdate({ imageUrl: v })} onCommit={onCommit} placeholder="https://... 또는 /path/to/image.png" />
          </Section>
          <Section label={`투명도 (${(ui.alpha ?? 1).toFixed(2)})`}>
            <input type="range" min={0} max={1} step={0.05}
              value={ui.alpha ?? 1}
              onChange={e => onUpdate({ alpha: Number(e.target.value) })}
              onMouseUp={onCommit}
              onTouchEnd={onCommit}
              style={{ width: '100%' }} />
          </Section>
        </>
      )}

      {ui.type === 'panel' && (
        <>
          <Section label="배경색 (CSS rgba 가능)">
            <TextIn value={ui.bgColor || 'rgba(0,0,0,0.5)'} onChange={v => onUpdate({ bgColor: v })} onCommit={onCommit} />
          </Section>
          <Section label={`투명도 (${(ui.alpha ?? 1).toFixed(2)})`}>
            <input type="range" min={0} max={1} step={0.05}
              value={ui.alpha ?? 1}
              onChange={e => onUpdate({ alpha: Number(e.target.value) })}
              onMouseUp={onCommit}
              onTouchEnd={onCommit}
              style={{ width: '100%' }} />
          </Section>
        </>
      )}

      {ui.type === 'slider' && (
        <>
          <Section label="범위 (min ~ max)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <NumIn label="min" value={ui.min ?? 0}   onChange={v => onUpdate({ min: v })}   onCommit={onCommit} />
              <NumIn label="max" value={ui.max ?? 100} onChange={v => onUpdate({ max: v })}   onCommit={onCommit} />
            </div>
          </Section>
          <Section label="현재 값">
            <NumIn value={ui.value ?? 50} onChange={v => onUpdate({ value: v })} onCommit={onCommit} />
          </Section>
          <Section label="step">
            <NumIn value={ui.step ?? 1} step={0.1} onChange={v => onUpdate({ step: v })} onCommit={onCommit} />
          </Section>
          <Section label="색상">
            <ColorIn value={ui.color || '#4f46e5'} onChange={v => { onUpdate({ color: v }); onCommit(); }} />
          </Section>
          <Section label="onChange 스크립트" hint="값 변할 때 실행. value 변수로 슬라이더 값 사용.">
            <TextIn value={ui.onChangeScript || ''} onChange={v => onUpdate({ onChangeScript: v })} onCommit={onCommit} multiline />
          </Section>
        </>
      )}

      {ui.type === 'input' && (
        <>
          <Section label="현재 값">
            <TextIn value={ui.inputValue || ''} onChange={v => onUpdate({ inputValue: v })} onCommit={onCommit} multiline={ui.multiline} />
          </Section>
          <Section label="Placeholder">
            <TextIn value={ui.placeholder || ''} onChange={v => onUpdate({ placeholder: v })} onCommit={onCommit} />
          </Section>
          <Section label="여러 줄">
            <label style={{ fontSize: 11, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!ui.multiline} onChange={e => { onUpdate({ multiline: e.target.checked }); onCommit(); }} /> multiline (textarea)
            </label>
          </Section>
          <Section label="폰트 크기">
            <NumIn value={ui.fontSize ?? 14} onChange={v => onUpdate({ fontSize: v })} onCommit={onCommit} />
          </Section>
          <Section label="글자색"><ColorIn value={ui.color || '#ffffff'} onChange={v => { onUpdate({ color: v }); onCommit(); }} /></Section>
          <Section label="배경색 (CSS rgba 가능)">
            <TextIn value={ui.bgColor || 'rgba(0,0,0,0.5)'} onChange={v => onUpdate({ bgColor: v })} onCommit={onCommit} />
          </Section>
          <Section label="onChange 스크립트" hint="텍스트 변할 때 실행. value 변수로 텍스트 사용.">
            <TextIn value={ui.onChangeScript || ''} onChange={v => onUpdate({ onChangeScript: v })} onCommit={onCommit} multiline />
          </Section>
        </>
      )}

      {ui.type === 'toggle' && (
        <>
          <Section label="라벨 텍스트">
            <TextIn value={ui.text || ''} onChange={v => onUpdate({ text: v })} onCommit={onCommit} />
          </Section>
          <Section label="현재 체크 상태">
            <label style={{ fontSize: 11, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!ui.checked} onChange={e => { onUpdate({ checked: e.target.checked }); onCommit(); }} /> checked
            </label>
          </Section>
          <Section label="폰트 크기">
            <NumIn value={ui.fontSize ?? 13} onChange={v => onUpdate({ fontSize: v })} onCommit={onCommit} />
          </Section>
          <Section label="글자색"><ColorIn value={ui.color || '#ffffff'} onChange={v => { onUpdate({ color: v }); onCommit(); }} /></Section>
          <Section label="onChange 스크립트" hint="체크 변할 때 실행. value 변수로 true/false 사용.">
            <TextIn value={ui.onChangeScript || ''} onChange={v => onUpdate({ onChangeScript: v })} onCommit={onCommit} multiline />
          </Section>
        </>
      )}

      {ui.type === 'scrollview' && (
        <>
          <Section label="배경색 (CSS rgba 가능)">
            <TextIn value={ui.bgColor || 'rgba(0,0,0,0.3)'} onChange={v => onUpdate({ bgColor: v })} onCommit={onCommit} />
          </Section>
          <Section label="스크롤 방향">
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 11, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={ui.scrollVertical !== false} onChange={e => { onUpdate({ scrollVertical: e.target.checked }); onCommit(); }} /> 세로
              </label>
              <label style={{ fontSize: 11, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={!!ui.scrollHorizontal} onChange={e => { onUpdate({ scrollHorizontal: e.target.checked }); onCommit(); }} /> 가로
              </label>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/* ── 헬퍼 컴포넌트 ── */
function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.65, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 9, opacity: 0.4, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function NumIn({ label, value, step = 1, onChange, onCommit }: { label?: string; value: number; step?: number; onChange: (n: number) => void; onCommit: () => void }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {label && <span style={{ fontSize: 10, opacity: 0.55, minWidth: 12 }}>{label}</span>}
      <input type="number" step={step} value={local}
        onChange={e => { setLocal(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={inputStyle} />
    </label>
  );
}

function TextIn({ value, onChange, onCommit, multiline, placeholder }: { value: string; onChange: (s: string) => void; onCommit: () => void; multiline?: boolean; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  if (multiline) {
    return (
      <textarea value={local}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
        onBlur={onCommit}
        placeholder={placeholder}
        rows={3}
        style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical', minHeight: 40 }} />
    );
  }
  return (
    <input type="text" value={local}
      onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
      onBlur={onCommit}
      placeholder={placeholder}
      style={inputStyle} />
  );
}

function ColorIn({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <input type="color" value={value} onChange={e => onChange(e.target.value)}
      style={{ width: 60, height: 26, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none',
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 10, padding: '5px 3px', borderRadius: 5, cursor: 'pointer', fontWeight: 600,
};
