'use client';
/**
 * 스크립트 작성 가이드 — Studio 스크립트 에디터에서 "📖 가이드" 버튼으로 열림.
 *
 * 내용:
 *   1. 라이프사이클 (onStart, onUpdate, onClick 등)
 *   2. 핵심 API (self / world / game / ui / net)
 *   3. 외부 HTTP api — 인증 없음 / 본인 키
 *   4. 예제 (단일/병렬/직렬 체인/N개 비교)
 *   5. 보안 모델
 *   6. 서비스 cheat-sheet
 *
 * 콘텐츠 위주 — 인터랙션은 ESC/외부 클릭/X 로 닫기만.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Section = 'lifecycle' | 'core' | 'api' | 'examples' | 'security' | 'services';

export function ScriptApiGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>('api');  // 디폴트 = API (질문 가장 잦음)

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal((
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483600 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 880, maxWidth: '95vw', height: 'min(720px, 92vh)', background: '#0b1220', borderRadius: 14, color: '#e6edf3', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.3)' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📖 스크립트 가이드</h3>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 본문 — 좌측 섹션 탭 + 우측 콘텐츠 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 좌측 탭 */}
          <nav style={{ width: 180, padding: 12, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.02)' }}>
            <TabBtn active={section === 'lifecycle'} onClick={() => setSection('lifecycle')}>⏱ 라이프사이클</TabBtn>
            <TabBtn active={section === 'core'}      onClick={() => setSection('core')}>🎮 핵심 API</TabBtn>
            <TabBtn active={section === 'api'}       onClick={() => setSection('api')}>🌐 외부 HTTP API</TabBtn>
            <TabBtn active={section === 'examples'}  onClick={() => setSection('examples')}>📋 예제 모음</TabBtn>
            <TabBtn active={section === 'security'}  onClick={() => setSection('security')}>🔒 보안</TabBtn>
            <TabBtn active={section === 'services'}  onClick={() => setSection('services')}>📚 서비스 cheat-sheet</TabBtn>
          </nav>

          {/* 우측 콘텐츠 */}
          <main style={{ flex: 1, padding: '18px 22px', overflowY: 'auto', fontSize: 13, lineHeight: 1.6 }}>
            {section === 'lifecycle' && <LifecycleSection />}
            {section === 'core'      && <CoreApiSection />}
            {section === 'api'       && <HttpApiSection />}
            {section === 'examples'  && <ExamplesSection />}
            {section === 'security'  && <SecuritySection />}
            {section === 'services'  && <ServicesSection />}
          </main>
        </div>
      </div>
    </div>
  ), document.body);
}

/* ── 섹션들 ─────────────────────────────────────────────── */

function LifecycleSection() {
  return (
    <>
      <H>스크립트 라이프사이클 함수</H>
      <P>스크립트는 부착된 오브젝트에 대해 자동으로 다음 함수들을 호출한다. 정의 안 한 함수는 무시됨.</P>
      <Table rows={[
        ['onStart()',           '씬 시작 시 1회 (멀티에선 호스트 결정 후)'],
        ['onUpdate(dt)',        '매 프레임. dt = 직전 프레임과의 초 단위 간격 (~0.016)'],
        ['onClick(clickerId)',  '1인칭 크로스헤어로 클릭됐을 때. clickerId = 클릭한 플레이어 id'],
        ['onGrab(grabberId)',   '1인칭 E 키로 잡혔을 때'],
        ['onRelease(grabberId)','놓였을 때'],
        ['onNetEvent(event, data, fromId)', 'net.sendAll/sendTo 로 받은 이벤트'],
        ['onCollide(other)',    '다른 오브젝트와 충돌 시 (other = 충돌 상대 핸들)'],
      ]} />
      <H sub>변수 선언 — 모듈 최상단</H>
      <Code>{`var counter = 0;            // 모듈 변수 — 상태 유지
let target = null;          // 오브젝트 참조 (인스펙터에서 드롭)
const SPEED = 2.5;          // 상수

function onUpdate(dt) {
  counter += dt;            // 다음 프레임에도 값 유지
}`}</Code>
    </>
  );
}

function CoreApiSection() {
  return (
    <>
      <H>핵심 글로벌</H>
      <P>스크립트에서 자동으로 쓸 수 있는 객체들.</P>

      <H sub>self — 부착된 오브젝트 본인</H>
      <Code>{`self.id                       // 이 오브젝트의 id
self.getPosition()            // { x, y, z }
self.setPosition(x, y, z)
self.getRotation()            // { x, y, z } (라디안)
self.setRotation(rx, ry, rz)
self.applyImpulse(x, y, z)    // 물리 충격
self.setVisible(true/false)
self.setColor("#ff0")
self.destroy()`}</Code>

      <H sub>world — 씬·플레이어 조작</H>
      <Code>{`world.getPlayers()                          // 플레이어 배열
world.find("doorA")                         // label 또는 id 로 다른 오브젝트
world.spawn({ kind, position, color, ... }) // 런타임 spawn
world.isHost()                              // 본인이 호스트인지
world.playSound(url, { volume, loop })      // 사운드 재생
world.teleportLocal(x, y, z)                // 본인 순간이동`}</Code>

      <H sub>game — 게임 상태 (HUD 공유)</H>
      <Code>{`game.get("score", 0)        // 기본값 지원
game.set("score", 10)
game.add("score", 1)        // → number 반환`}</Code>

      <H sub>ui — 화면 HUD</H>
      <Code>{`ui.text("hp-label", "HP: 100", { x: 0.5, y: 0.1, size: 24, color: "#fff" })
ui.bar("hp-bar", 80, 100, { x: 0.5, y: 0.15, color: "#22c55e" })
ui.clear("hp-label")
ui.clearAll()`}</Code>

      <H sub>net — 멀티 동기화</H>
      <Code>{`net.sendAll("chat", { text: "hi" })           // 모든 플레이어에게
net.sendTo(playerId, "private", { secret: 1 })
// 수신: onNetEvent(event, data, fromId) 안에서`}</Code>

      <H sub>그 외</H>
      <Code>{`Math.sin/cos/random/PI 등
print("debug", value)        // console.log
JSON.stringify(obj) / JSON.parse(str)
props.speed                  // 스크립트 컴포넌트 부착 시 입력한 props`}</Code>
    </>
  );
}

function HttpApiSection() {
  return (
    <>
      <H>외부 HTTP API 호출</H>
      <P><b>인터프리터가 동기적</b>이라 fetch 가 즉시 결과 못 줌. <code>startFetch / callMyApi</code> 로 요청 발사 → <code>onUpdate</code> 안에서 <code>getResult(key)</code> 로 polling.</P>

      <H sub>1) api.startFetch — 인증 없는 공개 GET</H>
      <Code>{`api.startFetch(url, resultKey) → boolean
api.getResult(resultKey)       → null | { ok, data?, error? }
api.clearResult(resultKey)
api.isPending(resultKey)       → boolean`}</Code>
      <P>HTTPS 만 허용. credentials:omit (쿠키 X). 응답 200KB 제한.</P>

      <H sub>2) api.callMyApi — 본인이 등록한 키로 임의 호출</H>
      <Code>{`api.callMyApi(keyName, url, options, resultKey) → boolean
//   keyName    = 설정 → 🔑 내 API 키 에서 등록한 이름 (예: "myGpt")
//   url        = 본인이 자유롭게 지정 (https://...)
//   options    = {
//     method?    = 'GET',                    // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
//     body?      ,                           // 객체 → JSON.stringify 자동
//     headers?   = { 'X-Extra': 'value' },   // 인증 외 추가 헤더 (자유)
//   }
//   resultKey  = polling 용 임의 문자열

api.hasMyApi(keyName) → boolean   // 키 등록됐는지`}</Code>

      <H sub>한도</H>
      <Ul items={[
        '스크립트 인스턴스당 분당 30회',
        '응답 200KB 초과 시 에러',
        'URL 1000자 초과 차단',
        'HTTPS 만 허용 (http/file/data: 차단)',
        'credentials: omit — ALP 쿠키 절대 전송 X',
        '인증 헤더는 런타임이 마지막에 덮어씀 — options.headers 로 우회 불가',
      ]} />

      <H sub>결과 객체 구조</H>
      <Code>{`var r = api.getResult("myResult");
// 아직 진행 중:  r === null
// 성공:        r = { ok: true,  data: <JSON 객체 or 텍스트> }
// 실패:        r = { ok: false, error: "에러 메시지" }`}</Code>
      <P>응답 Content-Type 이 JSON 이면 data 는 객체, 아니면 문자열.</P>
    </>
  );
}

function ExamplesSection() {
  return (
    <>
      <H>예제 모음</H>

      <H sub>예제 1 — 단일 GET (날씨)</H>
      <Code>{`var weather = null;

function onStart() {
  api.startFetch("https://wttr.in/Seoul?format=3", "w");
}

function onUpdate(dt) {
  if (weather) return;
  var r = api.getResult("w");
  if (!r) return;
  if (r.ok) {
    weather = String(r.data);
    ui.text("w", weather, { x: 0.5, y: 0.2, size: 22 });
  } else {
    print("실패:", r.error);
    weather = "fail";
  }
  api.clearResult("w");
}`}</Code>

      <H sub>예제 2 — 본인 OpenAI 키로 GPT</H>
      <P>먼저: 설정 → 🔑 내 API 키 → ➕ 추가 → 이름 <code>myGpt</code> / Bearer / 본인 키</P>
      <Code>{`function onClick(clickerId) {
  api.callMyApi(
    "myGpt",
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      body: {
        model: "gpt-4o-mini",
        max_tokens: 100,
        messages: [{ role: "user", content: "농담 하나 짧게" }]
      }
    },
    "joke"
  );
}

function onUpdate(dt) {
  var r = api.getResult("joke");
  if (!r) return;
  if (r.ok) {
    var text = String(r.data.choices[0].message.content);
    ui.text("j", text, { x: 0.5, y: 0.3, size: 20 });
  } else {
    print("실패:", r.error);
  }
  api.clearResult("joke");
}`}</Code>

      <H sub>예제 3 — 병렬 (둘 동시)</H>
      <Code>{`function onClick() {
  api.callMyApi("myWeather", weatherUrl, { method: "GET" }, "w");
  api.callMyApi("myGpt",     gptUrl,     { method: "POST", body: gptBody }, "g");
}

function onUpdate(dt) {
  var rW = api.getResult("w");  if (rW) { /* 날씨 처리 */ api.clearResult("w"); }
  var rG = api.getResult("g");  if (rG) { /* GPT 처리  */ api.clearResult("g"); }
}`}</Code>

      <H sub>예제 4 — 직렬 체인 (GPT → DeepL 번역)</H>
      <Code>{`var stage = 0;
var gptText = null;

function onClick() {
  stage = 1;
  api.callMyApi("myGpt", gptUrl, { method: "POST", body: gptBody }, "s1");
}

function onUpdate(dt) {
  if (stage === 1) {
    var r1 = api.getResult("s1");
    if (r1) {
      if (r1.ok) {
        gptText = r1.data.choices[0].message.content;
        stage = 2;
        api.callMyApi("myDeepL", deeplUrl,
          { method: "POST", body: { text: [gptText], target_lang: "EN" } }, "s2");
      } else { stage = 0; print("GPT 실패"); }
      api.clearResult("s1");
    }
  } else if (stage === 2) {
    var r2 = api.getResult("s2");
    if (r2) {
      if (r2.ok) ui.text("out", r2.data.translations[0].text, { x: 0.5, y: 0.5 });
      api.clearResult("s2");
      stage = 0;
    }
  }
}`}</Code>

      <H sub>예제 5 — N개 LLM 비교</H>
      <Code>{`var results = { gpt: null, claude: null, gemini: null };

function onClick() {
  results = { gpt: null, claude: null, gemini: null };
  api.callMyApi("myGpt",    gptUrl,    { method: "POST", body: gptBody    }, "rGpt");
  api.callMyApi("myClaude", claudeUrl, { method: "POST", body: claudeBody,
    headers: { "anthropic-version": "2023-06-01",
               "anthropic-dangerous-direct-browser-access": "true" }}, "rClaude");
  api.callMyApi("myGemini", geminiUrl, { method: "POST", body: geminiBody }, "rGemini");
}

function onUpdate(dt) {
  ["rGpt", "rClaude", "rGemini"].forEach(function(k) {
    if (results[k.slice(1).toLowerCase()] !== null) return;
    var r = api.getResult(k);
    if (r) { results[k.slice(1).toLowerCase()] = r.ok ? r.data : ("err: " + r.error); api.clearResult(k); }
  });
  // 셋 다 도착하면 표시
}`}</Code>
    </>
  );
}

function SecuritySection() {
  return (
    <>
      <H>보안 모델</H>

      <H sub>키 격리</H>
      <Ul items={[
        '스크립트는 키 값 못 봄 — api.callMyApi(name, ...) 호출만 가능',
        '인증 헤더는 런타임이 fetch 직전 주입 — closure 안에서만',
        '스크립트의 options.headers 에 같은 헤더 있어도 런타임이 마지막에 덮어씀',
        'getKey() 같은 메서드 없음. hasMyApi(name) → true/false 만',
      ]} />

      <H sub>다른 유저에게 prefab 공유 시</H>
      <Ul items={[
        '스크립트 코드만 공유 (키 값 X)',
        '받은 유저가 같은 이름으로 본인 키 등록해야 동작',
        '동작하면 그 유저의 키로 그 유저가 비용 부담',
        '키 누구도 절대 못 봄 — 본인 device + 본인 DB row 만',
      ]} />

      <H sub>호출 제한</H>
      <Ul items={[
        '스크립트 인스턴스당 분당 30회',
        'HTTPS 강제 (http/file/data: 차단)',
        'credentials: omit — ALP 쿠키·세션 절대 전송 X',
        '브라우저 CORS — 서버가 안 받으면 자동 차단',
        '응답 200KB 제한',
      ]} />

      <H sub>저장 방식</H>
      <Ul items={[
        '본인 device localStorage 캐시 (jsRuntime 동기 접근용)',
        '서버 DB AES-256-GCM 암호화 (다른 디바이스 sync)',
        'env API_KEY_ENCRYPTION_SECRET 으로 암호화 — 운영자만 보유',
        '본인만 read/write — 다른 유저 절대 불가',
      ]} />
    </>
  );
}

function ServicesSection() {
  return (
    <>
      <H>주요 서비스 cheat-sheet</H>
      <P>본인이 키 발급 → 설정 → 🔑 내 API 키 에서 등록 → 스크립트에서 호출.</P>

      <ServiceBlock title="OpenAI" auth="Bearer" url="https://api.openai.com/v1/chat/completions"
        body={`{
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }]
}`}
        resp="r.data.choices[0].message.content"
        keys="platform.openai.com/api-keys" />

      <ServiceBlock title="Anthropic (Claude)" auth='Custom: x-api-key' url="https://api.anthropic.com/v1/messages"
        body={`{
  model: "claude-3-5-haiku-20241022",
  max_tokens: 200,
  messages: [{ role: "user", content: "hi" }]
}`}
        resp="r.data.content[0].text"
        extraHeaders={`{
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true"
}`}
        keys="console.anthropic.com/settings/keys" />

      <ServiceBlock title="Google Gemini" auth='Custom: x-goog-api-key'
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        body={`{
  contents: [{ parts: [{ text: "안녕" }] }]
}`}
        resp="r.data.candidates[0].content.parts[0].text"
        keys="aistudio.google.com/apikey" />

      <ServiceBlock title="Groq (고속 추론)" auth="Bearer" url="https://api.groq.com/openai/v1/chat/completions"
        body={`{
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "hi" }]
}`}
        resp="r.data.choices[0].message.content"
        keys="console.groq.com/keys" />

      <H sub>주의</H>
      <Ul items={[
        'CORS 막힌 서비스는 못 부름 — 위 4개는 모두 OK',
        '키를 쿼리스트링에 넣는 서비스 (?api_key=...) 는 현재 미지원',
        'Authorization prefix 가 "Bearer" 외 (예: DeepL "DeepL-Auth-Key") 는 Custom Header 로: 이름 Authorization, 값 "DeepL-Auth-Key {key}"',
      ]} />
    </>
  );
}

/* ── 컴포넌트 헬퍼 ──────────────────────────────────── */

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 12px',
        background: active ? 'rgba(99,102,241,0.25)' : 'transparent',
        border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'transparent'}`,
        borderRadius: 6, color: active ? '#c7d2fe' : 'rgba(255,255,255,0.7)',
        fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
        textAlign: 'left',
      }}>{children}</button>
  );
}
function H({ children, sub = false }: { children: React.ReactNode; sub?: boolean }) {
  return <div style={{
    fontSize: sub ? 13 : 16, fontWeight: 700,
    color: sub ? '#c7d2fe' : '#fff',
    marginTop: sub ? 18 : 4, marginBottom: 6,
    paddingBottom: sub ? 0 : 6,
    borderBottom: sub ? 'none' : '1px solid rgba(99,102,241,0.25)',
  }}>{children}</div>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '6px 0', color: 'rgba(230,237,243,0.85)' }}>{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <pre style={{
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 6, padding: '10px 12px', margin: '6px 0',
    fontSize: 12, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace',
    overflowX: 'auto', color: '#e6edf3',
  }}>{children}</pre>;
}
function Ul({ items }: { items: string[] }) {
  return <ul style={{ margin: '6px 0', paddingLeft: 18, color: 'rgba(230,237,243,0.85)' }}>
    {items.map((s, i) => <li key={i} style={{ margin: '2px 0' }}>{s}</li>)}
  </ul>;
}
function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table style={{ width: '100%', fontSize: 12, marginTop: 8, borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <td style={{ padding: '6px 10px 6px 0', fontFamily: 'ui-monospace, monospace', color: '#86efac', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
            <td style={{ padding: '6px 0', color: 'rgba(230,237,243,0.85)' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function ServiceBlock({ title, auth, url, body, resp, extraHeaders, keys }: {
  title: string; auth: string; url: string; body: string; resp: string; extraHeaders?: string; keys: string;
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: 12, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
        키 발급: <a href={`https://${keys}`} target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc' }}>{keys}</a>
      </div>
      <Table rows={[
        ['인증', auth],
        ['URL', url],
      ]} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>body:</div>
      <Code>{body}</Code>
      {extraHeaders && (<>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>headers (인증 외 추가):</div>
        <Code>{extraHeaders}</Code>
      </>)}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
        응답 텍스트 추출: <code style={{ color: '#86efac' }}>{resp}</code>
      </div>
    </div>
  );
}
