import React from "react";
import { Link } from "@/i18n/navigation";

function Chip({ children, color = "zinc" }: { children: React.ReactNode; color?: "violet" | "green" | "red" | "zinc" | "yellow" }) {
  const colors = {
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    green:  "bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300",
    red:    "bg-red-100    text-red-700    dark:bg-red-900/40    dark:text-red-300",
    zinc:   "bg-zinc-100   text-zinc-600   dark:bg-zinc-800      dark:text-zinc-300",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  );
}

function Block({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 text-xs leading-relaxed text-green-300 dark:bg-black">
      <code>{children}</code>
    </pre>
  );
}

export default function MultiplayReference() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">

      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Link href="/develop" className="hover:text-blue-500">개발</Link>
          <span>/</span>
          <Link href="/develop/multiplayer" className="hover:text-blue-500">멀티플레이 가이드</Link>
          <span>/</span>
          <span className="text-zinc-700 dark:text-zinc-200">빠른 참조</span>
        </div>
        <Link
          href="/develop/multiplayer"
          className="text-sm text-blue-500 hover:underline"
        >
          전체 가이드 보기 →
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold">⚡ 빠른 참조</h1>
      <p className="mb-8 text-sm text-zinc-500">복잡한 설명 없이 쓸 것만 모아놨습니다.</p>

      {/* 2단 레이아웃 */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── 1. 기본 세팅 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs text-white">1</span>
            HTML에 한 줄 추가
          </h2>
          <Block>{`<script src="/_alp/sdk.js"></script>`}</Block>
          <p className="mt-2 text-xs text-zinc-400">
            이것만 넣으면 <code className="text-violet-500">ALPMultiplayer</code> 클래스를 바로 쓸 수 있습니다.
          </p>
        </div>

        {/* ── 2. 순서 주의 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <span className="text-lg">📋</span> 권장 순서
          </h2>
          <Block>{`const mp = new ALPMultiplayer();

mp.on('이벤트', 처리함수);  // 콜백 먼저 등록 (권장)
mp.onPlayers(처리함수);      // joinRoom 전후 어디서든 가능
await mp.joinRoom(...);      // 방 입장`}</Block>
          <p className="mt-2 text-xs text-zinc-400">
            순서 제한 없음. 단, 콜백을 먼저 등록하는 것이 일반적입니다.
          </p>
        </div>

        {/* ── 3. API 목록 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-4 font-bold">API 한눈에 보기</h2>
          <div className="space-y-3">

            {/* joinRoom */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">joinRoom(roomId, 내정보, 옵션?)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                방에 입장합니다. <strong className="text-zinc-800 dark:text-zinc-200">항상 마지막에 호출</strong>하세요.
                <br />
                <code className="text-xs text-zinc-400">roomId</code> — 같은 방에 들어갈 사람들끼리 동일하게 맞추면 됩니다.
                <br />
                <code className="text-xs text-zinc-400">내정보</code> — 이름, 색상 등 자유 형식. 다른 플레이어가 onPlayers로 받습니다.
                <br />
                <code className="text-xs text-zinc-400">{"{ password: '...' }"}</code> — 비밀번호 설정/입력. 틀리면 Promise reject.
              </div>
            </div>

            {/* on */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="green">on(이벤트명, 함수)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                다른 사람이 보낸 이벤트를 받습니다.
                <br />
                <span className="text-xs">joinRoom 전에 써도 됩니다.</span>
              </div>
            </div>

            {/* onPlayers */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="green">onPlayers(함수)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                누군가 들어오거나 나갈 때 호출됩니다. 현재 접속자 배열을 받습니다.
                <br />
                <span className="text-xs text-zinc-400">joinRoom 전후 어디서든 가능</span>
              </div>
            </div>

            {/* on predict */}
            <div className="flex flex-col gap-1 rounded-lg bg-violet-50 px-4 py-3 dark:bg-violet-950/20 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">on(이벤트, 함수, {"{"}predict:true{"}"})</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                위치 동기화 이벤트에 권장. SDK가 인터폴레이션 버퍼로 60fps 부드러운 위치를 계산해 callback을 호출합니다.
                게임 루프에서 별도 보간 코드 불필요.
              </div>
            </div>

            {/* send */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">send(이벤트명, 데이터)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                같은 방 모든 플레이어에게 이벤트를 보냅니다. 나 자신에게는 전달되지 않습니다.
                <br />
                <span className="text-xs text-red-500">초당 20번(50ms) 이하로 호출하세요.</span>
              </div>
            </div>

            {/* updatePlayer */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="zinc">updatePlayer(새정보)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                내 정보(이름, 점수 등)를 바꿉니다. 다른 플레이어의 onPlayers가 다시 호출됩니다.
              </div>
            </div>

            {/* leave */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="red">leave()</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                방에서 나갑니다. 다른 사람의 onPlayers에서 자동으로 제거됩니다.
              </div>
            </div>

            {/* joinVoice */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">joinVoice(options?)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                마이크 권한 요청 후 같은 방 전원과 WebRTC P2P 음성 연결합니다.
                <br />
                <span className="text-xs text-zinc-400">반환: <code>Promise&lt;MediaStream&gt;</code> · options: <code>{'{ iceServers, muted }'}</code></span>
              </div>
            </div>

            {/* setMuted / leaveVoice */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0 flex flex-col gap-1">
                <Chip color="zinc">setMuted(bool)</Chip>
                <Chip color="red">leaveVoice()</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <code>setMuted(true/false)</code> — 마이크 음소거/해제 (연결 유지).
                <br />
                <code>leaveVoice()</code> — 음성 종료. <code>leave()</code> 시 자동 호출.
              </div>
            </div>

            {/* onVoiceState */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="green">onVoiceState(cb)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                음성 연결 상태 변경 시 호출됩니다.
                <br />
                <span className="text-xs text-zinc-400"><code>{'cb({ type: "joined"|"left", peerId })'}</code></span>
              </div>
            </div>

            {/* isHost */}
            <div className="flex flex-col gap-1 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-950/20 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="yellow">isHost()</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                방의 최초 입장자(호스트)인지 반환합니다. <strong className="text-zinc-800 dark:text-zinc-200">몬스터 AI·충돌 판정은 호스트만 실행</strong>하고 결과를 send()로 브로드캐스트하세요.
                <br />
                <span className="text-xs text-zinc-400">호스트 퇴장 → onPlayers() 재호출 → 다시 isHost() 확인</span>
              </div>
            </div>

            {/* getRooms */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="green">getRooms(slug?)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                현재 게임에 열려 있는 방 목록을 가져옵니다.{" "}
                <code className="text-violet-500">ALPMultiplayer.getRooms()</code>로 인스턴스 없이 호출 가능합니다.
                <br />
                <span className="text-xs text-zinc-400">반환: <code>{"[{ id, count, hasPassword }]"}</code> — count 많은 순 정렬. hasPassword로 🔒 표시 가능.</span>
              </div>
            </div>

          </div>
        </div>

        {/* ── 4. 최소 예시 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-3 font-bold">복붙 예시 (그대로 쓰면 작동합니다)</h2>
          <Block>{`const mp    = new ALPMultiplayer();
const myId  = crypto.randomUUID();
const others = new Map(); // id → { x, y, color }

// predict: true — SDK가 인터폴레이션 버퍼로 60fps 부드러운 위치를 전달
mp.on('move', ({ id, x, y, color }) => {
  const o = others.get(id);
  if (o) { o.x = x; o.y = y; }  // SDK가 이미 보간된 위치 전달, 별도 lerp 불필요
}, { predict: true });

// 입장·퇴장 관리 (onPlayers가 others 목록 관리)
mp.onPlayers((players) => {
  const live = new Set(players.map(p => p.id));
  for (const id of others.keys()) if (!live.has(id)) others.delete(id);
  for (const p of players) {
    if (p.id !== myId && !others.has(p.id))
      others.set(p.id, { x: p.x || 0, y: p.y || 0, color: p.color });
  }
});

await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

// 키 누를 때 즉시 + 16ms 주기로 전송
const keys = new Set();
let lastSend = 0;
window.addEventListener('keydown', e => { keys.add(e.code);    sendPos(); });
window.addEventListener('keyup',   e => { keys.delete(e.code); sendPos(); });
function sendPos() { mp.send('move', { id: myId, color: myColor, x: myX, y: myY }); }

function loop(now) {
  // 이동 처리
  if (now - lastSend > 16) { sendPos(); lastSend = now; }
  // 렌더링 (others의 x,y는 SDK가 매 프레임 업데이트)
  requestAnimationFrame(loop);
}`}</Block>
        </div>

        {/* ── 5. predict 옵션 ── */}
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-800 dark:bg-violet-950/20">
          <h2 className="mb-3 font-bold">predict 옵션 — 인터폴레이션 버퍼</h2>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            <code className="text-violet-600">{"{ predict: true }"}</code>를 붙이면
            SDK가 수신된 위치들을 버퍼에 저장하고, 50ms 전 시점을 두 위치 사이에서 선형 보간해
            60fps로 callback을 호출합니다. 게임 루프에서 별도 보간 코드가 필요 없습니다.
          </p>
          <Block>{`// predict 없이 (직접 보간 필요)
mp.on('move', (p) => { other.tx = p.x; other.ty = p.y; });
// 게임 루프: other.x += (other.tx - other.x) * 0.2; // lerp 직접 처리

// predict 사용 (SDK가 자동 처리)
mp.on('move', (p) => { other.x = p.x; other.y = p.y; }, { predict: true });
// 게임 루프: 그냥 other.x, other.y 읽어서 렌더링만`}</Block>
        </div>

        {/* ── 6. 한도 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-1 font-bold">권장 인원 <span className="text-xs font-normal text-zinc-400">(방 1개 기준)</span></h2>
          <p className="mb-3 text-xs text-zinc-400">방을 여러 개 열면 게임 전체 인원은 그만큼 늘어납니다.</p>
          <div className="mb-4 overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800 text-sm">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">게임 타입</th>
                  <th className="px-3 py-2 text-left">권장 인원</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[
                  ["턴제 / 보드게임", "최대 50명"],
                  ["협동 / 탐험",     "최대 20명"],
                  ["실시간 액션",     "최대 10명"],
                ].map(([type, rec]) => (
                  <tr key={type}>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{type}</td>
                    <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">{rec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400">
            전체 동시접속: Free 200명 / Pro 500명<br/>
            메시지 전송: 초당 최대 20회 (50ms 간격)
          </p>
        </div>

        {/* ── 7. 흔한 실수 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-3 font-bold">흔한 실수</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { bad: "send() 반환값을 await로 기다림", fix: "send()는 void 반환. await 불필요" },
              { bad: "매 프레임 send() 호출 (60회/초)", fix: "50ms 타이머로 스로틀 처리" },
              { bad: "받은 위치로 바로 점프", fix: "lerp로 서서히 따라가게 처리" },
              { bad: "내 이벤트가 나한테도 올 것이라 가정", fix: "send()는 자신에게 전달되지 않음. 로컬에서 직접 처리" },
            ].map(({ bad, fix }) => (
              <div key={bad} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                <p className="text-xs text-red-500">✗ {bad}</p>
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ {fix}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 하단 */}
      <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-100 pt-6 dark:border-zinc-800">
        <Link
          href="/develop/multiplayer"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          ← 전체 가이드
        </Link>
        <a
          href="https://play.airliveplay.com/multi-arena/"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700"
        >
          ▶ 데모 플레이
        </a>
        <a
          href="/multi-arena.zip"
          download="multi-arena.zip"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          ⬇ 소스 다운로드
        </a>
      </div>

    </div>
  );
}
