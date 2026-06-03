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

export type ComponentType = 'grab' | 'physics' | 'worldPhysics' | 'collider' | 'postProcess' | 'particle' | 'videoRemote' | 'health' | 'damage' | 'flashlight' | 'npc' | 'pickup';

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
 *  - color: 색상 선택기 (hex 문자열)
 */
export interface ComponentPropDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'enum' | 'color';
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
      { key: 'trigger', label: '트리거(센서) — 막지 않고 통과, 닿으면 onTriggerEnter', type: 'boolean', default: false },
    ],
  },
  {
    type: 'postProcess',
    name: 'PostProcess 볼륨 (후처리)',
    icon: '🎬',
    description: '언리얼식 후처리 볼륨. 빈 오브젝트에 부착해 화면 효과(발광/비네팅/색수차/밝기·대비/피사계심도/톤매핑) 조절. 여러 개면 첫 번째만 적용. 편집·시뮬·플레이 모두 반영.',
    props: [
      { key: 'enabled',        label: '활성화',                 type: 'boolean', default: true },
      { key: 'bloom',          label: 'Bloom 발광',             type: 'boolean', default: true },
      { key: 'bloomIntensity', label: '발광 세기',              type: 'number', default: 0.6,  min: 0, max: 3,    step: 0.05 },
      { key: 'bloomThreshold', label: '발광 임계값',            type: 'number', default: 0.85, min: 0, max: 1,    step: 0.05 },
      { key: 'vignette',       label: '비네팅 (0=끔)',          type: 'number', default: 0.3,  min: 0, max: 1,    step: 0.05 },
      { key: 'chromatic',      label: '색수차 (0=끔)',          type: 'number', default: 0,    min: 0, max: 0.01, step: 0.0005 },
      { key: 'brightness',     label: '밝기',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02 },
      { key: 'contrast',       label: '대비',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02 },
      { key: 'dof',            label: '피사계심도(DOF)',         type: 'boolean', default: false },
      { key: 'dofFocus',       label: 'DOF 초점거리',           type: 'number', default: 0.02, min: 0, max: 1,    step: 0.005 },
      { key: 'dofFocalLength', label: 'DOF 초점길이',           type: 'number', default: 0.05, min: 0, max: 1,    step: 0.005 },
      { key: 'dofBokeh',       label: 'DOF 보케 크기',          type: 'number', default: 2,    min: 0, max: 10,   step: 0.5 },
      { key: 'toneMapping',    label: 'ACES 톤매핑',            type: 'boolean', default: false },
    ],
  },
  {
    type: 'particle',
    name: '파티클 (눈/연기/불)',
    icon: '❄️',
    description: '오브젝트 위치에서 파티클을 방출. 방식=continuous 면 계속 방출(눈·연기 등), click 이면 1인칭에서 그 오브젝트를 클릭할 때마다 한 번 터지는 효과. 프리셋·개수·크기·속도·범위·색·텍스처를 조절. 빈 오브젝트에 붙여 방출기로 쓰기 좋음. 편집·시뮬·플레이 모두 반영.',
    props: [
      { key: 'mode',    label: '방식 (continuous=계속 / click=클릭시 터짐)', type: 'enum', default: 'continuous', options: ['continuous', 'click'] },
      { key: 'preset',  label: '프리셋',              type: 'enum',   default: 'snow', options: ['snow', 'smoke', 'fire', 'rain', 'sparkles'] },
      { key: 'count',   label: '개수',                type: 'number', default: 300,  min: 1,   max: 3000, step: 10 },
      { key: 'size',    label: '입자 크기 (배율)',    type: 'number', default: 1,    min: 0.1, max: 5,    step: 0.1 },
      { key: 'speed',   label: '속도 (배율)',         type: 'number', default: 1,    min: 0.1, max: 5,    step: 0.1 },
      { key: 'area',    label: '퍼짐 반경',           type: 'number', default: 6,    min: 0.5, max: 40,   step: 0.5 },
      { key: 'height',  label: '높이 범위',           type: 'number', default: 8,    min: 0.5, max: 40,   step: 0.5 },
      { key: 'opacity', label: '투명도',              type: 'number', default: 0.85, min: 0,   max: 1,    step: 0.05 },
      { key: 'color',   label: '색 (흰색=프리셋 기본)', type: 'color',  default: '#ffffff' },
      { key: 'texture', label: '텍스처 URL (비우면 기본 원형)', type: 'string', default: '' },
    ],
  },
  {
    type: 'grab',
    name: 'Grab (잡기)',
    icon: '✋',
    description: '1인칭 모드에서 E 키로 잡을 수 있게 함. Physics handle 처럼 카메라 앞을 따라옴. (Physics dynamic 컴포넌트 같이 부착 권장)',
  },
  {
    type: 'health',
    name: 'Health (HP)',
    icon: '❤️',
    description: '오브젝트에 HP 부여. 데미지 받으면 감소, 0 이면 onDeath 실행 후 destroy (옵션). 스크립트에서 self.heal(n) / self.damage(n) / self.getHp() 호출 가능. damage 컴포넌트 가 닿으면 자동 감소.',
    props: [
      { key: 'maxHp',         label: '최대 HP',                  type: 'number',  default: 100, min: 1, max: 100000, step: 1 },
      { key: 'startHp',       label: '시작 HP (-1=maxHp)',       type: 'number',  default: -1, min: -1, max: 100000, step: 1 },
      { key: 'invulnTime',    label: '피격 무적 시간 (s)',       type: 'number',  default: 0.3, min: 0, max: 5, step: 0.1 },
      { key: 'destroyOnDeath', label: '사망 시 자동 제거',         type: 'boolean', default: true },
      { key: 'team',          label: '팀 (같은 팀끼리 무피해)',   type: 'string',  default: '' },
      { key: 'onDeathScript', label: 'onDeath 스크립트 (JS)',    type: 'string',  default: '' },
    ],
  },
  {
    type: 'damage',
    name: 'Damage (피해 가하기)',
    icon: '⚔️',
    description: '이 오브젝트가 다른 오브젝트(health 있음)와 닿거나 트리거 진입 시 피해를 가함. team 같으면 피해 X. 발사체/적/함정 등에 부착.',
    props: [
      { key: 'amount',     label: '피해량',                          type: 'number',  default: 10, min: 1, max: 10000, step: 1 },
      { key: 'mode',       label: '모드 (contact=닿으면 / trigger=영역 진입 / aoe=주기적 주변)', type: 'enum', default: 'contact', options: ['contact', 'trigger', 'aoe'] },
      { key: 'aoeRadius',  label: 'AOE 반경 (m, aoe 모드만)',         type: 'number',  default: 3, min: 0.1, max: 50, step: 0.1 },
      { key: 'aoeInterval', label: 'AOE 주기 (s, aoe 모드만)',         type: 'number',  default: 1, min: 0.1, max: 60, step: 0.1 },
      { key: 'team',       label: '팀 (대상 team 과 같으면 피해 X)',  type: 'string',  default: '' },
      { key: 'destroyOnHit', label: '히트 후 자동 제거 (발사체용)',   type: 'boolean', default: false },
    ],
  },
  {
    type: 'flashlight',
    name: 'Flashlight (손전등)',
    icon: '🔦',
    description: '오브젝트 위치에 spotlight 부착 + 카메라(1인칭) 따라가게 옵션. 호러/탐험 게임에 사용. range/angle 로 빔 형태 조절. 토글로 ON/OFF.',
    props: [
      { key: 'range',     label: '빔 거리 (m)',                       type: 'number',  default: 15, min: 1, max: 100, step: 0.5 },
      { key: 'angle',     label: '빔 각도 (degree)',                  type: 'number',  default: 35, min: 5, max: 90, step: 1 },
      { key: 'intensity', label: '밝기',                              type: 'number',  default: 5, min: 0, max: 50, step: 0.5 },
      { key: 'color',     label: '색',                                type: 'color',   default: '#fff5dd' },
      { key: 'followCamera', label: '1인칭 카메라 따라감 (이 오브젝트 잡을 때만)', type: 'boolean', default: true },
      { key: 'on',        label: '기본 켜짐',                         type: 'boolean', default: true },
    ],
  },
  {
    type: 'pickup',
    name: 'Pickup (줍기/스크랩)',
    icon: '📦',
    description: '아이템화 — 플레이어가 닿거나 1인칭에서 E 로 줍기. 인벤토리 추가 + 오브젝트 제거 (또는 hidden). 스크랩 가치/무게/타입 지정. 인벤토리 = data 시스템 (data.get("inventory") 배열로 저장).',
    props: [
      { key: 'itemKey',    label: '아이템 키 (data 식별자)',   type: 'string',  default: 'item' },
      { key: 'displayName', label: '표시 이름',                 type: 'string',  default: '아이템' },
      { key: 'icon',       label: '아이콘 이모지 (선택)',       type: 'string',  default: '📦' },
      { key: 'value',      label: '가치 (스크랩 가격 등)',      type: 'number',  default: 10, min: 0, max: 1000000, step: 1 },
      { key: 'weight',     label: '무게 (kg)',                  type: 'number',  default: 1, min: 0, max: 1000, step: 0.1 },
      { key: 'mode',       label: '줍기 방식 (touch=닿으면 / interact=E 키)', type: 'enum', default: 'interact', options: ['touch', 'interact'] },
      { key: 'oneShot',    label: '일회성 (줍고 사라짐 / false=계속 줍힘)', type: 'boolean', default: true },
      { key: 'maxStack',   label: '최대 스택 (인벤토리)',       type: 'number',  default: 99, min: 1, max: 9999, step: 1 },
    ],
  },
  {
    type: 'npc',
    name: 'NPC (적 AI)',
    icon: '👹',
    description: '단순 AI — 배회 → 가장 가까운 플레이어 감지 → 추적 → 사거리 도달 시 공격 (damage 컴포넌트 필요). aggroRange 안 들어오면 idle. 호스트만 실행 (권위 모델).',
    props: [
      { key: 'mode',        label: 'AI (idle=정지 / patrol=배회 / chase=추적 / both=감지시 추적)', type: 'enum', default: 'both', options: ['idle', 'patrol', 'chase', 'both'] },
      { key: 'aggroRange',  label: '감지 반경 (m)',                  type: 'number', default: 15, min: 0.5, max: 100, step: 0.5 },
      { key: 'attackRange', label: '공격 사거리 (m)',                type: 'number', default: 1.5, min: 0.1, max: 50, step: 0.1 },
      { key: 'attackCooldown', label: '공격 쿨다운 (s)',             type: 'number', default: 1.5, min: 0.1, max: 30, step: 0.1 },
      { key: 'moveSpeed',   label: '이동 속도 (m/s)',                type: 'number', default: 3, min: 0.1, max: 20, step: 0.1 },
      { key: 'patrolRadius', label: '배회 반경 (patrol 모드, m)',     type: 'number', default: 8, min: 0.5, max: 50, step: 0.5 },
      { key: 'team',        label: '팀',                              type: 'string', default: 'enemy' },
    ],
  },
  {
    type: 'videoRemote',
    name: '미디어 리모컨 (화면 조작)',
    icon: '📺',
    description: '이 오브젝트 위치에 3D 조작 패널 — 화면 오브젝트(영상/이미지/임베드)를 제어. URL 입력 시 YouTube · mp4/webm · GIF/PNG · 외부 사이트(호스팅 게임 등) · 임베드 코드 (<iframe ...>) 자동 인식. target 라벨에 콤마로 여러 화면 지정 (비우면 모든 화면 동시 제어). 시뮬·월드에서 동작.',
    props: [
      { key: 'target', label: '대상 화면 라벨 (콤마로 여러 개, 비우면 모든 화면)', type: 'string', default: '' },
      { key: 'url',    label: 'URL / 임베드 코드 (입력 시 target 화면에 자동 적용)', type: 'string', default: '' },
      { key: 'width',  label: '가로 크기 (월드 단위)', type: 'number', default: 1.6, min: 0.2, max: 8, step: 0.1 },
      { key: 'height', label: '세로 크기 (월드 단위)', type: 'number', default: 0.8, min: 0.1, max: 4, step: 0.05 },
      { key: 'offsetY', label: 'Y 오프셋 (오브젝트 위)',   type: 'number', default: 1,   min: -5, max: 10, step: 0.1 },
      { key: 'initiallyPlaying', label: '입장 시 자동 재생 (체크 해제 시 정지 상태로 시작)', type: 'boolean', default: true },
      { key: 'globalAudio',      label: '월드 전역 음향 (체크 해제 시 거리에 따라 감쇠)',    type: 'boolean', default: false },
    ],
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
