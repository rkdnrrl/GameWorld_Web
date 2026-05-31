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

export type UiElementType = 'canvas' | 'panel' | 'image' | 'text' | 'button' | 'slider' | 'input' | 'toggle' | 'scrollview';

/** UI 멀티 동기화 — 호스트의 ui.set/show/hide 결과를 전원에게 broadcast.
 *  메시지 페이로드: { label: string, patch?: Record<string, unknown>, hidden?: boolean } */
export const UI_SYNC_EVENT = '__uisync__';

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
  /** slider 범위/값 */
  min?: number;
  max?: number;
  value?: number;
  step?: number;
  /** input placeholder */
  placeholder?: string;
  /** input 텍스트 (현재 값) */
  inputValue?: string;
  /** input 여러 줄 (textarea) */
  multiline?: boolean;
  /** toggle 체크 상태 */
  checked?: boolean;
  /** scrollview 방향 — 둘 다 true 면 가로·세로 둘 다 스크롤 가능 */
  scrollVertical?: boolean;
  scrollHorizontal?: boolean;
  /** scrollview 의 내부 contentSize (px) — 영역보다 크면 스크롤 발생.
   *  0 또는 미설정이면 영역 크기와 같음 (스크롤 X). */
  scrollContentWidth?: number;
  scrollContentHeight?: number;
  /** slider/input/toggle 값 변경 시 실행되는 스크립트 (value 변수로 사용 가능) */
  onChangeScript?: string;
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
  if (type === 'slider') return { type, rect: { ...baseRect, width: 240, height: 30 }, min: 0, max: 100, value: 50, step: 1, color: '#4f46e5', onChangeScript: '' };
  if (type === 'input')  return { type, rect: { ...baseRect, width: 240, height: 36 }, inputValue: '', placeholder: '입력...', fontSize: 14, color: '#ffffff', bgColor: 'rgba(0,0,0,0.5)', multiline: false, onChangeScript: '' };
  if (type === 'toggle') return { type, rect: { ...baseRect, width: 160, height: 28 }, checked: false, text: '체크박스', color: '#ffffff', fontSize: 13, onChangeScript: '' };
  if (type === 'scrollview') return { type, rect: { ...baseRect, width: 300, height: 200 }, bgColor: 'rgba(0,0,0,0.3)', scrollVertical: true, scrollHorizontal: false, scrollContentWidth: 0, scrollContentHeight: 600 };
  return { type, rect: baseRect };
}

/* ── AI JSON import/export ──
 *
 * AI 가 친숙한 단순 JSON 포맷. anchor 는 키워드("top","center","bottom-right",...) 또는 정확한 0~1 배열.
 * 트리 중첩으로 부모-자식 관계 표현 — flat MapObject[] 로 변환되어 setObjects 에 넣음.
 *
 * 예: { type:"panel", label:"설정", anchor:"center", pos:[0,0], size:[400,300], children:[ ... ] }
 */

/** anchor 키워드 → {anchorMin, anchorMax, pivot} 매핑 (9-점 + 4-stretch). */
const ANCHOR_KEYWORDS: Record<string, { min: { x: number; y: number }; max: { x: number; y: number }; pivot: { x: number; y: number } }> = {
  'top-left':     { min: { x: 0, y: 1 }, max: { x: 0, y: 1 }, pivot: { x: 0, y: 1 } },
  'top':          { min: { x: 0.5, y: 1 }, max: { x: 0.5, y: 1 }, pivot: { x: 0.5, y: 1 } },
  'top-right':    { min: { x: 1, y: 1 }, max: { x: 1, y: 1 }, pivot: { x: 1, y: 1 } },
  'left':         { min: { x: 0, y: 0.5 }, max: { x: 0, y: 0.5 }, pivot: { x: 0, y: 0.5 } },
  'center':       { min: { x: 0.5, y: 0.5 }, max: { x: 0.5, y: 0.5 }, pivot: { x: 0.5, y: 0.5 } },
  'right':        { min: { x: 1, y: 0.5 }, max: { x: 1, y: 0.5 }, pivot: { x: 1, y: 0.5 } },
  'bottom-left':  { min: { x: 0, y: 0 }, max: { x: 0, y: 0 }, pivot: { x: 0, y: 0 } },
  'bottom':       { min: { x: 0.5, y: 0 }, max: { x: 0.5, y: 0 }, pivot: { x: 0.5, y: 0 } },
  'bottom-right': { min: { x: 1, y: 0 }, max: { x: 1, y: 0 }, pivot: { x: 1, y: 0 } },
  'stretch':      { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, pivot: { x: 0.5, y: 0.5 } },
  'stretch-x':    { min: { x: 0, y: 0.5 }, max: { x: 1, y: 0.5 }, pivot: { x: 0.5, y: 0.5 } },
  'stretch-y':    { min: { x: 0.5, y: 0 }, max: { x: 0.5, y: 1 }, pivot: { x: 0.5, y: 0.5 } },
};

/** AI JSON 의 UI 노드 — 재귀 children */
export interface AiUiNode {
  type: UiElementType;
  label?: string;
  /** 'top'/'center'/'bottom-right' 등 키워드. 미설정 시 'center'. canvas 는 무시(자체 처리) */
  anchor?: string;
  pos?: [number, number];
  size?: [number, number];
  /** Canvas 일 때만 — 'screen' 또는 'world'. 기본 'screen' */
  space?: 'screen' | 'world';
  /** World canvas 일 때 3D 위치/회전/스케일 */
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** 요소별 props */
  text?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  imageUrl?: string;
  alpha?: number;
  onClickScript?: string;
  min?: number;
  max?: number;
  value?: number;
  step?: number;
  placeholder?: string;
  inputValue?: string;
  multiline?: boolean;
  checked?: boolean;
  scrollVertical?: boolean;
  scrollHorizontal?: boolean;
  scrollContentWidth?: number;
  scrollContentHeight?: number;
  onChangeScript?: string;
  children?: AiUiNode[];
}

/** 최상위 — Canvas 1개 + children (단일 Canvas 가정). 여러 Canvas 면 배열로. */
export type AiUiRoot = AiUiNode | { canvases: AiUiNode[] };

/** AI JSON → flat MapObject-like 배열 변환 (kind='ui' 만). 호출부는 setObjects 로 append. */
export interface FlatUiObject {
  id: string;
  kind: 'ui';
  label?: string;
  parentId?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
  color:    string;
  ui: UiData;
}

function rectFromAi(node: AiUiNode, defaultSize: { w: number; h: number }): RectTransform {
  const a = ANCHOR_KEYWORDS[(node.anchor || 'center').toLowerCase()] || ANCHOR_KEYWORDS.center;
  const pos = node.pos || [0, 0];
  const sz = node.size || [defaultSize.w, defaultSize.h];
  return {
    anchorMin: a.min, anchorMax: a.max, pivot: a.pivot,
    posX: pos[0], posY: pos[1],
    width: sz[0], height: sz[1],
  };
}

function uiDataFromAi(node: AiUiNode): UiData {
  const def = makeDefaultUiData(node.type, node.type === 'canvas' ? (node.space || 'screen') : undefined);
  const isCanvas = node.type === 'canvas';
  const rect = isCanvas ? def.rect : rectFromAi(node, { w: def.rect.width, h: def.rect.height });
  // size 가 명시되면 canvas 도 그 size 사용 (world canvas 의 px 영역)
  if (isCanvas && node.size) { rect.width = node.size[0]; rect.height = node.size[1]; }
  return {
    ...def,
    rect,
    text: node.text ?? def.text,
    fontSize: node.fontSize ?? def.fontSize,
    color: node.color ?? def.color,
    bgColor: node.bgColor ?? def.bgColor,
    imageUrl: node.imageUrl ?? def.imageUrl,
    alpha: node.alpha ?? def.alpha,
    onClickScript: node.onClickScript ?? def.onClickScript,
    min: node.min ?? def.min,
    max: node.max ?? def.max,
    value: node.value ?? def.value,
    step: node.step ?? def.step,
    placeholder: node.placeholder ?? def.placeholder,
    inputValue: node.inputValue ?? def.inputValue,
    multiline: node.multiline ?? def.multiline,
    checked: node.checked ?? def.checked,
    scrollVertical: node.scrollVertical ?? def.scrollVertical,
    scrollHorizontal: node.scrollHorizontal ?? def.scrollHorizontal,
    scrollContentWidth: node.scrollContentWidth ?? def.scrollContentWidth,
    scrollContentHeight: node.scrollContentHeight ?? def.scrollContentHeight,
    onChangeScript: node.onChangeScript ?? def.onChangeScript,
  };
}

/** AI JSON 을 flat ui 오브젝트 배열로 변환. 라벨 중복은 호출부에서 처리(addUi 처럼). */
export function parseAiUiRoot(root: AiUiRoot, idPrefix: string): FlatUiObject[] {
  const out: FlatUiObject[] = [];
  let seq = 0;
  const mkId = () => `${idPrefix}_${seq++}`;
  const walk = (node: AiUiNode, parentId?: string) => {
    const id = mkId();
    const ui = uiDataFromAi(node);
    const isWorldCanvas = node.type === 'canvas' && ui.space === 'world';
    out.push({
      id, kind: 'ui', label: node.label || node.type, parentId,
      position: node.position ?? (isWorldCanvas ? [0, 2, 0] : [0, 0, 0]),
      rotation: node.rotation ?? [0, 0, 0],
      scale:    node.scale    ?? (isWorldCanvas ? [0.005, 0.005, 0.005] : [1, 1, 1]),
      color:    '#ffffff',
      ui,
    });
    for (const c of node.children ?? []) walk(c, id);
  };
  if ('canvases' in root) for (const c of root.canvases) walk(c);
  else walk(root);
  return out;
}

/** AI 에게 줄 시스템 프롬프트/가이드 — JSON 포맷 설명 + 예시. */
export const AI_UI_PROMPT_GUIDE = `ALP UI JSON 스펙 (v1)

최상위: { canvases: [...] } 또는 단일 canvas 객체.
각 canvas: { type:"canvas", space:"screen"|"world", children:[...] }
  - "screen" = 화면 고정 HUD. children 의 RectTransform 은 화면 기준.
  - "world" = 3D 공간. size:[1920,1080] 영역 + position/scale 로 3D 배치.

자식 요소 type:
  - "panel"   = 배경 영역. props: bgColor, alpha
  - "text"    = 텍스트. props: text, fontSize, color
  - "image"   = 이미지. props: imageUrl, alpha
  - "button"  = 버튼. props: text, fontSize, color, bgColor, onClickScript
  - "slider"  = 슬라이더. props: min, max, value, step, color, onChangeScript
  - "input"   = 입력. props: inputValue, placeholder, fontSize, color, bgColor, multiline, onChangeScript
  - "toggle"  = 체크박스. props: checked, text, fontSize, color, onChangeScript
  - "scrollview" = 스크롤 영역. props: bgColor, scrollVertical, scrollHorizontal, scrollContentWidth, scrollContentHeight

공통:
  - label: 스크립트 ui.set("라벨", ...) 으로 찾을 키
  - anchor: "top-left"|"top"|"top-right"|"left"|"center"|"right"|"bottom-left"|"bottom"|"bottom-right"|"stretch"|"stretch-x"|"stretch-y"
  - pos: [x, y] (px, anchor 점으로부터의 offset)
  - size: [w, h] (px)
  - children: 중첩 자식

스크립트 (onClickScript, onChangeScript):
  - game.get/set/add(key, ...) — 전역 게임 상태
  - ui.set("라벨", { text:"...", color:"#..." }) — UI props 패치
  - ui.show/hide("라벨")
  - world.playSound("url")
  - value 변수 — slider/input/toggle 의 새 값

예시:
{
  "canvases": [{
    "type": "canvas",
    "space": "screen",
    "children": [
      {
        "type": "panel",
        "label": "HUD",
        "anchor": "top",
        "pos": [0, -10],
        "size": [400, 60],
        "bgColor": "rgba(0,0,0,0.6)",
        "children": [
          {
            "type": "text",
            "label": "점수",
            "anchor": "center",
            "pos": [0, 0],
            "size": [380, 40],
            "text": "Score: 0",
            "fontSize": 24,
            "color": "#fff"
          }
        ]
      },
      {
        "type": "button",
        "label": "리셋버튼",
        "anchor": "bottom-right",
        "pos": [-20, 20],
        "size": [120, 44],
        "text": "리셋",
        "bgColor": "#ef4444",
        "onClickScript": "game.set('score', 0); ui.set('점수', { text: 'Score: 0' });"
      }
    ]
  }]
}
`;

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
