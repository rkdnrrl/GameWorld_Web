/**
 * 컴포넌트 레지스트리 — Unity 스타일 컴포넌트 시스템.
 *
 * 오브젝트에 컴포넌트를 부착하면 해당 동작이 활성화됨.
 * 예: Grab → 1인칭에서 E 로 잡기, AutoRotate → 매 프레임 회전.
 *
 * 새 컴포넌트 추가 절차:
 * 1. ComponentType 에 새 type 추가
 * 2. COMPONENT_DEFS 에 정의 추가 (name/icon/desc/props 스키마)
 * 3. WorldCanvas 의 런타임 처리에 핸들러 추가
 */

export type ComponentType = 'grab' | 'physics' | 'worldPhysics' | 'collider';

/** 오브젝트에 부착되는 컴포넌트 인스턴스. props 는 type 별로 다름. */
export interface ComponentInstance {
  type: ComponentType;
  // 컴포넌트별 속성. type 에 따라 다른 키 존재.
  props?: Record<string, number | string | boolean>;
}

/** props 스키마 — Studio Inspector 가 자동으로 input 렌더링.
 *  - number: 숫자 input (min/max/step)
 *  - string: 텍스트 input
 *  - boolean: 체크박스
 *  - enum: radio 버튼 그룹 (options 배열에서 선택)
 */
export interface ComponentPropDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'enum';
  default: number | string | boolean;
  min?: number;        // type=number 일 때
  max?: number;
  step?: number;
  options?: string[];  // type=enum 일 때 선택지
}

export interface ComponentDef {
  type: ComponentType;
  name: string;        // 표시 이름 (Inspector / picker)
  icon: string;        // 1자 이모지
  description: string; // picker 설명
  props?: ComponentPropDef[];
}

export const COMPONENT_DEFS: ComponentDef[] = [
  {
    type: 'worldPhysics',
    name: 'World Physics (맵 중력)',
    icon: '🌍',
    description: '맵 전역 중력/점프력 설정. 빈 오브젝트에 부착해 관리. 여러 개면 첫 번째만 적용. gravity 0 = 무중력 (지구 ≈ -9.8, 게임 기본 -22).',
    props: [
      { key: 'gravity',   label: '중력 Y (gravity)',  type: 'number', default: -22, min: -40, max: 0,  step: 0.5 },
      { key: 'jumpPower', label: '점프력 (jumpPower)', type: 'number', default: 7,   min: 0,   max: 25, step: 0.5 },
    ],
  },
  {
    type: 'physics',
    name: 'Physics (물리)',
    icon: '🧱',
    description: 'Rigidbody + Collider. 부착 안 하면 물리 X (콜라이더도 없음). mode=fixed 는 움직임 없는 단단한 벽, dynamic 은 중력/충돌 받음.',
    props: [
      { key: 'mode', label: 'mode (fixed/dynamic)', type: 'string', default: 'fixed' },
    ],
  },
  {
    type: 'collider',
    name: 'Collider (충돌 박스)',
    icon: '🟩',
    description: '명시적 박스 콜라이더. 크기/위치를 직접 지정하거나 "자동 맞춤" 으로 오브젝트 경계에 맞춤. Physics 와 같이 쓰면 이 박스 모양으로 충돌하고, Physics 없이 단독이면 고정(fixed) 콜라이더가 된다. 크기·오프셋은 오브젝트 로컬 단위(스케일 적용 전).',
    props: [
      { key: 'sizeX', label: '크기 X', type: 'number', default: 1, min: 0.01, step: 0.1 },
      { key: 'sizeY', label: '크기 Y', type: 'number', default: 1, min: 0.01, step: 0.1 },
      { key: 'sizeZ', label: '크기 Z', type: 'number', default: 1, min: 0.01, step: 0.1 },
      { key: 'offsetX', label: '오프셋 X', type: 'number', default: 0, step: 0.1 },
      { key: 'offsetY', label: '오프셋 Y', type: 'number', default: 0, step: 0.1 },
      { key: 'offsetZ', label: '오프셋 Z', type: 'number', default: 0, step: 0.1 },
    ],
  },
  {
    type: 'grab',
    name: 'Grab (잡기)',
    icon: '✋',
    description: '1인칭 모드에서 E 키로 잡을 수 있게 함. Physics handle 처럼 카메라 앞을 따라옴. (Physics dynamic 컴포넌트 같이 부착 권장)',
  },
];

/** type 으로 정의 조회. 없으면 undefined. */
export function getComponentDef(type: string): ComponentDef | undefined {
  return COMPONENT_DEFS.find(c => c.type === type);
}

/** 컴포넌트 인스턴스에서 prop 값 읽기 (기본값 fallback). */
export function getProp<T extends number | string | boolean>(
  inst: ComponentInstance,
  key: string,
  fallback: T,
): T {
  const v = inst.props?.[key];
  return (v === undefined ? fallback : v) as T;
}

/** 오브젝트에 특정 컴포넌트가 있는지. */
export function hasComponent(
  components: ComponentInstance[] | undefined,
  type: ComponentType,
): boolean {
  return !!components?.some(c => c.type === type);
}

/** 오브젝트에서 특정 컴포넌트 인스턴스 가져오기. */
export function findComponent(
  components: ComponentInstance[] | undefined,
  type: ComponentType,
): ComponentInstance | undefined {
  return components?.find(c => c.type === type);
}
