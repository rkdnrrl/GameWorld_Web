'use client';
import { useState, useMemo } from 'react';

interface MapObjectLike {
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface AiGuideModalProps {
  open: boolean;
  onClose: () => void;
  /** AI 가 준 JSON 을 파싱해 받은 오브젝트 배열을 씬에 적용 */
  onImport: (objects: MapObjectLike[], mode: 'add' | 'replace') => void;
}

// AI 에 전달할 시스템 프롬프트 — 스키마 + API + 규칙.
// {{USER_REQUEST}} 토큰은 사용자가 입력한 요청으로 치환됨.
const AI_PROMPT_TEMPLATE = `당신은 ALP 가상 월드 빌더 도우미입니다.
사용자 요청에 따라 3D 씬 오브젝트 + UI 를 JSON 으로 생성하세요.

# 출력 형식 (전체)
\`\`\`json
{
  "objects": [
    // ── 3D 오브젝트 ──
    {
      "kind": "cube",            // cube | sphere | cylinder | plane | asset | pointlight | spotlight | dirlight | spawn | empty | ui
      "id":    "auto",           // 비우면 자동, 부모-자식 연결할 때만 명시
      "parentId": "<otherId>",   // 부모 오브젝트 id (선택)
      "label": "이름(선택)",
      "position": [0, 0.5, 0],   // 미터, y=0 이 지면. 부모 있으면 로컬 좌표
      "rotation": [0, 0, 0],     // 라디안
      "scale":    [1, 1, 1],
      "color":    "#888888",     // hex
      "hidden":   false,         // 숨김 토글
      "locked":   false,         // 편집 잠금

      // 머티리얼 (선택, primitives)
      "material":      "default", // default | wood | metal | stone | glass | plastic | emissive
      "materialColor": "#888888",
      "textureAlbedo": "https://...",
      "textureTilingX": 1,
      "textureTilingY": 1,

      // 영상/이미지/iframe URL — 표면에 띄움 (TV 화면)
      "videoUrl": "https://www.youtube.com/watch?v=...",

      // 조명 (lights)
      "lightColor":     "#ffffff",
      "lightIntensity": 1,
      "lightDistance":  0,        // 0 = 무한
      "lightAngle":     45,       // spot 만, degree
      "castShadow":     false,

      // 물리 (선택, primitives)
      "physics": "fixed",         // none | fixed | dynamic

      // Unity 식 컴포넌트 (선택). 게임 로직 컴포넌트 5개 + 기존 6개 = 11종.
      "components": [
        { "type": "worldPhysics", "props": { "gravity": -22, "jumpPower": 7 } },
        { "type": "physics",      "props": { "mode": "dynamic" } },
        { "type": "collider",     "props": { "sizeX": 1, "sizeY": 1, "sizeZ": 1, "trigger": false } },
        { "type": "grab" },
        { "type": "particle",     "props": { "preset": "fire", "count": 200, "size": 1 } },
        { "type": "postProcess",  "props": { "bloom": true, "bloomIntensity": 0.6 } },

        // ── 게임 로직 (호러/액션/RPG 등) ──
        { "type": "health",   "props": { "maxHp": 100, "invulnTime": 0.3, "destroyOnDeath": true, "team": "enemy",
                                          "onDeathScript": "ui.text('msg', '처치!');" } },
        { "type": "damage",   "props": { "amount": 15, "mode": "contact", "team": "enemy", "destroyOnHit": false } },
        // mode: contact (충돌) | trigger (영역 진입) | aoe (주변 주기)
        // aoe 시: aoeRadius, aoeInterval 추가
        { "type": "npc",      "props": { "mode": "both", "aggroRange": 15, "attackRange": 1.5,
                                          "attackCooldown": 1.5, "moveSpeed": 3, "patrolRadius": 8, "team": "enemy" } },
        // mode: idle | patrol (배회) | chase (감지 시 추적) | both (배회+감지시 추적)
        // npc 는 호스트 10Hz 자동 추적 + 사거리 도달 시 '__npcattack__' 이벤트 broadcast
        { "type": "flashlight","props": { "range": 15, "angle": 35, "intensity": 5,
                                           "color": "#fff5dd", "followCamera": true, "on": true } }
        // grab 컴포넌트 같이 부착 → 손전등 줍고 1인칭이면 카메라 따라감
      ],

      // 스크립트 (선택)
      "script": "function onUpdate(dt) { self.setRotation(0, world.time, 0); }",
      "scriptVars": { "speed": 1.5 },

      // Terrain (kind === "terrain" 일 때만) — heightmap 기반 지면
      "terrain": {
        "size": 50,
        "segments": 64,
        "heights": [],         // (segments+1)^2 = 4225 개 Float. 빈 배열이면 평탄 (Y=0)
        "baseColor": "#5a8a4a",
        "textureUrl": "",      // 잔디/모래/돌 텍스처 URL
        "textureRepeat": 8
      },

      // UI 오브젝트 (kind === "ui" 일 때만)
      "ui": {
        "type": "canvas",         // canvas | panel | image | text | button | slider | input | toggle | scrollview
        "space": "screen",        // canvas 만 — screen | world
        "rect": {
          "anchorMin": { "x": 0.5, "y": 0.5 },
          "anchorMax": { "x": 0.5, "y": 0.5 },
          "pivot":     { "x": 0.5, "y": 0.5 },
          "posX": 0, "posY": 0,
          "width": 200, "height": 60
        },
        "text": "버튼",
        "fontSize": 16,
        "color": "#ffffff",
        "bgColor": "#4f46e5",
        "onClickScript": "data.add('score', 1);"
      }
    }
  ]
}
\`\`\`

# 좌표 / 단위
- 위 = +Y, y=0 이 지면. 캐릭터 키 약 1.8m
- dynamic (떨어지는) 오브젝트는 y >= 1 부터 시작
- 색상은 hex (#rrggbb)
- parentId 로 그룹화 — 부모 transform 이 자식에 propagate. 부모가 움직이면 자식도 따라감.
- spawn = 플레이어 스폰 포인트 (보이지 않음). 여러 개 두면 랜덤 선택.
- empty = 빈 컨테이너. components (예: worldPhysics) 부착용 또는 그룹 부모용.

# UI 시스템
- Canvas 가 root (screen 또는 world). 그 자식으로 panel/image/text/button/slider/input/toggle/scrollview.
- RectTransform: anchor 9-점 (0=좌하, 0.5=중앙, 1=우상). anchorMin==anchorMax = 점 고정, 다르면 stretch.
- Button onClickScript / Slider/Input/Toggle onChangeScript 에서 game, ui, world, data, value 사용 가능.

# 스크립트 API
self.setPosition(x,y,z) / setRotation(rx,ry,rz) / applyImpulse(x,y,z)
self.setVisible(b) / setColor(hex) / setIntensity(n) / destroy()
self.getHp() / damage(n, opts) / heal(n)             // health 컴포넌트 있을 때
world.time / getPlayers() / find(idOrLabel) / spawn(opts) / isHost() / runtimeCount() / playSound(url)
game.get(key, d) / set(key, v) / add(key, n)          // 메모리 게임 상태
ui.text(id, text, opts) / bar(id, value, max, opts)  // 화면 HUD (간단)
ui.set(label, patch) / show(label) / hide(label)     // UI 오브젝트 (label 로 찾음, 신규 시스템)
data.get(key, d) / set(key, v) / all()               // 플레이어 개인 영구 저장 (서버 DB)
data.shared.get(key, d) / set(key, v) / all()        // 맵 전역 영구 저장 (모두 공유)
net.sendAll(event, data) / sendTo(playerId, event, data)
Math.sin / cos / abs / floor / round / random / PI

# 멀티 플레이 권위 모델
- 호스트만 NPC AI, damage, hp 계산. 비호스트는 broadcast 받아 시각 반영.
- npc 가 공격하면 '__npcattack__' 이벤트 broadcast → 모든 클라가 onNetEvent 로 받음.
  onNetEvent(event, data) { if (event === '__npcattack__') { if (data.targetId === self.id) game.add('hp', -data.amount); } }

# 이벤트 함수 (스크립트)
function onStart() {}        // 호스트 결정 후 1회
function onUpdate(dt) {}     // 매 프레임
function onClick(playerId) {} // 1인칭 클릭
function onNetEvent(event, data, fromId) {}
function onTriggerEnter(otherId) {}

# 규칙
1. 출력은 JSON 만 (코드 블록 감싸도 OK). 설명 텍스트 최소화
2. ES5 수준 단순 JS — 화살표 함수 X, async X, class X, template literal X
3. 호스트만 spawn 하려면: if (world.isHost() && world.runtimeCount() === 0) { ... }
4. UI 의 onClickScript 도 위 스크립트 API 다 사용 가능. value 변수는 slider/input/toggle 의 새 값.
5. 큰 맵이라도 한 번에 너무 많지 않게 (50개 미만 권장 — 이후 사용자가 또 요청)

# 예시 1 — 간단 회전 큐브
\`\`\`json
{
  "objects": [
    { "kind":"plane", "position":[0,0,0], "rotation":[-1.5708,0,0], "scale":[20,20,1], "color":"#3a5", "label":"바닥" },
    { "kind":"cube",  "position":[0,1,0], "color":"#e44",
      "script":"function onUpdate(dt){ self.setRotation(0, world.time, 0); }" }
  ]
}
\`\`\`

# 예시 2 — 호러 게임 미니 (적 + 손전등 + 함정)
\`\`\`json
{
  "objects": [
    { "kind":"plane", "position":[0,0,0], "rotation":[-1.5708,0,0], "scale":[40,40,1], "color":"#1a1a1a" },
    { "kind":"empty", "label":"환경", "position":[0,0,0],
      "components":[{ "type":"postProcess", "props":{ "brightness":-0.3, "vignette":0.7 } }] },
    { "kind":"cube", "label":"손전등", "position":[2,1,0], "scale":[0.2,0.2,0.6], "color":"#444",
      "components":[
        { "type":"physics", "props":{ "mode":"dynamic" } }, { "type":"grab" },
        { "type":"flashlight", "props":{ "range":18, "angle":40, "intensity":7, "followCamera":true } }
      ] },
    { "kind":"cube", "label":"좀비", "position":[10,1,5], "color":"#3a5",
      "components":[
        { "type":"physics", "props":{ "mode":"dynamic" } }, { "type":"collider" },
        { "type":"health", "props":{ "maxHp":80, "team":"enemy", "onDeathScript":"world.playSound('/sounds/die.mp3');" } },
        { "type":"damage", "props":{ "amount":15, "mode":"contact", "team":"enemy" } },
        { "type":"npc", "props":{ "mode":"both", "aggroRange":12, "attackRange":1.8, "moveSpeed":3, "patrolRadius":6 } }
      ] },
    { "kind":"cylinder", "label":"독구름", "position":[5,0.5,5], "scale":[6,1,6], "color":"#5a4",
      "components":[
        { "type":"collider", "props":{ "trigger":true, "sizeY":3 } },
        { "type":"damage", "props":{ "amount":3, "mode":"aoe", "aoeRadius":4, "aoeInterval":1, "team":"trap" } }
      ] }
  ]
}
\`\`\`

# 예시 3 — 점수 시스템 (UI + data)
\`\`\`json
{
  "objects": [
    { "kind":"ui", "label":"hud", "ui":{ "type":"canvas", "space":"screen", "rect":{"anchorMin":{"x":0,"y":0},"anchorMax":{"x":1,"y":1},"pivot":{"x":0.5,"y":0.5},"posX":0,"posY":0,"width":0,"height":0} } },
    { "kind":"ui", "label":"점수표시", "parentId":"hud", "ui":{ "type":"text", "rect":{"anchorMin":{"x":0.5,"y":1},"anchorMax":{"x":0.5,"y":1},"pivot":{"x":0.5,"y":1},"posX":0,"posY":-20,"width":300,"height":40}, "text":"Score: 0", "fontSize":28, "color":"#fff" } },
    { "kind":"ui", "label":"증가버튼", "parentId":"hud", "ui":{ "type":"button", "rect":{"anchorMin":{"x":0.5,"y":0},"anchorMax":{"x":0.5,"y":0},"pivot":{"x":0.5,"y":0},"posX":0,"posY":20,"width":160,"height":48}, "text":"+1", "bgColor":"#4f46e5", "onClickScript":"var s = data.shared.get('score', 0) + 1; data.shared.set('score', s); ui.set('점수표시', { text: 'Score: ' + s });" } }
  ]
}
\`\`\`

# 사용자 요청
{{USER_REQUEST}}
`;

export default function AiGuideModal({ open, onClose, onImport }: AiGuideModalProps) {
  const [jsonText, setJsonText] = useState('');
  const [userRequest, setUserRequest] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  // 사용자 요청을 토큰 자리에 끼워넣은 최종 프롬프트
  const fullPrompt = useMemo(
    () => AI_PROMPT_TEMPLATE.replace('{{USER_REQUEST}}', userRequest.trim() || '(여기에 만들고 싶은 씬을 한국어 또는 영어로 자유롭게 적어주세요)'),
    [userRequest]
  );

  if (!open) return null;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('클립보드 복사 실패. 직접 선택해서 복사하세요.');
    }
  };

  /** AI 응답에서 JSON 부분만 추출 — ```json ``` 블록, 단순 ``` 블록, 또는 첫 {...} 매칭. */
  function extractJson(raw: string): string {
    const t = raw.trim();
    // 1. ```json ... ``` 또는 ``` ... ``` 블록
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return fenced[1].trim();
    // 2. 첫 { 부터 마지막 } 까지 (단순 휴리스틱 — 중첩 깊이 매칭은 brace counter)
    const first = t.indexOf('{');
    if (first < 0) return t;
    let depth = 0;
    for (let i = first; i < t.length; i++) {
      if (t[i] === '{') depth++;
      else if (t[i] === '}') { depth--; if (depth === 0) return t.slice(first, i + 1); }
    }
    return t.slice(first);
  }

  const handleImport = (mode: 'add' | 'replace') => {
    setError(null);
    try {
      const cleaned = extractJson(jsonText);
      if (!cleaned) {
        setError('붙여넣을 JSON 이 비어 있습니다.');
        return;
      }
      const data = JSON.parse(cleaned);
      const arr: MapObjectLike[] = Array.isArray(data) ? data : (data.objects || []);
      if (!Array.isArray(arr)) {
        setError('JSON 에 objects 배열이 없습니다.');
        return;
      }
      if (arr.length === 0) {
        setError('오브젝트 배열이 비어 있습니다.');
        return;
      }
      // 기본 필드 보강 (AI 가 누락한 경우)
      const normalized = arr.map(o => ({
        kind: o.kind || 'cube',
        position: Array.isArray(o.position) && o.position.length === 3 ? o.position : [0, 1, 0],
        rotation: Array.isArray(o.rotation) && o.rotation.length === 3 ? o.rotation : [0, 0, 0],
        scale:    Array.isArray(o.scale)    && o.scale.length    === 3 ? o.scale    : [1, 1, 1],
        color:    o.color || '#888888',
        ...o,
      }));
      onImport(normalized, mode);
      setJsonText('');
      onClose();
    } catch (e) {
      setError('JSON 파싱 실패: ' + (e as Error).message);
    }
  };

  // 가져오기 전 미리 분석 (UX 미리보기)
  const preview = useMemo(() => {
    if (!jsonText.trim()) return null;
    try {
      const cleaned = extractJson(jsonText);
      const d = JSON.parse(cleaned);
      const arr: MapObjectLike[] = Array.isArray(d) ? d : (d.objects || []);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const counts: Record<string, number> = {};
      for (const o of arr) {
        const k = o.kind || 'cube';
        const sub = k === 'ui' && o.ui?.type ? `ui:${o.ui.type}` : k;
        counts[sub] = (counts[sub] || 0) + 1;
      }
      return { total: arr.length, counts };
    } catch { return null; }
  }, [jsonText]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(3,7,18,0.78)', backdropFilter: 'blur(8px)',
        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)',
          background: 'linear-gradient(180deg, rgba(14,23,46,0.97), rgba(8,14,30,0.97))',
          color: '#fff', overflow: 'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>🤖 AI 로 맵 만들기</div>
          <button onClick={onClose} style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {/* 안내 */}
          <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.55, marginBottom: 16 }}>
            AI 비용은 본인 계정에서 발생합니다. ChatGPT, Claude, Gemini 등 원하는 AI 도구를 사용해서 JSON 을 받아 붙여넣으세요.
            <br />최신 스펙: 3D 오브젝트 + UI 시스템 (Canvas/Text/Button/Slider 등) + 컴포넌트 (Physics/Particle 등) + 영구 데이터 저장 (data API).
          </div>

          {/* Step 1 — 요청 입력 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>1</span>
              만들고 싶은 씬 설명
            </div>
            <textarea
              value={userRequest}
              onChange={e => setUserRequest(e.target.value)}
              placeholder="예: 어두운 던전. 횃불 4개 + 입구에 보물상자 + 함정 트리거 / 점수 HUD 와 +1 버튼 UI"
              style={{
                width: '100%', height: 80, background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                color: '#fff', fontSize: 13, padding: 10, resize: 'vertical', outline: 'none',
              }}
            />
          </div>

          {/* Step 2 — 프롬프트 복사 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>2</span>
              프롬프트 복사 후 AI 에 붙여넣기
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleCopyPrompt}
                style={{
                  background: copied ? '#10b981' : '#4f46e5', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {copied ? '✓ 복사됨 (스펙 + 요청 합쳐서)' : '📋 프롬프트 복사 (스펙 + 요청)'}
              </button>
              <button
                onClick={() => setShowFullPrompt(v => !v)}
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, cursor: 'pointer' }}>
                {showFullPrompt ? '프롬프트 숨기기' : '프롬프트 미리보기'}
              </button>
              <a href="https://chat.openai.com" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600 }}>ChatGPT ↗</a>
              <a href="https://claude.ai" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600 }}>Claude ↗</a>
              <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600 }}>Gemini ↗</a>
            </div>
            {showFullPrompt && (
              <textarea
                readOnly
                value={fullPrompt}
                style={{
                  width: '100%', height: 220, background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                  color: 'rgba(255,255,255,0.85)', fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 10.5, padding: 10, resize: 'vertical', outline: 'none',
                }}
              />
            )}
          </div>

          {/* Step 3 — 응답 붙여넣기 */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>3</span>
              AI 응답 붙여넣기 + 적용
            </div>
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setError(null); }}
              placeholder='AI 가 준 응답 전체를 그대로 붙여넣어도 됩니다 (코드 블록·설명 포함). 자동으로 JSON 만 추출합니다.'
              style={{
                width: '100%', height: 160, background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 8, color: '#fff', fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11, padding: 10, resize: 'vertical', outline: 'none',
              }}
            />
            {/* 미리보기 — 분석 결과 (몇 개, 종류별) */}
            {preview && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#a5b4fc', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', padding: '6px 10px', borderRadius: 6 }}>
                ✓ {preview.total} 개 오브젝트 인식 — {Object.entries(preview.counts).map(([k, v]) => `${k}:${v}`).join(', ')}
              </div>
            )}
            {error && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5', background: 'rgba(239,68,68,0.12)', padding: '6px 10px', borderRadius: 6 }}>
                ⚠ {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => handleImport('add')}
                disabled={!jsonText.trim()}
                style={{
                  background: jsonText.trim() ? '#10b981' : 'rgba(255,255,255,0.08)',
                  color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
                  fontSize: 12, fontWeight: 700, cursor: jsonText.trim() ? 'pointer' : 'default',
                  opacity: jsonText.trim() ? 1 : 0.5,
                }}
              >
                ⊕ 현재 씬에 추가
              </button>
              <button
                onClick={() => handleImport('replace')}
                disabled={!jsonText.trim()}
                style={{
                  background: jsonText.trim() ? '#ef4444' : 'rgba(255,255,255,0.08)',
                  color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
                  fontSize: 12, fontWeight: 700, cursor: jsonText.trim() ? 'pointer' : 'default',
                  opacity: jsonText.trim() ? 1 : 0.5,
                }}
              >
                ↻ 씬 전체 교체
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
