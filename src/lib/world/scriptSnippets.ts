/**
 * 스크립트 예제 스니펫 — 캐주얼 유저가 원클릭으로 삽입해 게임을 만들 수 있게.
 * ScriptComponentsModal 의 "📚 예제" 패널에서 사용.
 *
 * ⚠️ ALP 미니 인터프리터(jsRuntime)가 지원하는 문법만 사용:
 *   - var/let/const, function, if/for/while, 산술·비교·논리, 객체/배열 리터럴 + 인덱스
 *   - Math.*, 문자열 + 연결
 *   - 회피: 템플릿 리터럴(`), .toFixed/.toString(radix)/.padStart 같은 프로토타입 메서드, 화살표 함수
 */
export interface ScriptSnippet {
  id: string;
  category: string;
  title: string;
  desc: string;
  code: string;
}

export const SCRIPT_SNIPPETS: ScriptSnippet[] = [
  // ── 움직임 ──
  {
    id: 'spin', category: '움직임', title: '회전', desc: '매 프레임 Y축으로 빙글빙글',
    code: `function onUpdate(dt) {
  var r = self.getRotation();
  self.setRotation(r.x, r.y + dt * 2, r.z);
}`,
  },
  {
    id: 'bob', category: '움직임', title: '위아래 둥둥', desc: '사인파로 부유',
    code: `var _t = 0;
function onUpdate(dt) {
  _t += dt;
  var p = self.getPosition();
  self.setPosition(p.x, p.y + Math.sin(_t * 2) * 0.03, p.z);
}`,
  },
  {
    id: 'patrol', category: '움직임', title: '좌우 왕복', desc: '시작 위치 기준 ±3 왕복',
    code: `var _t = 0;
var _x0 = null;
function onUpdate(dt) {
  _t += dt;
  var p = self.getPosition();
  if (_x0 === null) _x0 = p.x;
  self.setPosition(_x0 + Math.sin(_t) * 3, p.y, p.z);
}`,
  },

  // ── 수집·점수 ──
  {
    id: 'coin', category: '수집·점수', title: '코인 (점수 +1)', desc: '닿으면 점수 올리고 사라짐. collider 컴포넌트 trigger 체크 필요',
    code: `function onStart() {
  ui.text("score", "🪙 " + game.get("score", 0), { y: 0.06, size: 34 });
}
function onTriggerEnter(other) {
  if (!world.isPlayer(other)) return;
  var n = game.add("score", 1);
  ui.text("score", "🪙 " + n, { y: 0.06, size: 34 });
  world.playSound("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg", { volume: 0.5 });
  self.setVisible(false);
}`,
  },
  {
    id: 'goal', category: '수집·점수', title: '골인 (승리)', desc: '닿으면 승리 메시지. collider trigger 필요',
    code: `function onTriggerEnter(other) {
  if (!world.isPlayer(other)) return;
  ui.text("win", "🎉 클리어!", { x: 0.5, y: 0.5, size: 56, bg: "#000a" });
  world.playSound("https://actions.google.com/sounds/v1/cartoon/concussive_hit_guitar_boing.ogg");
}`,
  },

  // ── 위험·리스폰 ──
  {
    id: 'killzone', category: '위험·리스폰', title: '낙사 존', desc: '닿으면 리스폰. 바닥 아래 큰 평면 + collider trigger',
    code: `function onTriggerEnter(other) {
  if (world.isPlayer(other)) world.respawnPlayer(other);
}`,
  },
  {
    id: 'checkpoint', category: '위험·리스폰', title: '체크포인트', desc: '밟으면 리스폰 지점 갱신. collider trigger 필요',
    code: `function onTriggerEnter(other) {
  if (!world.isPlayer(other)) return;
  var p = self.getPosition();
  world.setSpawnFor(other, p.x, p.y + 1, p.z);
  world.playSound("https://actions.google.com/sounds/v1/cartoon/pop.ogg");
}`,
  },
  {
    id: 'teleporter', category: '위험·리스폰', title: '텔레포터', desc: '닿으면 목적지로. world.teleport 좌표를 바꿔 사용',
    code: `function onTriggerEnter(other) {
  if (world.isPlayer(other)) world.teleportPlayer(other, 0, 5, 20);
}`,
  },

  // ── UI·HUD ──
  {
    id: 'timer', category: 'UI·HUD', title: '타이머', desc: '경과 시간(초)을 화면 위에',
    code: `function onUpdate(dt) {
  var t = game.add("time", dt);
  ui.text("timer", "⏱ " + Math.floor(t) + "s", { x: 0.5, y: 0.06, size: 24 });
}`,
  },
  {
    id: 'healthbar', category: 'UI·HUD', title: '체력바', desc: '하단 체력바. game.set("hp", n) 으로 조절',
    code: `function onStart() {
  game.set("hp", 100);
}
function onUpdate(dt) {
  ui.bar("hp", game.get("hp", 100), 100, { y: 0.94, color: "#e44" });
}`,
  },

  // ── 상호작용 ──
  {
    id: 'clickcolor', category: '상호작용', title: '클릭하면 색 변경', desc: '1인칭으로 클릭 시 색이 바뀜',
    code: `var _cols = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7"];
var _i = 0;
function onClick(by) {
  _i = (_i + 1) % 5;
  self.setColor(_cols[_i]);
  world.playSound("https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg");
}`,
  },
  {
    id: 'bouncer', category: '상호작용', title: '점프대', desc: '닿으면 위로 튕김. collider trigger 필요',
    code: `function onTriggerEnter(other) {
  if (world.isPlayer(other)) world.playSound("https://actions.google.com/sounds/v1/cartoon/boing.ogg");
}`,
  },

  {
    id: 'speedpad', category: '상호작용', title: '스피드 패드', desc: '밟으면 이동 2배·점프 강화. 나가면 원복. collider trigger 필요',
    code: `function onTriggerEnter(other) {
  if (!world.isPlayer(other)) return;
  world.setSpeed(2);
  world.setJump(11);
  world.playSound("https://actions.google.com/sounds/v1/cartoon/woosh.ogg");
}
function onTriggerExit(other) {
  if (world.isPlayer(other)) { world.setSpeed(1); world.setJump(7); }
}`,
  },

  // ── UI·HUD ──
  {
    id: 'logo', category: 'UI·HUD', title: '화면 이미지', desc: '로고·아이콘·승패 그래픽을 화면에 (url 바꿔 사용)',
    code: `function onStart() {
  ui.image("logo", "https://airliveplay.com/icon.png", { x: 0.5, y: 0.18, w: 96, h: 96 });
}`,
  },

  // ── 생성 ──
  {
    id: 'spawner', category: '생성', title: '아이템 스포너', desc: '2초마다 큐브 떨어뜨림 (호스트만 — 멀티 중복 방지)',
    code: `var _t = 0;
function onUpdate(dt) {
  if (!world.isHost()) return;
  _t += dt;
  if (_t > 2) {
    _t = 0;
    world.spawn({ kind: "cube", position: [0, 8, 0], color: "#fbbf24", physics: "dynamic" });
  }
}`,
  },

  // ── API ──
  {
    id: 'api-weather', category: 'API', title: '외부 API 호출 (날씨)',
    desc: 'api.startFetch → onUpdate 안 polling. HTTPS·credentials:omit·분당 30회 제한.',
    code: `// 시작 시 API 요청 → 매 프레임 결과 체크
var weatherText = null;

function onStart() {
  api.startFetch("https://wttr.in/Seoul?format=3", "weather");
}

function onUpdate(dt) {
  if (weatherText) return;
  var r = api.getResult("weather");
  if (!r) return;
  if (r.ok) {
    weatherText = String(r.data);
    print("날씨:", weatherText);
  } else {
    print("API 실패:", r.error);
    weatherText = "fail";
  }
}

function onClick(clickerId) {
  api.clearResult("weather");
  weatherText = null;
  api.startFetch("https://wttr.in/Seoul?format=3", "weather");
}`,
  },
];

/** 카테고리 순서 (UI 그룹 정렬용). */
export const SNIPPET_CATEGORIES: string[] = ['움직임', '수집·점수', '위험·리스폰', 'UI·HUD', '상호작용', '생성', 'API'];
