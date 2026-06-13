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

export type ComponentType = 'grab' | 'physics' | 'worldPhysics' | 'collider' | 'postProcess' | 'particle' | 'videoRemote' | 'health' | 'damage' | 'flashlight' | 'npc' | 'pickup' | 'wave' | 'wind' | 'buoyancy' | 'animator' | 'cutter' | 'timeline' | 'ambientSound' | 'dayNight' | 'sign' | 'seat' | 'teleporter' | 'ladder' | 'door' | 'dialogue' | 'vendingMachine' | 'jumpPad' | 'checkpoint' | 'killZone' | 'raceStart' | 'raceFinish';

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
  group?: 'basic' | 'advanced';   // 인스펙터 그룹 (기본=basic, advanced=접이식 고급 섹션)
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
    description: 'Rigidbody (중력/동적). 충돌은 Collider 컴포넌트를 따로 붙여야 생김 (Physics 만으로는 충돌체 없음). mode=fixed 단단한 벽, dynamic 중력 받음.',
    props: [
      { key: 'mode', label: 'mode (fixed/dynamic)', type: 'string', default: 'fixed' },
      { key: 'weight', label: '무게 (물에서: 낮을수록 뜨고 높을수록 가라앉음, dynamic 전용)', type: 'number', default: 1, min: 0.1, max: 5, step: 0.1 },
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
    type: 'wave',
    name: '웨이브 (물결)',
    icon: '🌊',
    description: '물(water) 오브젝트의 물결 세기·속도·촘촘함을 조절. 물에 부착. 강도 0 = 잔잔, 클수록 출렁임.',
    props: [
      { key: 'strength',  label: '강도 (물결 높이)', type: 'number', default: 1, min: 0, max: 10, step: 0.1 },
      { key: 'speed',     label: '속도',             type: 'number', default: 1, min: 0, max: 5,  step: 0.1 },
      { key: 'frequency', label: '촘촘함 (잔물결)',  type: 'number', default: 1, min: 0.2, max: 4, step: 0.1 },
      { key: 'reflect',   label: '거울 반사 (주변이 비침 — 무거움, opt-in)', type: 'boolean', default: false },
    ],
  },
  {
    type: 'wind',
    name: '바람 (글로벌)',
    icon: '🍃',
    description: '한 오브젝트(예: 빈 Manager)에 하나만 붙이면 씬의 모든 3D 모델(나무 등)이 이 바람으로 흔들림. 같은 바람이어도 오브젝트마다 위상이 달라 제각각 흔들리고, 모델 원점이 바닥이면 밑동에서 휘어짐. 안 흔들릴 오브젝트는 인스펙터의 "바람 제외" 체크. 여러 개 붙이면 첫 번째만 적용. 편집·시뮬·플레이 모두 반영.',
    props: [
      { key: 'strength',   label: '세기 (흔들림 각도)', type: 'number', default: 1,   min: 0,   max: 4, step: 0.1 },
      { key: 'speed',      label: '속도',              type: 'number', default: 1,   min: 0.1, max: 5, step: 0.1 },
      { key: 'direction',  label: '바람 방향 (°)',      type: 'number', default: 0,   min: 0,   max: 360, step: 5 },
      { key: 'turbulence', label: '난기류 (불규칙함)',   type: 'number', default: 0.4, min: 0,   max: 2, step: 0.1 },
    ],
  },
  {
    type: 'buoyancy',
    name: '부력 (수영/물에 뜨기)',
    icon: '🛟',
    description: '물(water) 에 부착. 캐릭터가 물에 들어가면 수면을 따라 떠오르고 웨이브 따라 출렁임. 모드: float=수면에 떠서 부유(가라앉지 않음), swim=Space 상승/앉기 하강으로 자유 수영. ※ 트리거(센서) 켠 Collider 필요.',
    props: [
      { key: 'mode',      label: '모드 (float=떠다님 / swim=자유수영)', type: 'enum', default: 'float', options: ['float', 'swim'] },
      { key: 'swimIdleAnim', label: '수영 애니 — 정지 (애니 에셋 URL, 콜라이더 불필요)', type: 'string', default: '' },
      { key: 'swimMoveAnim', label: '수영 애니 — 이동 (애니 에셋 URL)',           type: 'string', default: '' },
      { key: 'lookSwim',  label: '시선 방향 수영 (서브노티카식, swim 전용)', type: 'boolean', default: true },
      { key: 'swimSpeed', label: '수영 속도 (swim 전용)',              type: 'number', default: 1, min: 0.2, max: 3, step: 0.1 },
      { key: 'drag',      label: '물 저항 (낮을수록 미끄러지듯 관성↑, swim 전용)', type: 'number', default: 4, min: 1, max: 12, step: 0.5 },
      { key: 'strength',  label: '부력 세기 (수면 복원 강도, float 전용)', type: 'number', default: 6, min: 1, max: 15, step: 0.5 },
      { key: 'waveBob',   label: '웨이브 따라 출렁임',                  type: 'boolean', default: true },
      { key: 'offset',    label: '뜨는 높이 보정 (+위 / -아래)',        type: 'number', default: 0, min: -2, max: 2, step: 0.05 },
    ],
  },
  {
    type: 'postProcess',
    name: 'PostProcess 볼륨 (후처리)',
    icon: '🎬',
    description: '언리얼식 후처리 볼륨. 빈 오브젝트에 부착해 화면 효과 조절. zone 켜면 영역 안에서만, 끄면 전역. 여러 전역 볼륨이면 첫 번째만. 편집·시뮬·플레이 모두 반영.',
    props: [
      // ── 간단 ──
      { key: 'enabled',        label: '활성화',                 type: 'boolean', default: true,  group: 'basic' },
      { key: 'zone',           label: '이 오브젝트 영역 안에서만 적용 (크기=영역, 끄면 전역)', type: 'boolean', default: false, group: 'basic' },
      { key: 'preset',         label: '🎬 프리셋 (클릭하면 아래 밝기·대비·채도 등이 그 룩으로 채워짐 — 바로 수정 가능)', type: 'enum', default: 'none', options: ['none', 'cinematic', 'warm', 'cool', 'vivid', 'noir', 'dream'], group: 'basic' },
      { key: 'brightness',     label: '밝기',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02, group: 'basic' },
      { key: 'contrast',       label: '대비',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02, group: 'basic' },
      { key: 'saturation',     label: '채도 (-1=흑백 ~ +1=쨍)', type: 'number', default: 0,    min: -1, max: 1,   step: 0.05, group: 'basic' },
      { key: 'temperature',    label: '색온도 (+웜 / -쿨)',      type: 'number', default: 0,    min: -1, max: 1,   step: 0.05, group: 'basic' },
      { key: 'filmic',         label: '필름 대비 (S커브, 0=끔)', type: 'number', default: 0,    min: 0, max: 1,    step: 0.05, group: 'basic' },
      { key: 'lift',           label: '섀도 리프트 (어두운 영역 띄움)', type: 'number', default: 0, min: -0.2, max: 0.2, step: 0.01, group: 'advanced' },
      { key: 'tintColor',      label: '색상 틴트 (화면 색)',     type: 'color',  default: '#ffffff', group: 'basic' },
      { key: 'tintStrength',   label: '틴트 강도 (0=끔)',        type: 'number', default: 0,    min: 0, max: 1,    step: 0.05, group: 'basic' },
      { key: 'bloom',          label: 'Bloom 발광',             type: 'boolean', default: true, group: 'basic' },
      { key: 'bloomIntensity', label: '발광 세기',              type: 'number', default: 0.6,  min: 0, max: 3,    step: 0.05, group: 'basic' },
      { key: 'vignette',       label: '비네팅 (가장자리 어둠, 0=끔)', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, group: 'basic' },
      // ── 고급 ──
      { key: 'bloomThreshold', label: '발광 임계값',            type: 'number', default: 0.85, min: 0, max: 1,    step: 0.05, group: 'advanced' },
      { key: 'ao',             label: 'SSAO 앰비언트 오클루전 (접지 음영)', type: 'boolean', default: false, group: 'advanced' },
      { key: 'aoIntensity',    label: 'SSAO 강도',              type: 'number', default: 1,    min: 0, max: 4,    step: 0.1, group: 'advanced' },
      { key: 'hue',            label: '색조 (Hue, 라디안 0~6.28)', type: 'number', default: 0, min: 0, max: 6.28, step: 0.05, group: 'advanced' },
      { key: 'sepia',          label: '세피아 톤',              type: 'boolean', default: false, group: 'advanced' },
      { key: 'grayscale',      label: '흑백',                   type: 'boolean', default: false, group: 'advanced' },
      { key: 'chromatic',      label: '색수차 (0=끔)',          type: 'number', default: 0,    min: 0, max: 0.01, step: 0.0005, group: 'advanced' },
      { key: 'wobble',         label: '일렁임 (수중·열기 왜곡, 0=끔)', type: 'number', default: 0, min: 0, max: 0.03, step: 0.002, group: 'advanced' },
      { key: 'grain',          label: '필름 노이즈 (0=끔)',     type: 'number', default: 0,    min: 0, max: 1,    step: 0.02, group: 'advanced' },
      { key: 'scanline',       label: 'CRT 스캔라인 (0=끔)',    type: 'number', default: 0,    min: 0, max: 2,    step: 0.05, group: 'advanced' },
      { key: 'pixelate',       label: '픽셀화 (0=끔, 픽셀 크기)', type: 'number', default: 0,  min: 0, max: 16,   step: 1, group: 'advanced' },
      { key: 'toneMapping',    label: '톤매핑 (필믹 톤)',       type: 'boolean', default: false, group: 'advanced' },
      { key: 'toneMapMode',    label: '톤매핑 곡선 (aces / agx=더 자연스러움 / neutral)', type: 'enum', default: 'aces', options: ['aces', 'agx', 'neutral'], group: 'advanced' },
    ],
  },
  {
    type: 'door',
    name: '문 (E로 열기/닫기)',
    icon: '🚪',
    description: '빈 오브젝트에 붙이면 그 위치에 자동으로 문짝이 생김. 가까이서 E 누르면 swingAngle 만큼 회전(열기/닫기 토글). 오브젝트의 position 이 hinge(경첩) 위치이며 문짝은 +X 방향으로 width 만큼 펼쳐짐. 시각만 V1 — 콜라이더는 자동 OFF (관통 가능). 멀티에선 본인 화면에서만 회전 (V2 동기화 예정).',
    props: [
      { key: 'width',         label: '문 폭 (m)',                       type: 'number',  default: 1,   min: 0.3, max: 5,   step: 0.05 },
      { key: 'height',        label: '문 높이 (m)',                     type: 'number',  default: 2,   min: 0.5, max: 8,   step: 0.05 },
      { key: 'thickness',     label: '문 두께 (m)',                     type: 'number',  default: 0.05, min: 0.01, max: 0.5, step: 0.01 },
      { key: 'color',         label: '문 색',                           type: 'color',   default: '#8b4513' },
      { key: 'swingAngleDeg', label: '회전 각도 (°) — 음수면 반대 방향', type: 'number',  default: 90,  min: -180, max: 180, step: 5 },
      { key: 'swingDuration', label: '회전 시간 (초)',                  type: 'number',  default: 0.4, min: 0.05, max: 5, step: 0.05 },
      { key: 'interactRange', label: '인터랙트 거리 (m)',               type: 'number',  default: 2,   min: 0.3, max: 8,   step: 0.1 },
      { key: 'startOpen',     label: '시작할 때 열린 상태',             type: 'boolean', default: false },
    ],
  },
  {
    type: 'vendingMachine',
    name: '자판기 / 상점',
    icon: '🏪',
    description: '가까이서 E 누르면 상점 모달이 뜸. 코인(출석 보상)으로 아이템 구매 → 인벤토리에 지급. items 한 줄에 한 상품 형식 `이름|아이콘|가격`. 빈 줄·#로 시작하는 줄 무시. 예) `사과|🍎|10`. 빈 오브젝트 또는 자판기 모델에 붙여 사용. 같은 위치 문(door)·대화(dialogue)가 우선.',
    props: [
      { key: 'title', label: '가게 이름 (모달 상단 표시)', type: 'string', default: '🏪 자판기' },
      { key: 'items', label: '상품 (한 줄에 `이름|아이콘|가격`)', type: 'string', default: '사과|🍎|10\n물병|💧|5\n빵|🍞|20' },
      { key: 'interactRange', label: '인터랙트 거리 (m)', type: 'number', default: 2.5, min: 0.3, max: 10, step: 0.1 },
      { key: 'sourceGame', label: '인벤토리 sourceGame 분류', type: 'string', default: 'vending' },
      { key: 'category',   label: '인벤토리 category 분류',   type: 'string', default: 'shop' },
    ],
  },
  {
    type: 'dialogue',
    name: '대화 / NPC 말풍선',
    icon: '💬',
    description: '가까이서 E 누르면 화면 하단에 대화 말풍선이 뜸. 한 번 더 E 누르면 다음 줄, 마지막 줄이면 닫힘. 빈 오브젝트나 NPC 모델에 붙여 사용. 여러 줄은 \\n (Enter) 으로 구분. 같은 위치에 문(door) 컴포넌트가 있으면 문이 우선. 멀티에서 각자 본인 화면만 (V2 sync 예정).',
    props: [
      { key: 'speakerName',  label: '화자 이름 (말풍선 위에 표시, 비우면 없음)', type: 'string',  default: '' },
      { key: 'lines',        label: '대화 줄 (Enter=다음 줄)',                   type: 'string',  default: '안녕하세요!\n반갑습니다.' },
      { key: 'interactRange', label: '인터랙트 거리 (m)',                         type: 'number',  default: 2.5, min: 0.3, max: 10, step: 0.1 },
      { key: 'bubbleColor',  label: '말풍선 배경색',                              type: 'color',   default: '#1f2937' },
      { key: 'textColor',    label: '글자색',                                     type: 'color',   default: '#ffffff' },
      { key: 'autoClose',    label: '마지막 줄 후 자동 닫힘',                     type: 'boolean', default: true },
    ],
  },
  {
    type: 'raceStart',
    name: '레이스 시작 (타임 트라이얼)',
    icon: '🏁',
    description: '플레이어가 이 박스에 진입하면 raceId 의 타이머 시작 + 화면 상단에 시간 표시. 같은 raceId 의 raceFinish 에 닿으면 측정 종료. raceId 가 같은 시작/도착 쌍이 한 경주. 베스트 시간은 브라우저 localStorage 에 저장 (alp_race_best_<raceId>). 멀티: 본인만.',
    props: [
      { key: 'raceId',     label: '경주 ID (같은 ID 의 raceFinish 와 짝)', type: 'string',  default: 'default' },
      { key: 'raceName',   label: '경주 이름 (HUD 표시)',                     type: 'string',  default: '타임 트라이얼' },
      { key: 'restartOnReentry', label: '진행 중 재진입 시 타이머 리셋',     type: 'boolean', default: true },
    ],
  },
  {
    type: 'raceFinish',
    name: '레이스 도착 (피니시 라인)',
    icon: '🏆',
    description: '같은 raceId 의 raceStart 후 이 박스에 진입하면 측정 종료 + 완주 토스트. 베스트 갱신 시 별도 메시지. 시작 안 한 상태로 들어오면 무시.',
    props: [
      { key: 'raceId', label: '경주 ID (raceStart 와 동일)', type: 'string', default: 'default' },
    ],
  },
  {
    type: 'checkpoint',
    name: '체크포인트 (부활 지점)',
    icon: '🚩',
    description: '플레이어가 이 박스(scale) 안에 진입하면 부활 지점으로 등록. 이후 killZone 에 닿거나 추락하면 이 위치에서 다시 시작. 새로 체크포인트 도달 시 토스트 표시. 같은 체크포인트 재진입은 무시. 빈 박스 트리거로 두면 됨. 멀티: 각자 본인 체크포인트만.',
    props: [
      { key: 'label',  label: '이름 (토스트 표시)',          type: 'string',  default: '체크포인트' },
      { key: 'offsetY', label: '부활 시 Y 오프셋 (m, +위)',   type: 'number',  default: 1, min: 0, max: 10, step: 0.1 },
      { key: 'silent', label: '토스트 숨김',                  type: 'boolean', default: false },
    ],
  },
  {
    type: 'killZone',
    name: '킬존 (추락·함정)',
    icon: '☠️',
    description: '플레이어가 이 박스(scale) 안에 진입하면 즉시 마지막 체크포인트로 부활. 체크포인트 없으면 월드 spawn. 추락 지대(맵 아래 큰 박스), 함정, 용암 구역 등에 사용. 빈 트리거 박스. 멀티: 본인만 부활.',
    props: [
      { key: 'mode',     label: '모드 (respawn=부활 / kill=health 0)', type: 'enum',   default: 'respawn', options: ['respawn', 'kill'] },
      { key: 'toast',    label: '토스트 메시지 (비우면 없음)',         type: 'string', default: '💀 부활!' },
    ],
  },
  {
    type: 'jumpPad',
    name: '점프대 / 부스터',
    icon: '⬆️',
    description: '플레이어가 이 오브젝트 박스(scale) 안에 진입하면 즉시 impulse 발동 — 위/앞/임의 방향으로 튕김. cooldown 동안 재발동 무시 (한 번 진입 = 한 번 튕김). 트램펄린·로켓 점프 패드·스피드 부스터 모두 가능. 빈 트리거 박스를 점프대 모델 위에 두면 좋음.',
    props: [
      { key: 'mode',     label: '방향 모드 (up=위 / forward=오브젝트 +Z / custom=직접 지정)', type: 'enum',   default: 'up', options: ['up', 'forward', 'custom'] },
      { key: 'power',    label: '세기 (m/s) — up 모드의 위 속도, forward 모드의 진행 속도',  type: 'number', default: 12, min: 0.5, max: 60, step: 0.5 },
      { key: 'customX',  label: 'custom 모드: X 속도',                                       type: 'number', default: 0,  min: -50, max: 50, step: 0.5 },
      { key: 'customY',  label: 'custom 모드: Y 속도 (위)',                                  type: 'number', default: 12, min: -50, max: 50, step: 0.5 },
      { key: 'customZ',  label: 'custom 모드: Z 속도',                                       type: 'number', default: 0,  min: -50, max: 50, step: 0.5 },
      { key: 'preserveHorizontal', label: 'up 모드에서 수평 속도 보존 (false=수평 0 으로 리셋)', type: 'boolean', default: true },
      { key: 'cooldown', label: '재발동 쿨다운 (초)',                                        type: 'number', default: 0.5, min: 0.05, max: 10, step: 0.05 },
    ],
  },
  {
    type: 'ladder',
    name: '사다리 / 오르기',
    icon: '🪜',
    description: '플레이어가 이 오브젝트 박스(scale) 안에 들어오면 중력이 꺼지고 오를 수 있음. W/↑ 위로, S/↓ 아래로, Space 점프 이탈. 좌우로 박스 밖 나가면 자동 해제. 사다리 모델 옆에 빈 트리거 박스로 두기 좋음.',
    props: [
      { key: 'climbSpeed', label: '오르기 속도 (m/s)',           type: 'number', default: 2.5, min: 0.3, max: 10, step: 0.1 },
      { key: 'jumpExitV',  label: 'Space 점프 이탈 시 위 속도',  type: 'number', default: 4,   min: 0,   max: 15, step: 0.5 },
    ],
  },
  {
    type: 'teleporter',
    name: '텔레포터 (월드 내 이동)',
    icon: '🌀',
    description: '플레이어가 이 오브젝트 박스(scale) 안에 들어오면 같은 월드의 destX/Y/Z 로 즉시 이동. 무한 루프 방지를 위해 cooldown 동안 재진입 무시. 다른 월드로 가는 portal 과는 별개. 입구·출구 두 쌍을 두면 양방향. 빈 오브젝트에 붙여 사용.',
    props: [
      { key: 'destX',     label: '도착 X',                              type: 'number',  default: 0 },
      { key: 'destY',     label: '도착 Y',                              type: 'number',  default: 1 },
      { key: 'destZ',     label: '도착 Z',                              type: 'number',  default: 0 },
      { key: 'setRotY',   label: '도착 방향(rad) 도 설정 (Yaw)',         type: 'boolean', default: false },
      { key: 'destRotY',  label: '└ 도착 시 캐릭터 회전 Y (rad)',        type: 'number',  default: 0, min: -6.28, max: 6.28, step: 0.05 },
      { key: 'cooldown',  label: '재진입 쿨다운 (초) — 무한 루프 방지',  type: 'number',  default: 2,  min: 0.1, max: 30, step: 0.1 },
    ],
  },
  {
    type: 'seat',
    name: '의자 / 앉기',
    icon: '🪑',
    description: '가까이서 F 누르면 캐릭터가 이 오브젝트에 앉음. 다시 F 누르면 일어남. 앉아 있는 동안 카메라/시야는 자유롭게 둘러볼 수 있고, 이동/점프는 잠김. 빈 오브젝트나 의자 모델에 붙여 사용. offsetY 로 앉는 높이(엉덩이 위치) 조절.',
    props: [
      { key: 'interactRange', label: '인터랙트 거리 (m)',                type: 'number', default: 1.5, min: 0.3, max: 8,  step: 0.1 },
      { key: 'offsetY',       label: '앉는 높이 보정 (m) — 의자 표면 위', type: 'number', default: 0.4, min: -2,  max: 3,  step: 0.05 },
      { key: 'offsetX',       label: 'X 오프셋 (옆 보정)',                type: 'number', default: 0,   min: -2,  max: 2,  step: 0.05 },
      { key: 'offsetZ',       label: 'Z 오프셋 (앞뒤 보정)',              type: 'number', default: 0,   min: -2,  max: 2,  step: 0.05 },
      { key: 'exitForward',   label: '일어날 때 앞으로 빠지는 거리 (m)',  type: 'number', default: 0.8, min: 0,   max: 5,  step: 0.1 },
    ],
  },
  {
    type: 'sign',
    name: '표지판 / 텍스트',
    icon: '🪧',
    description: '월드 공간에 텍스트 띄움. 안내문·이름표·환영 메시지·길 안내용. 줄바꿈은 Enter. billboard=항상 카메라 향함. viewDistance 밖에선 자동 숨김(성능). 배경 박스는 bgOpacity 0 보다 크게 두면 표시.',
    props: [
      { key: 'text',         label: '내용 (Enter=줄바꿈)',           type: 'string',  default: '안녕하세요!' },
      { key: 'color',        label: '글자색',                          type: 'color',   default: '#ffffff' },
      { key: 'fontSize',     label: '글자 크기 (m)',                   type: 'number',  default: 0.4, min: 0.05, max: 5, step: 0.05 },
      { key: 'maxWidth',     label: '최대 폭 (m) — 자동 줄바꿈',       type: 'number',  default: 6,   min: 0.5,  max: 50, step: 0.5 },
      { key: 'bgColor',      label: '배경 박스 색',                    type: 'color',   default: '#000000' },
      { key: 'bgOpacity',    label: '배경 투명도 (0=박스 없음)',       type: 'number',  default: 0.5, min: 0,    max: 1, step: 0.05 },
      { key: 'outlineWidth', label: '외곽선 두께 (가독성)',            type: 'number',  default: 0.02, min: 0,   max: 0.2, step: 0.01 },
      { key: 'outlineColor', label: '외곽선 색',                       type: 'color',   default: '#000000' },
      { key: 'billboard',    label: '항상 카메라 향함 (billboard)',     type: 'boolean', default: true },
      { key: 'viewDistance', label: '보이는 거리 (m, 밖이면 숨김)',     type: 'number',  default: 30,  min: 1,    max: 200, step: 1 },
    ],
  },
  {
    type: 'dayNight',
    name: '낮/밤 사이클',
    icon: '🌅',
    description: '월드 시간을 자동 진행 — 해/달이 뜨고 지며 빛·하늘색이 시간대에 따라 변함. 한 주기(=24시간) 가 cycleMinutes 분에 걸쳐 진행. 빈 오브젝트에 붙여 월드 단위로 1개만 두면 됨. 메인 광원이 강하면 효과가 약해질 수 있어 직접 끄거나 강도 낮춰 두는 것을 권장. 멀티에서 각 클라가 자체 시계로 진행 (가벼운 차이는 시각상 무시).',
    props: [
      { key: 'enabled',        label: '사용',                                    type: 'boolean', default: true },
      { key: 'cycleMinutes',   label: '주기 (분) — 24시간 한 바퀴 도는 실시간',  type: 'number', default: 10, min: 0.5, max: 120, step: 0.5 },
      { key: 'startTime',      label: '시작 시각 (0=자정 ~ 24)',                 type: 'number', default: 8,  min: 0,   max: 24,  step: 0.5 },
      { key: 'sunIntensity',   label: '해 세기 (정오)',                          type: 'number', default: 1.5, min: 0, max: 5,    step: 0.1 },
      { key: 'moonIntensity',  label: '달 세기 (자정)',                          type: 'number', default: 0.3, min: 0, max: 3,    step: 0.05 },
      { key: 'changeSky',      label: '하늘색도 같이 바꾸기',                    type: 'boolean', default: true },
    ],
  },
  {
    type: 'ambientSound',
    name: '앰비언트 사운드 / BGM',
    icon: '🎵',
    description: 'mp3/ogg 음원을 월드에 깔기. 방식=global 이면 어디서나 들림 (BGM), zone 이면 이 오브젝트 박스(scale) 안에서만 들림 (영역 음향). 빈 오브젝트에 붙여 BGM 트리거로 쓰기 좋음. 영역 진입/이탈 시 부드럽게 페이드. 멀티에서 각 클라이언트가 자체 재생.',
    props: [
      { key: 'url',     label: '음원 URL (mp3/ogg) — 에셋 드래그 가능', type: 'string', default: '' },
      { key: 'mode',    label: '방식 (global=BGM 어디서나 / zone=영역 안에서만)', type: 'enum', default: 'zone', options: ['global', 'zone'] },
      { key: 'volume',  label: '음량 (0=무음 ~ 1=최대)',  type: 'number', default: 0.6, min: 0, max: 1,   step: 0.05 },
      { key: 'loop',    label: '반복 재생',                type: 'boolean', default: true },
      { key: 'fadeSec', label: '페이드 시간 (초) — 영역 진입/이탈 시', type: 'number', default: 1.5, min: 0, max: 10, step: 0.1 },
    ],
  },
  {
    type: 'particle',
    name: '파티클 (분위기·이펙트)',
    icon: '✨',
    description: '오브젝트 위치에서 파티클 방출. 프리셋: snow/smoke/fire/rain/sparkles + **firefly(반딧불 — 떠다니며 깜빡임)** / **leaves(꽃잎·낙엽 — 좌우로 천천히 떨어짐)** / **mist(안개층 — 큰 입자 거의 정지, height 작게 두면 바닥 깔림)**. 방식=continuous(계속) / click(1인칭 클릭 시 터짐). 빈 오브젝트에 붙여 분위기 emitter 로 쓰기 좋음. 편집·시뮬·플레이 모두 반영.',
    props: [
      { key: 'mode',    label: '방식 (continuous=계속 / click=클릭시 터짐)', type: 'enum', default: 'continuous', options: ['continuous', 'click'] },
      { key: 'preset',  label: '프리셋 (firefly=반딧불 / leaves=꽃잎·낙엽 / mist=안개층)', type: 'enum', default: 'snow', options: ['snow', 'smoke', 'fire', 'rain', 'sparkles', 'firefly', 'leaves', 'mist'] },
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
      { key: 'initialVolume',    label: '시작 음량 (0=무음 ~ 1=최대)', type: 'number', default: 1, min: 0, max: 1, step: 0.05 },
      { key: 'globalAudio',      label: '월드 전역 음향 (체크 해제 시 거리에 따라 감쇠)',    type: 'boolean', default: false },
    ],
  },
  {
    type: 'animator',
    name: 'Animator (애니메이션 재생)',
    icon: '🎞️',
    description: '모델(GLB/FBX/VRM) 에 내장된 애니메이션 클립을 재생. 클립 이름을 비우면 첫 번째 클립 자동 재생. 인스펙터에서 모델에 들어있는 클립 목록을 드롭다운으로 고를 수 있음.',
    props: [
      { key: 'clip',     label: '클립 이름 (비우면 첫 번째)', type: 'string',  default: '' },
      { key: 'autoplay', label: '자동 재생 (입장/시뮬 시작 시)', type: 'boolean', default: true },
      { key: 'loop',     label: '반복 재생',                  type: 'boolean', default: true },
      { key: 'speed',    label: '재생 속도',                  type: 'number',  default: 1, min: 0, max: 4, step: 0.1 },
    ],
  },
  {
    type: 'timeline',
    name: 'Timeline (키프레임 애니메이션)',
    icon: '🎬',
    description: '이 오브젝트와 자식 오브젝트들을 키프레임 타임라인으로 직접 애니메이션 (유니티 Animator 식). 컴포넌트를 붙인 뒤 우하단 🎬 타임라인 패널에서 자신·자식 트랙에 키를 찍으세요. 시뮬/플레이/월드에서 자동 재생. (모델 내장 애니가 아니라 스튜디오에서 만드는 이동·회전 애니)',
    props: [
      { key: 'duration', label: '길이(초)',                 type: 'number',  default: 3, min: 0.1, max: 600, step: 0.1 },
      { key: 'loop',     label: '반복 재생',                type: 'boolean', default: true },
      { key: 'autoplay', label: '자동 재생 (시뮬/입장 시)', type: 'boolean', default: true },
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

/** 부력 볼륨 — 플레이어 물리(수영/뜨기)가 매 프레임 참조하는 물 영역.
 *  웨이브 표면 높이는 WaterMesh 정점 변위와 동일 공식으로 캐릭터 위치에서 계산. */
export interface BuoyancyVolume {
  cx: number; cy: number; cz: number;   // 중심 (cy = 수면 base Y)
  hx: number; hz: number;               // 반-범위 x,z (= scale/2)
  scaleY: number;                       // 그룹 Y 스케일 (웨이브 변위 → world Y 매핑)
  mode: 'float' | 'swim';
  swimIdle: string;                     // 물 안 정지 시 재생할 애니 URL ('' = 없음). 콜라이더/트리거 불필요.
  swimMove: string;                     // 물 안 이동 시 재생할 애니 URL ('' = 없음)
  lookSwim: boolean;                    // swim: true=시선방향 3D(서브노티카) / false=수평+상하키
  swimSpeed: number;                    // swim 속도 배수
  drag: number;                         // swim 물저항(관성) 계수 — 낮을수록 미끄러짐
  strength: number;                     // 수면 복원(스프링) 세기
  offset: number;                       // 뜨는 높이 보정
  waveStrength: number;                 // 웨이브 강도 (0=출렁 없음). WaterMesh 와 동일 a=0.04*strength
  waveSpeed: number;
  waveFreq: number;
}

/** door 컴포넌트 → hinge 위치 + 문짝 크기 + 회전 옵션. DoorController 가 자체 mesh 렌더 + E 토글. */
export interface DoorSpot {
  id: string;
  hx: number; hy: number; hz: number;  // hinge world position (오브젝트 position)
  rotY: number;                          // hinge 그룹 외부 회전 (오브젝트의 Y rotation)
  width: number;
  height: number;
  thickness: number;
  color: string;
  swingAngleRad: number;
  swingDuration: number;
  range: number;
  startOpen: boolean;
}

export function computeDoors(
  objects: Array<{ id?: string; position?: number[]; rotation?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): DoorSpot[] {
  const out: DoorSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'door');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const rot = o.rotation || [0, 0, 0];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      hx: Number(pos[0]) || 0, hy: Number(pos[1]) || 0, hz: Number(pos[2]) || 0,
      rotY: Number(rot[1]) || 0,
      width:     Math.max(0.1, Number(p.width     ?? 1)),
      height:    Math.max(0.1, Number(p.height    ?? 2)),
      thickness: Math.max(0.005, Number(p.thickness ?? 0.05)),
      color:     String(p.color ?? '#8b4513'),
      swingAngleRad: (Number(p.swingAngleDeg ?? 90)) * Math.PI / 180,
      swingDuration: Math.max(0.05, Number(p.swingDuration ?? 0.4)),
      range:     Math.max(0.1, Number(p.interactRange ?? 2)),
      startOpen: !!p.startOpen,
    });
  }
  return out;
}

/** raceStart / raceFinish 트리거 박스. RaceController 가 매 frame 진입 체크 + timer 관리. */
export interface RaceStartSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  raceId: string;
  raceName: string;
  restartOnReentry: boolean;
}

export interface RaceFinishSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  raceId: string;
}

export function computeRaceStarts(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): RaceStartSpot[] {
  const out: RaceStartSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'raceStart');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale    || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      raceId:   String(p.raceId   ?? 'default').trim() || 'default',
      raceName: String(p.raceName ?? '타임 트라이얼'),
      restartOnReentry: p.restartOnReentry !== false,
    });
  }
  return out;
}

export function computeRaceFinishes(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): RaceFinishSpot[] {
  const out: RaceFinishSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'raceFinish');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale    || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      raceId: String(p.raceId ?? 'default').trim() || 'default',
    });
  }
  return out;
}

/** checkpoint 컴포넌트 → 트리거 박스 + 부활 메타. CheckpointController 가 매 frame 진입 시 마지막 체크포인트 갱신. */
export interface CheckpointSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  rotY: number;
  label: string;
  offsetY: number;
  silent: boolean;
}

export function computeCheckpoints(
  objects: Array<{ id?: string; position?: number[]; rotation?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): CheckpointSpot[] {
  const out: CheckpointSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'checkpoint');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const rot = o.rotation || [0, 0, 0];
    const scl = o.scale    || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      rotY: Number(rot[1]) || 0,
      label:   String(p.label   ?? '체크포인트'),
      offsetY: Math.max(0, Number(p.offsetY ?? 1)),
      silent:  !!p.silent,
    });
  }
  return out;
}

/** killZone 컴포넌트 → 트리거 박스 + 부활 모드. CheckpointController 가 진입 시 마지막 체크포인트로 텔레포트. */
export interface KillZoneSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  mode: 'respawn' | 'kill';
  toast: string;
}

export function computeKillZones(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): KillZoneSpot[] {
  const out: KillZoneSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'killZone');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale    || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      mode: p.mode === 'kill' ? 'kill' : 'respawn',
      toast: String(p.toast ?? '💀 부활!'),
    });
  }
  return out;
}

/** jumpPad 컴포넌트 → 트리거 박스 + impulse 설정. JumpPadController 가 매 frame 진입 → setVelocity. */
export interface JumpPadSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  rotY: number;                                      // forward 모드 방향 (오브젝트 Y 회전)
  mode: 'up' | 'forward' | 'custom';
  power: number;
  customX: number; customY: number; customZ: number;
  preserveHorizontal: boolean;
  cooldown: number;
}

export function computeJumpPads(
  objects: Array<{ id?: string; position?: number[]; rotation?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): JumpPadSpot[] {
  const out: JumpPadSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'jumpPad');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const rot = o.rotation || [0, 0, 0];
    const scl = o.scale    || [1, 1, 1];
    const m = p.mode === 'forward' ? 'forward' : p.mode === 'custom' ? 'custom' : 'up';
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      rotY: Number(rot[1]) || 0,
      mode: m,
      power: Math.max(0, Number(p.power ?? 12)),
      customX: Number(p.customX ?? 0),
      customY: Number(p.customY ?? 12),
      customZ: Number(p.customZ ?? 0),
      preserveHorizontal: p.preserveHorizontal !== false,
      cooldown: Math.max(0.05, Number(p.cooldown ?? 0.5)),
    });
  }
  return out;
}

/** vendingMachine 컴포넌트 → 위치 + 상품 목록. VendingController 가 매 frame 거리 체크 + E 모달. */
export interface VendingItem {
  name: string;
  icon: string;
  price: number;
}
export interface VendingSpot {
  id: string;
  cx: number; cy: number; cz: number;
  range: number;
  title: string;
  items: VendingItem[];
  sourceGame: string;
  category: string;
}

export function computeVendings(
  objects: Array<{ id?: string; position?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): VendingSpot[] {
  const out: VendingSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'vendingMachine');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const raw = String(p.items ?? '').replace(/\\n/g, '\n');
    const items: VendingItem[] = [];
    for (const lineRaw of raw.split('\n')) {
      const line = lineRaw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('|').map(s => s.trim());
      const name = parts[0] || '';
      if (!name) continue;
      const icon = parts[1] || '';
      const price = Math.max(0, Math.floor(Number(parts[2]) || 0));
      items.push({ name, icon, price });
    }
    if (items.length === 0) continue;
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      range: Math.max(0.1, Number(p.interactRange ?? 2.5)),
      title: String(p.title ?? '🏪 자판기'),
      items,
      sourceGame: String(p.sourceGame ?? 'vending').trim() || 'vending',
      category:   String(p.category   ?? 'shop').trim()    || 'shop',
    });
  }
  return out;
}

/** dialogue 컴포넌트 → 위치 + 대사 줄. DialogueController 가 매 frame 거리 체크 + E 진행. */
export interface DialogueSpot {
  id: string;
  cx: number; cy: number; cz: number;
  range: number;
  lines: string[];          // 빈 줄 제거 후 split('\n')
  speakerName: string;
  bubbleColor: string;
  textColor: string;
  autoClose: boolean;
}

export function computeDialogues(
  objects: Array<{ id?: string; position?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): DialogueSpot[] {
  const out: DialogueSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'dialogue');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const raw = String(p.lines ?? '').replace(/\\n/g, '\n');
    const lines = raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (lines.length === 0) continue;
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      range: Math.max(0.1, Number(p.interactRange ?? 2.5)),
      lines,
      speakerName: String(p.speakerName ?? '').trim(),
      bubbleColor: String(p.bubbleColor ?? '#1f2937'),
      textColor:   String(p.textColor ?? '#ffffff'),
      autoClose:   p.autoClose !== false,
    });
  }
  return out;
}

/** ladder 컴포넌트 → 트리거 박스 + 오르기 속도. LadderController 가 매 frame 진입/이탈 처리. */
export interface LadderSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  climbSpeed: number;
  jumpExitV: number;
}

export function computeLadders(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): LadderSpot[] {
  const out: LadderSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'ladder');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      climbSpeed: Math.max(0.1, Number(p.climbSpeed ?? 2.5)),
      jumpExitV:  Math.max(0,   Number(p.jumpExitV  ?? 4)),
    });
  }
  return out;
}

/** teleporter 컴포넌트 → 트리거 박스 + 도착지. TeleporterController 가 매 frame 진입 판정. */
export interface TeleporterSpot {
  id: string;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
  dx: number; dy: number; dz: number;
  setRotY: boolean;
  drotY: number;
  cooldown: number;
}

export function computeTeleporters(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): TeleporterSpot[] {
  const out: TeleporterSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'teleporter');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      dx: Number(p.destX ?? 0),
      dy: Number(p.destY ?? 1),
      dz: Number(p.destZ ?? 0),
      setRotY: !!p.setRotY,
      drotY: Number(p.destRotY ?? 0),
      cooldown: Math.max(0.05, Number(p.cooldown ?? 2)),
    });
  }
  return out;
}

/** seat 컴포넌트가 붙은 오브젝트 → SeatSpot 목록. SeatController 가 매 frame 거리 체크 + 앉기 처리. */
export interface SeatSpot {
  id: string;
  sx: number; sy: number; sz: number;       // 앉을 위치 (오프셋 적용)
  rotY: number;                              // 오브젝트의 Y 회전 — 일어날 방향에 사용
  range: number;
  exitForward: number;
}

export function computeSeats(
  objects: Array<{ id?: string; position?: number[]; rotation?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): SeatSpot[] {
  const out: SeatSpot[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'seat');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const pos = o.position || [0, 0, 0];
    const rot = o.rotation || [0, 0, 0];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      sx: Number(pos[0]) + Number(p.offsetX ?? 0),
      sy: Number(pos[1]) + Number(p.offsetY ?? 0.4),
      sz: Number(pos[2]) + Number(p.offsetZ ?? 0),
      rotY: Number(rot[1]) || 0,
      range: Math.max(0.1, Number(p.interactRange ?? 1.5)),
      exitForward: Math.max(0, Number(p.exitForward ?? 0.8)),
    });
  }
  return out;
}

/** 월드의 첫 dayNight 컴포넌트 인스턴스 반환 (없으면 null). 월드 단위 유일 설정. */
export function findDayNightComponent(
  objects: Array<{ components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): ComponentInstance | null {
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'dayNight');
    if (c) return c;
  }
  return null;
}

/** 앰비언트 사운드 zone — 매 frame 카메라/플레이어 위치로 in/out 판정 후 볼륨 lerp. */
export interface AmbientSoundZone {
  id: string;
  url: string;
  mode: 'global' | 'zone';
  volume: number;
  loop: boolean;
  fadeSec: number;
  cx: number; cy: number; cz: number;
  hx: number; hy: number; hz: number;
}

/** ambientSound 컴포넌트가 있는 오브젝트들에서 zone 목록 계산. */
export function computeAmbientSoundZones(
  objects: Array<{ id?: string; position?: number[]; scale?: number[]; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): AmbientSoundZone[] {
  const out: AmbientSoundZone[] = [];
  for (const o of objects || []) {
    if (o.hidden) continue;
    const c = (o.components || []).find(x => x.type === 'ambientSound');
    if (!c) continue;
    const p = (c.props || {}) as Record<string, unknown>;
    const url = String(p.url ?? '').trim();
    if (!url) continue;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    out.push({
      id: String(o.id ?? Math.random().toString(36).slice(2)),
      url,
      mode: p.mode === 'global' ? 'global' : 'zone',
      volume: clamp01(Number(p.volume ?? 0.6)),
      loop:   p.loop !== false,
      fadeSec: Math.max(0, Number(p.fadeSec ?? 1.5)),
      cx: Number(pos[0]) || 0, cy: Number(pos[1]) || 0, cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hy: Math.abs(Number(scl[1]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
    });
  }
  return out;
}
function clamp01(v: number) { return Math.max(0, Math.min(1, isFinite(v) ? v : 0)); }

/** water + buoyancy 컴포넌트가 있는 오브젝트들에서 부력 볼륨 목록 계산. */
export function computeBuoyancyVolumes(
  objects: Array<{ kind?: string; position?: number[]; scale?: number[]; color?: string; components?: ComponentInstance[]; hidden?: boolean }> | undefined | null,
): BuoyancyVolume[] {
  const out: BuoyancyVolume[] = [];
  for (const o of objects || []) {
    if (o.kind !== 'water' || o.hidden) continue;
    const b = (o.components || []).find(c => c.type === 'buoyancy');
    if (!b) continue;
    const pos = o.position || [0, 0, 0];
    const scl = o.scale || [1, 1, 1];
    const p = (b.props || {}) as Record<string, unknown>;
    const w = (o.components || []).find(c => c.type === 'wave');
    const wp = (w?.props || {}) as Record<string, unknown>;
    out.push({
      cx: Number(pos[0]) || 0,
      cy: Number(pos[1]) || 0,
      cz: Number(pos[2]) || 0,
      hx: Math.abs(Number(scl[0]) || 1) / 2,
      hz: Math.abs(Number(scl[2]) || 1) / 2,
      scaleY: Math.abs(Number(scl[1]) || 1),
      mode: p.mode === 'swim' ? 'swim' : 'float',
      swimIdle: String(p.swimIdleAnim ?? ''),
      swimMove: String(p.swimMoveAnim ?? ''),
      lookSwim: p.lookSwim !== false,
      swimSpeed: Number(p.swimSpeed ?? 1),
      drag: Number(p.drag ?? 4),
      strength: Number(p.strength ?? 6),
      offset: Number(p.offset ?? 0),
      waveStrength: p.waveBob === false || !w ? 0 : Number(wp.strength ?? 1),
      waveSpeed: w ? Number(wp.speed ?? 1) : 1,
      waveFreq: w ? Number(wp.frequency ?? 1) : 1,
    });
  }
  return out;
}
