import { Link } from "@/i18n/navigation";

function Chip({ children, color = "zinc" }: { children: string; color?: "violet" | "green" | "red" | "zinc" | "yellow" }) {
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
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-5 dark:border-yellow-700 dark:bg-yellow-950/30">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-yellow-800 dark:text-yellow-300">
            <span className="text-lg">⚠️</span> 콜백 등록 순서
          </h2>
          <Block>{`const mp = new ALPMultiplayer();

// ✅ 이 순서대로
mp.on('이벤트', 처리함수);  // 1st
mp.onPlayers(처리함수);      // 2nd
await mp.joinRoom(...);      // 3rd ← 마지막`}</Block>
          <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-400">
            <code>onPlayers</code>를 joinRoom 뒤에 쓰면 작동 안 합니다.
          </p>
        </div>

        {/* ── 3. API 목록 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-4 font-bold">API 한눈에 보기</h2>
          <div className="space-y-3">

            {/* joinRoom */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">joinRoom(roomId, 내정보)</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                방에 입장합니다. <strong className="text-zinc-800 dark:text-zinc-200">항상 마지막에 호출</strong>하세요.
                <br />
                <code className="text-xs text-zinc-400">roomId</code> — 같은 방에 들어갈 사람들끼리 동일하게 맞추면 됩니다.
                <br />
                <code className="text-xs text-zinc-400">내정보</code> — 이름, 색상 등 자유 형식. 다른 플레이어가 onPlayers로 받습니다.
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
                <span className="text-xs text-yellow-600 dark:text-yellow-400">⚠ joinRoom 전에만 사용 가능</span>
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

          </div>
        </div>

        {/* ── 4. 최소 예시 ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-3 font-bold">복붙 예시 (그대로 쓰면 작동합니다)</h2>
          <Block>{`const mp    = new ALPMultiplayer();
const myId  = crypto.randomUUID();
const others = new Map(); // id → { x, y, tx, ty }

// 1. 콜백 먼저
mp.on('move', ({ id, x, y }) => {
  const o = others.get(id);
  if (o) { o.tx = x; o.ty = y; }            // 목표 위치만 갱신
  else     others.set(id, { x, y, tx: x, ty: y });
});

mp.onPlayers((players) => {
  const ids = new Set(players.map(p => p.id));
  for (const id of others.keys())
    if (!ids.has(id)) others.delete(id);    // 퇴장 플레이어 제거
});

// 2. 입장
await mp.joinRoom('room1', { id: myId, x: 0, y: 0 });

// 3. 게임 루프에서
function loop(now) {
  // 부드러운 이동 (lerp)
  for (const o of others.values()) {
    o.x += (o.tx - o.x) * 0.2;
    o.y += (o.ty - o.y) * 0.2;
  }
  // 50ms마다 내 위치 전송
  if (now - lastSend > 50) {
    mp.send('move', { id: myId, x: myX, y: myY });
    lastSend = now;
  }
  requestAnimationFrame(loop);
}`}</Block>
        </div>

        {/* ── 5. 끊김 없이 만들기 (lerp) ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 font-bold">끊김 없이 만들기 (lerp)</h2>
          <p className="mb-3 text-sm text-zinc-500">
            네트워크는 50ms마다 위치를 보내서 뚝뚝 끊깁니다.
            <code className="mx-1 text-violet-500">tx/ty</code>(목표)와
            <code className="mx-1 text-violet-500">x/y</code>(렌더)를 분리하면 부드러워집니다.
          </p>
          <Block>{`// 받을 때 → 목표만 갱신
other.tx = payload.x;
other.ty = payload.y;

// 매 프레임 → 렌더 위치를 목표로 서서히 이동
other.x += (other.tx - other.x) * 0.2;
other.y += (other.ty - other.y) * 0.2;

// 그리기는 other.x, other.y 기준으로`}</Block>
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
              { bad: "joinRoom() 후 onPlayers() 호출", fix: "onPlayers()를 joinRoom() 앞으로 이동" },
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
