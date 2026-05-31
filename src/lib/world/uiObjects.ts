/**
 * 유니티식 UI 시스템 — 데이터 모델.
 *
 * MapObject 의 kind === 'ui' 이면 ui 필드에 RectTransform + 요소별 props 저장.
 * 트리에 부모-자식 계층으로 구성:
 *   Canvas (root) → Panel/Image/Text/Button (자식)
 *
 * Canvas 의 space 가 'screen' 이면 화면 좌표 (HTML overlay). 'world' 면 3D 공간 (drei Html).
 * 자식들의 RectTransform 은 부모 영역 기준 anchor/pivot/posX/posY/width/height.
 */

export type UiElementType = 'canvas' | 'panel' | 'image' | 'text' | 'button';

export interface RectTransform {
  /** Anchor min (0~1) — 부모 영역 안에서 어디에 매여 있는지. (0,0)=좌하 (1,1)=우상 (유니티 규약) */
  anchorMin: { x: number; y: number };
  /** Anchor max (0~1). anchorMin==anchorMax 면 점 고정, 다르면 stretch */
  anchorMax: { x: number; y: number };
  /** Pivot (0~1) — 회전/크기 변환 기준점 */
  pivot:     { x: number; y: number };
  /** Anchor 점으로부터 offset (px) */
  posX: number;
  posY: number;
  /** Width (px) — anchor 가 stretch 면 sizeDelta (음수=margin) */
  width: number;
  height: number;
}

export interface UiData {
  type: UiElementType;
  rect: RectTransform;
  /** Canvas 일 때만 의미. 'screen' = HTML overlay, 'world' = 3D 공간 (Phase 3) */
  space?: 'screen' | 'world';
  /** 텍스트 콘텐츠 (text/button) */
  text?: string;
  fontSize?: number;
  /** 글자색 (text) 또는 색 (button) */
  color?: string;
  /** 배경색 (panel/button) */
  bgColor?: string;
  /** 이미지 URL (image) */
  imageUrl?: string;
  /** 투명도 (image/panel) */
  alpha?: number;
  /** 버튼 onClick 스크립트 (button) — 누르면 실행 */
  onClickScript?: string;
}

/** 새 UI 오브젝트 생성 — 타입별 기본값. canvas 일 때 space 로 screen/world 선택. */
export function makeDefaultUiData(type: UiElementType, space: 'screen' | 'world' = 'screen'): UiData {
  if (type === 'canvas') {
    if (space === 'world') {
      // World Space: 3D 공간에 떠 있는 px 영역. 자식 RectTransform 은 이 영역 기준.
      // 기본 1920x1080 — 사용자가 scale (MapObject.scale) 로 실제 3D 크기 조절.
      return {
        type, space: 'world',
        rect: { anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 }, pivot: { x: 0.5, y: 0.5 }, posX: 0, posY: 0, width: 1920, height: 1080 },
      };
    }
    return {
      type, space: 'screen',
      rect: { anchorMin: { x: 0, y: 0 }, anchorMax: { x: 1, y: 1 }, pivot: { x: 0.5, y: 0.5 }, posX: 0, posY: 0, width: 0, height: 0 },
    };
  }
  const baseRect: RectTransform = {
    anchorMin: { x: 0.5, y: 0.5 }, anchorMax: { x: 0.5, y: 0.5 },
    pivot: { x: 0.5, y: 0.5 }, posX: 0, posY: 0, width: 200, height: 60,
  };
  if (type === 'text')   return { type, rect: baseRect, text: '텍스트', fontSize: 24, color: '#ffffff' };
  if (type === 'image')  return { type, rect: { ...baseRect, width: 200, height: 200 }, imageUrl: '', color: '#ffffff', alpha: 1 };
  if (type === 'button') return { type, rect: baseRect, text: '버튼', fontSize: 18, color: '#ffffff', bgColor: '#4f46e5', onClickScript: '' };
  if (type === 'panel')  return { type, rect: { ...baseRect, width: 300, height: 200 }, bgColor: 'rgba(0,0,0,0.5)' };
  return { type, rect: baseRect };
}

/** 부모 영역(px) 안에서 RectTransform 해석 → CSS 좌표 (left,top,width,height).
 *  유니티 Y up 을 CSS Y down 으로 변환. */
export function resolveRect(rect: RectTransform, parentSize: { w: number; h: number }):
  { left: number; top: number; width: number; height: number } {
  const ax0 = rect.anchorMin.x * parentSize.w;
  const ax1 = rect.anchorMax.x * parentSize.w;
  const ay0 = rect.anchorMin.y * parentSize.h;
  const ay1 = rect.anchorMax.y * parentSize.h;
  const sameX = ax0 === ax1;
  const sameY = ay0 === ay1;
  let left: number, width: number;
  if (sameX) { width = rect.width; left = ax0 + rect.posX - rect.pivot.x * rect.width; }
  else        { left = ax0 + rect.posX; width = Math.max(0, (ax1 - ax0) - rect.width); }
  let top: number, height: number;
  // Y 변환: 유니티 Y up (anchor 0 = 하단) → CSS Y down (0 = 상단)
  if (sameY) { height = rect.height; top = parentSize.h - ay0 - rect.posY - (1 - rect.pivot.y) * rect.height; }
  else        { top = parentSize.h - ay1 - rect.posY; height = Math.max(0, (ay1 - ay0) - rect.height); }
  return { left, top, width, height };
}
