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

export type ComponentType = 'grab' | 'physics' | 'worldPhysics' | 'collider' | 'postProcess' | 'particle' | 'videoRemote' | 'health' | 'damage' | 'flashlight' | 'npc' | 'pickup' | 'wave' | 'buoyancy' | 'animator' | 'cutter' | 'timeline' | 'ambientSound' | 'dayNight' | 'sign';

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
      { key: 'brightness',     label: '밝기',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02, group: 'basic' },
      { key: 'contrast',       label: '대비',                   type: 'number', default: 0,    min: -0.5, max: 0.5, step: 0.02, group: 'basic' },
      { key: 'saturation',     label: '채도 (-1=흑백 ~ +1=쨍)', type: 'number', default: 0,    min: -1, max: 1,   step: 0.05, group: 'basic' },
      { key: 'tintColor',      label: '색상 틴트 (화면 색)',     type: 'color',  default: '#ffffff', group: 'basic' },
      { key: 'tintStrength',   label: '틴트 강도 (0=끔)',        type: 'number', default: 0,    min: 0, max: 1,    step: 0.05, group: 'basic' },
      { key: 'bloom',          label: 'Bloom 발광',             type: 'boolean', default: true, group: 'basic' },
      { key: 'bloomIntensity', label: '발광 세기',              type: 'number', default: 0.6,  min: 0, max: 3,    step: 0.05, group: 'basic' },
      { key: 'vignette',       label: '비네팅 (가장자리 어둠, 0=끔)', type: 'number', default: 0.3, min: 0, max: 1, step: 0.05, group: 'basic' },
      // ── 고급 ──
      { key: 'bloomThreshold', label: '발광 임계값',            type: 'number', default: 0.85, min: 0, max: 1,    step: 0.05, group: 'advanced' },
      { key: 'hue',            label: '색조 (Hue, 라디안 0~6.28)', type: 'number', default: 0, min: 0, max: 6.28, step: 0.05, group: 'advanced' },
      { key: 'sepia',          label: '세피아 톤',              type: 'boolean', default: false, group: 'advanced' },
      { key: 'grayscale',      label: '흑백',                   type: 'boolean', default: false, group: 'advanced' },
      { key: 'chromatic',      label: '색수차 (0=끔)',          type: 'number', default: 0,    min: 0, max: 0.01, step: 0.0005, group: 'advanced' },
      { key: 'wobble',         label: '일렁임 (수중·열기 왜곡, 0=끔)', type: 'number', default: 0, min: 0, max: 0.03, step: 0.002, group: 'advanced' },
      { key: 'grain',          label: '필름 노이즈 (0=끔)',     type: 'number', default: 0,    min: 0, max: 1,    step: 0.02, group: 'advanced' },
      { key: 'scanline',       label: 'CRT 스캔라인 (0=끔)',    type: 'number', default: 0,    min: 0, max: 2,    step: 0.05, group: 'advanced' },
      { key: 'pixelate',       label: '픽셀화 (0=끔, 픽셀 크기)', type: 'number', default: 0,  min: 0, max: 16,   step: 1, group: 'advanced' },
      { key: 'toneMapping',    label: 'ACES 톤매핑',            type: 'boolean', default: false, group: 'advanced' },
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
