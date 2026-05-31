'use client';
/**
 * World Space UI Renderer — Phase 3.
 *
 * canvas.ui.space === 'world' 인 Canvas 를 3D 공간에 mesh 처럼 띄움.
 * drei `<Html transform>` 사용 — div 가 3D world matrix 따라감.
 *
 * canvas.position/rotation/scale (MapObject 기본 필드) 로 3D 위치/회전/크기.
 * canvas.ui.rect.width/height (px) — 자식 RectTransform 영역.
 *
 * R3F Canvas 안에서만 마운트 가능 (drei Html 요건).
 */
import React from 'react';
import { Html } from '@react-three/drei';
import { resolveRect, type UiData } from './uiObjects';

export interface UiWorldTreeObject {
  id: string;
  parentId?: string | null;
  hidden?: boolean;
  label?: string;
  ui: UiData;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
}

interface Props {
  objects: UiWorldTreeObject[];
  onButtonClick?: (id: string, script: string) => void;
  onValueChange?: (id: string, script: string, value: number | string | boolean) => void;
  onLocalValueChange?: (id: string, patch: { value?: number; inputValue?: string; checked?: boolean }) => void;
  editMode?: boolean;
}

export function UIWorldRenderer({ objects, onButtonClick, onValueChange, onLocalValueChange, editMode = false }: Props) {
  // World Space canvas root 만
  const roots = objects.filter(o => !o.hidden && o.ui.type === 'canvas' && o.ui.space === 'world');
  if (roots.length === 0) return null;

  return (
    <>
      {roots.map(c => (
        <WorldCanvasMount key={c.id} canvas={c} all={objects}
          onButtonClick={onButtonClick} onValueChange={onValueChange} onLocalValueChange={onLocalValueChange}
          editMode={editMode} />
      ))}
    </>
  );
}

function WorldCanvasMount({ canvas, all, onButtonClick, onValueChange, onLocalValueChange, editMode }: {
  canvas: UiWorldTreeObject;
  all: UiWorldTreeObject[];
  onButtonClick?: Props['onButtonClick'];
  onValueChange?: Props['onValueChange'];
  onLocalValueChange?: Props['onLocalValueChange'];
  editMode: boolean;
}) {
  const w = canvas.ui.rect.width || 1920;
  const h = canvas.ui.rect.height || 1080;
  const children = all.filter(c => c.parentId === canvas.id && !c.hidden);
  // drei Html transform: 1 px = ~1/40 unit (distanceFactor=10 기본). MapObject.scale 로 실제 크기 조절.
  // div 는 canvas (w x h) px. 자식들이 그 영역 기준 RectTransform.
  return (
    <Html transform position={canvas.position} rotation={canvas.rotation} scale={canvas.scale} occlude={false}>
      <div style={{
        width: w, height: h, position: 'relative',
        // 편집 모드면 윤곽 표시 (선택 보조), 플레이는 투명
        outline: editMode ? '2px dashed rgba(99,102,241,0.5)' : 'none',
        background: editMode ? 'rgba(0,0,0,0.02)' : 'transparent',
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        {children.map(c => (
          <UiNode key={c.id} obj={c} all={all} parentSize={{ w, h }}
            onButtonClick={onButtonClick} onValueChange={onValueChange} onLocalValueChange={onLocalValueChange}
            editMode={editMode} />
        ))}
      </div>
    </Html>
  );
}

function UiNode({ obj, all, parentSize, onButtonClick, onValueChange, onLocalValueChange, editMode }: {
  obj: UiWorldTreeObject;
  all: UiWorldTreeObject[];
  parentSize: { w: number; h: number };
  onButtonClick?: Props['onButtonClick'];
  onValueChange?: Props['onValueChange'];
  onLocalValueChange?: Props['onLocalValueChange'];
  editMode: boolean;
}) {
  const rect = resolveRect(obj.ui.rect, parentSize);
  const children = all.filter(c => c.parentId === obj.id && !c.hidden);
  const interactiveTypes = ['button', 'slider', 'input', 'toggle', 'scrollview'];
  const interactivePe = !editMode && interactiveTypes.includes(obj.ui.type);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    pointerEvents: interactivePe ? 'auto' : 'none',
  };

  return (
    <div style={style}>
      {obj.ui.type === 'panel' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: obj.ui.bgColor || 'rgba(0,0,0,0.5)',
          opacity: obj.ui.alpha ?? 1,
          borderRadius: 4,
        }} />
      )}
      {obj.ui.type === 'image' && obj.ui.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={obj.ui.imageUrl} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: obj.ui.alpha ?? 1, pointerEvents: 'none' }}
          draggable={false} />
      )}
      {obj.ui.type === 'text' && (
        <div style={{
          position: 'absolute', inset: 0,
          color: obj.ui.color || '#fff', fontSize: obj.ui.fontSize || 20, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)', whiteSpace: 'pre-wrap', textAlign: 'center', lineHeight: 1.25,
        }}>
          {obj.ui.text || ''}
        </div>
      )}
      {obj.ui.type === 'button' && (
        <button type="button"
          disabled={editMode}
          onClick={() => onButtonClick?.(obj.id, obj.ui.onClickScript || '')}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            color: obj.ui.color || '#fff', background: obj.ui.bgColor || '#4f46e5',
            border: 'none', borderRadius: 6,
            fontSize: obj.ui.fontSize || 16, fontWeight: 700,
            cursor: editMode ? 'default' : 'pointer',
          }}>
          {obj.ui.text || 'Button'}
        </button>
      )}
      {obj.ui.type === 'slider' && (
        <input type="range" disabled={editMode}
          min={obj.ui.min ?? 0} max={obj.ui.max ?? 100} step={obj.ui.step ?? 1}
          value={obj.ui.value ?? 50}
          onChange={e => {
            const v = Number(e.target.value);
            onLocalValueChange?.(obj.id, { value: v });
            onValueChange?.(obj.id, obj.ui.onChangeScript || '', v);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', accentColor: obj.ui.color || '#4f46e5', cursor: editMode ? 'default' : 'pointer' }} />
      )}
      {obj.ui.type === 'input' && !obj.ui.multiline && (
        <input type="text" disabled={editMode}
          value={obj.ui.inputValue ?? ''} placeholder={obj.ui.placeholder || ''}
          onChange={e => { const v = e.target.value; onLocalValueChange?.(obj.id, { inputValue: v }); onValueChange?.(obj.id, obj.ui.onChangeScript || '', v); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: obj.ui.color || '#fff', background: obj.ui.bgColor || 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, fontSize: obj.ui.fontSize || 14, padding: '0 8px', outline: 'none' }} />
      )}
      {obj.ui.type === 'input' && obj.ui.multiline && (
        <textarea disabled={editMode}
          value={obj.ui.inputValue ?? ''} placeholder={obj.ui.placeholder || ''}
          onChange={e => { const v = e.target.value; onLocalValueChange?.(obj.id, { inputValue: v }); onValueChange?.(obj.id, obj.ui.onChangeScript || '', v); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: obj.ui.color || '#fff', background: obj.ui.bgColor || 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, fontSize: obj.ui.fontSize || 14, padding: '6px 8px', outline: 'none', resize: 'none' }} />
      )}
      {obj.ui.type === 'toggle' && (
        <label style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, color: obj.ui.color || '#fff', fontSize: obj.ui.fontSize || 13, cursor: editMode ? 'default' : 'pointer', userSelect: 'none' }}>
          <input type="checkbox" disabled={editMode} checked={!!obj.ui.checked}
            onChange={e => { const v = e.target.checked; onLocalValueChange?.(obj.id, { checked: v }); onValueChange?.(obj.id, obj.ui.onChangeScript || '', v); }} />
          <span>{obj.ui.text || '체크박스'}</span>
        </label>
      )}
      {obj.ui.type === 'scrollview' && (() => {
        const cw = obj.ui.scrollContentWidth  || rect.width;
        const ch = obj.ui.scrollContentHeight || rect.height;
        return (
          <div style={{
            position: 'absolute', inset: 0,
            background: obj.ui.bgColor || 'rgba(0,0,0,0.3)',
            overflowX: obj.ui.scrollHorizontal ? 'auto' : 'hidden',
            overflowY: obj.ui.scrollVertical !== false ? 'auto' : 'hidden',
            borderRadius: 4,
          }}>
            <div style={{ position: 'relative', width: cw, height: ch }}>
              {children.map(c => (
                <UiNode key={c.id} obj={c} all={all} parentSize={{ w: cw, h: ch }}
                  onButtonClick={onButtonClick} onValueChange={onValueChange} onLocalValueChange={onLocalValueChange}
                  editMode={editMode} />
              ))}
            </div>
          </div>
        );
      })()}
      {obj.ui.type !== 'scrollview' && children.map(c => (
        <UiNode key={c.id} obj={c} all={all} parentSize={{ w: rect.width, h: rect.height }}
          onButtonClick={onButtonClick} onValueChange={onValueChange} onLocalValueChange={onLocalValueChange}
          editMode={editMode} />
      ))}
    </div>
  );
}
