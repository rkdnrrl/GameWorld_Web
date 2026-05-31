'use client';
/**
 * UI Renderer — Phase 1 (Screen Space only).
 *
 * MapObject 의 kind === 'ui' 이고 ui.type === 'canvas' && ui.space === 'screen' 인
 * 오브젝트를 root 로, 그 자식들 (panel/image/text/button) 을 HTML overlay 로 렌더.
 *
 * Phase 3 에서 World Space (drei Html transform) 추가 예정.
 */
import React from 'react';
import { resolveRect, type UiData } from './uiObjects';

export interface UiTreeObject {
  id: string;
  parentId?: string | null;
  hidden?: boolean;
  label?: string;
  ui: UiData;
}

interface Props {
  objects: UiTreeObject[];
  /** 버튼 클릭 시 호출 — onClickScript 와 함께. 호출부에서 스크립트 실행. */
  onButtonClick?: (id: string, script: string) => void;
  /** 편집 모드 — 인터랙티브 비활성 (Phase 2 에서 활용) */
  editMode?: boolean;
}

export function UIRenderer({ objects, onButtonClick, editMode = false }: Props) {
  // Screen Space canvas root 만 (Phase 1)
  const roots = objects.filter(o => !o.hidden && o.ui.type === 'canvas' && (o.ui.space ?? 'screen') === 'screen');
  if (roots.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none',
      zIndex: 16777273,   // 캔버스(16777271) 위, 인스펙터 UI 아래
    }}>
      {roots.map(c => (
        <CanvasContainer key={c.id} canvas={c} all={objects} onButtonClick={onButtonClick} editMode={editMode} />
      ))}
    </div>
  );
}

function CanvasContainer({ canvas, all, onButtonClick, editMode }: {
  canvas: UiTreeObject;
  all: UiTreeObject[];
  onButtonClick?: Props['onButtonClick'];
  editMode: boolean;
}) {
  // 화면 크기 추적 — resize 시 anchor stretch 계산이 다시 됨
  const [size, setSize] = React.useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  React.useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const children = all.filter(c => c.parentId === canvas.id && !c.hidden);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {children.map(c => (
        <UiNode key={c.id} obj={c} all={all} parentSize={size} onButtonClick={onButtonClick} editMode={editMode} />
      ))}
    </div>
  );
}

function UiNode({ obj, all, parentSize, onButtonClick, editMode }: {
  obj: UiTreeObject;
  all: UiTreeObject[];
  parentSize: { w: number; h: number };
  onButtonClick?: Props['onButtonClick'];
  editMode: boolean;
}) {
  const rect = resolveRect(obj.ui.rect, parentSize);
  const children = all.filter(c => c.parentId === obj.id && !c.hidden);
  // 인터랙션: 편집 모드면 모두 none. 플레이 모드면 button 만 auto.
  const interactivePe = !editMode && obj.ui.type === 'button';

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
      {obj.ui.type === 'image' && !obj.ui.imageUrl && editMode && (
        <div style={{ position: 'absolute', inset: 0, border: '1px dashed rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
          (image URL 없음)
        </div>
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
      {children.map(c => (
        <UiNode key={c.id} obj={c} all={all} parentSize={{ w: rect.width, h: rect.height }} onButtonClick={onButtonClick} editMode={editMode} />
      ))}
    </div>
  );
}
