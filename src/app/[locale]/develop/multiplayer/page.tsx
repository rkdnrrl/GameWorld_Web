import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

// 코드 블록 컴포넌트
function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm leading-relaxed text-green-300 dark:bg-black">
      <code>{children}</code>
    </pre>
  );
}

// 섹션 헤더
function Section({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div id={id} className="mb-3 mt-10 scroll-mt-20 border-b border-zinc-200 pb-2 dark:border-zinc-700">
      <h2 className="text-xl font-bold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}

// API 메서드 카드
function ApiMethod({
  signature,
  returns,
  desc,
  params,
}: {
  signature: string;
  returns: string;
  desc: string;
  params?: { name: string; type: string; desc: string }[];
}) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
        <code className="font-mono text-sm font-semibold text-violet-700 dark:text-violet-300">{signature}</code>
        <span className="font-mono text-xs text-zinc-400">→ {returns}</span>
      </div>
      <div className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
        <p>{desc}</p>
        {params && params.length > 0 && (
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="pr-4 pb-1 font-medium">파라미터</th>
                <th className="pr-4 pb-1 font-medium">타입</th>
                <th className="pb-1 font-medium">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {params.map((p) => (
                <tr key={p.name}>
                  <td className="py-1 pr-4 font-mono text-violet-600 dark:text-violet-400">{p.name}</td>
                  <td className="py-1 pr-4 font-mono text-zinc-500">{p.type}</td>
                  <td className="py-1 text-zinc-600 dark:text-zinc-400">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default async function MultiplayGuide() {
  const t = await getTranslations("Develop");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* 상단 네비 */}
      <div className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/develop" className="hover:text-blue-500">{t("title")}</Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-200">멀티플레이 가이드</span>
      </div>

      {/* 히어로 */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 p-8 text-white">
        <div className="mb-2 text-3xl">🎮</div>
        <h1 className="text-3xl font-bold">멀티플레이 가이드</h1>
        <p className="mt-2 text-violet-200">
          ALP 플랫폼의 <strong className="text-white">ALPMultiplayer SDK</strong>를 사용해
          게임에 실시간 멀티플레이를 3단계로 추가하세요.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {["Durable Objects WebSocket", "Broadcast", "Presence", "자동 방 격리"].map((tag) => (
            <span key={tag} className="rounded-full bg-white/20 px-3 py-0.5">{tag}</span>
          ))}
        </div>
        {/* 데모 + 다운로드 버튼 */}
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="https://play.airliveplay.com/multi-arena/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow hover:bg-violet-50"
          >
            ▶ 데모 플레이
          </a>
          <Link
            href="/develop/multiplayer/reference"
            className="flex items-center gap-2 rounded-lg bg-white/25 px-4 py-2 text-sm font-bold text-white hover:bg-white/35"
          >
            ⚡ 빠른 참조
          </Link>
          <a
            href="/multi-arena.zip"
            download="multi-arena.zip"
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30"
          >
            ⬇ 소스 다운로드 (.zip)
          </a>
          <a
            href="/alp-multiplayer-sdk.md"
            download="alp-multiplayer-sdk.md"
            className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
          >
            🤖 AI 가이드 다운로드
          </a>
        </div>
      </div>

      {/* 목차 */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">목차</p>
        <ol className="space-y-1 text-sm text-blue-600 dark:text-blue-400">
          {[
            ["how-it-works", "작동 원리"],
            ["quickstart", "시작하기 (3단계)"],
            ["api", "API 레퍼런스"],
            ["full-example", "완성 예시"],
            ["room-list", "방 목록 (로비)"],
            ["limits", "권장 인원 & 팁"],
            ["faq", "자주 묻는 질문"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:underline">{label}</a>
            </li>
          ))}
        </ol>
      </div>

      {/* 1. 작동 원리 */}
      <Section id="how-it-works" title="작동 원리" />
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        게임은 <strong>정적 파일</strong>(HTML/JS)로 R2에 호스팅됩니다.
        플레이어의 브라우저가 Cloudflare의 <strong>Durable Objects</strong>에 WebSocket으로 직접 연결해
        실시간 데이터를 주고받습니다. 별도 서버 없이 멀티플레이를 구현할 수 있습니다.
      </p>
      <Code>{`게임 HTML
  └─ <script src="/_alp/sdk.js">   ← Cloudflare Worker가 SDK 제공
       └─ ALPMultiplayer 클래스

게임 JS
  └─ new ALPMultiplayer()
       └─ joinRoom("room1")
            └─ WebSocket → GameRoom (Durable Object)  ←→  다른 플레이어의 브라우저`}</Code>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        {[
          { emoji: "📡", title: "Broadcast", desc: "실시간 이벤트 전송\n(이동, 공격, 채팅 등)" },
          { emoji: "👥", title: "Presence", desc: "접속자 목록 자동 동기화\n(입장·퇴장 감지)" },
          { emoji: "🔒", title: "자동 격리", desc: "game:{slug}:{roomId}\n채널로 게임별 완전 분리" },
        ].map((c) => (
          <div key={c.title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="text-2xl">{c.emoji}</div>
            <div className="mt-1 font-semibold">{c.title}</div>
            <div className="mt-1 whitespace-pre-line text-xs text-zinc-500">{c.desc}</div>
          </div>
        ))}
      </div>

      {/* 2. 시작하기 */}
      <Section id="quickstart" title="시작하기 (3단계)" />

      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">1</span>
        <span className="font-semibold">index.html에 SDK 한 줄 추가</span>
      </div>
      <Code>{`<head>
  <!-- 다른 스크립트보다 먼저 로드 -->
  <script src="/_alp/sdk.js"></script>
</head>`}</Code>
      <p className="mb-6 mt-2 text-xs text-zinc-400">
        ※ SDK는 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/_alp/sdk.js</code> 경로로
        Cloudflare Worker가 자동으로 제공합니다. Supabase 자격증명은 서버에서 주입되므로 코드에 직접 작성하지 않아도 됩니다.
      </p>

      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</span>
        <span className="font-semibold">콜백 등록</span>
      </div>
      <Code>{`const mp = new ALPMultiplayer();

mp.on("move", (payload) => {
  // 다른 플레이어의 이벤트 수신
  console.log("상대방 이동:", payload);
});

mp.onPlayers((players) => {
  // 접속자 목록 변경 시 호출
  console.log("현재 접속자:", players.length, "명");
});`}</Code>

      <div className="mb-2 mt-6 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">3</span>
        <span className="font-semibold">방 입장 후 이벤트 전송</span>
      </div>
      <Code>{`await mp.joinRoom("room1", {
  userId: "플레이어-고유-ID",
  name:   "플레이어1",
  x: 100, y: 200        // 다른 플레이어가 onPlayers()로 받을 초기 정보
});

// 이제 이벤트를 보낼 수 있습니다
mp.send("move", { x: 150, y: 300 });`}</Code>

      {/* 3. API 레퍼런스 */}
      <Section id="api" title="API 레퍼런스" />

      <ApiMethod
        signature="joinRoom(roomId, playerInfo?)"
        returns="Promise<void>"
        desc="지정한 방에 입장하고 Presence에 내 정보를 등록합니다. Cloudflare Durable Objects에 WebSocket으로 연결합니다."
        params={[
          { name: "roomId",     type: "string", desc: "방 이름 (같은 slug + roomId면 같은 방에 연결됨)" },
          { name: "playerInfo", type: "object?", desc: "Presence에 등록할 내 정보 (자유 형식 JSON). 다른 플레이어가 onPlayers()로 수신." },
        ]}
      />

      <ApiMethod
        signature="on(event, callback, options?)"
        returns="this"
        desc="다른 플레이어가 send()로 보낸 이벤트를 수신합니다. joinRoom() 전후 어느 시점에도 호출 가능합니다."
        params={[
          { name: "event",    type: "string",           desc: "이벤트 이름 (예: 'move', 'attack', 'chat')" },
          { name: "callback", type: "(payload) => void", desc: "수신 시 호출될 함수. payload는 send()에서 넘긴 객체." },
          { name: "options.predict", type: "boolean?",  desc: "true 시 인터폴레이션 버퍼 활성화. 60fps로 callback을 호출하며 수신 위치 사이를 선형 보간해 완전히 부드러운 이동을 제공. 위치 동기화 이벤트에 권장." },
          { name: "options.id/x/y",  type: "string?",  desc: "predict 사용 시 페이로드의 식별자·위치 필드명. 기본값: 'id', 'x', 'y'" },
        ]}
      />

      <ApiMethod
        signature="onPlayers(callback)"
        returns="this"
        desc="방 접속자 목록이 변경될 때마다 호출됩니다. joinRoom() 전후 어느 시점에도 호출 가능합니다."
        params={[
          { name: "callback", type: "(players: object[]) => void", desc: "players는 각 플레이어의 playerInfo 배열 (퇴장한 플레이어는 자동 제거됨)" },
        ]}
      />

      <ApiMethod
        signature="send(event, payload)"
        returns="void"
        desc="같은 방의 다른 모든 플레이어에게 이벤트를 전송합니다. 자기 자신에게는 전달되지 않습니다."
        params={[
          { name: "event",   type: "string", desc: "이벤트 이름" },
          { name: "payload", type: "object", desc: "전송할 데이터 (JSON 직렬화 가능한 객체)" },
        ]}
      />

      <ApiMethod
        signature="updatePlayer(info)"
        returns="void"
        desc="Presence에 등록된 내 정보를 업데이트합니다. 다른 플레이어의 onPlayers() 콜백이 재호출됩니다."
        params={[
          { name: "info", type: "object", desc: "업데이트할 정보 (이전 정보를 완전히 교체)" },
        ]}
      />

      <ApiMethod
        signature="leave()"
        returns="Promise<void>"
        desc="방을 퇴장합니다. 다른 플레이어의 onPlayers()에서 자동으로 제거됩니다. 페이지 이탈 시 자동 처리됩니다."
      />

      {/* 4. 완성 예시 */}
      <Section id="full-example" title="완성 예시" sub="플레이어가 서로의 위치를 실시간으로 볼 수 있는 최소 예시" />
      <Code>{`<!DOCTYPE html>
<html>
<head>
  <script src="/_alp/sdk.js"></script>
</head>
<body>
  <canvas id="c" width="600" height="400" style="background:#111"></canvas>
  <script>
    const ctx     = document.getElementById('c').getContext('2d');
    const myId    = crypto.randomUUID();
    const myColor = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
    let myX = 300, myY = 200, mp = null;

    const others = new Map(); // id → { x, y, color }

    async function main() {
      mp = new ALPMultiplayer();

      // predict: true — SDK가 인터폴레이션 버퍼로 60fps 부드러운 위치를 계산해 callback 호출
      mp.on('move', ({ id, x, y, color }) => {
        const o = others.get(id);
        if (o) { o.x = x; o.y = y; }  // SDK가 이미 보간된 위치를 전달
      }, { predict: true });

      // 입장·퇴장 관리
      mp.onPlayers((players) => {
        const live = new Set(players.map(p => p.id));
        for (const id of others.keys()) if (!live.has(id)) others.delete(id);
        for (const p of players) {
          if (p.id !== myId && !others.has(p.id))
            others.set(p.id, { x: p.x || 300, y: p.y || 200, color: p.color });
        }
      });

      await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

      // 키 누를 때 즉시 전송 + 16ms 주기 전송
      const keys = new Set();
      let lastSend = 0;
      window.addEventListener('keydown', e => { keys.add(e.code);    sendPos(); });
      window.addEventListener('keyup',   e => { keys.delete(e.code); sendPos(); });

      function sendPos() {
        if (mp) mp.send('move', {
          id: myId, color: myColor,
          x: Math.round(myX), y: Math.round(myY),
        });
      }

      function loop(now) {
        if (keys.has('ArrowLeft'))  myX -= 3;
        if (keys.has('ArrowRight')) myX += 3;
        if (keys.has('ArrowUp'))    myY -= 3;
        if (keys.has('ArrowDown'))  myY += 3;
        if (now - lastSend > 16) { sendPos(); lastSend = now; }

        ctx.fillStyle = '#111'; ctx.fillRect(0,0,600,400);
        for (const o of others.values()) dot(o.x, o.y, o.color);
        dot(myX, myY, myColor);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }

    function dot(x, y, color) {
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
    }

    main();
  </script>
</body>
</html>`}</Code>

      {/* 5. 방 목록 (로비) */}
      <Section id="room-list" title="방 목록 (로비)" sub="현재 열려 있는 방 목록을 가져와 로비 화면을 만드세요" />
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ALPMultiplayer.getRooms()</code>를 호출하면
        현재 게임에 열려 있는 방 목록과 각 방의 인원 수를 받을 수 있습니다.
        인스턴스 없이도 호출 가능한 정적 메서드입니다.
      </p>
      <Code>{`// 방 목록 가져오기 (인스턴스 없이 호출 가능)
const rooms = await ALPMultiplayer.getRooms();
// → [{ id: "room1", count: 3 }, { id: "room2", count: 1 }]
//   count 많은 순으로 정렬됨

// 방 선택 후 입장
const mp = new ALPMultiplayer();
await mp.joinRoom(rooms[0].id, { id: myId, name: "Player" });`}</Code>

      <p className="mb-3 mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        아래는 로비 화면을 구현하는 최소 예시입니다. 5초마다 자동 갱신하거나 버튼으로 수동 갱신할 수 있습니다.
      </p>
      <Code>{`<!DOCTYPE html>
<html>
<head>
  <script src="/_alp/sdk.js"></script>
</head>
<body>
  <h2>방 목록</h2>
  <ul id="room-list"></ul>
  <button id="new-room-btn">+ 새 방 만들기</button>
  <button id="join-btn">입장</button>

  <script>
    const listEl = document.getElementById('room-list');
    let selectedId = null;

    async function refreshRooms() {
      const rooms = await ALPMultiplayer.getRooms();

      if (rooms.length === 0) {
        listEl.innerHTML = '<li>열려 있는 방이 없습니다.</li>';
        return;
      }

      listEl.innerHTML = rooms.map(r =>
        \`<li data-id="\${r.id}" style="cursor:pointer">
          🏠 \${r.id}  (\${r.count}명)
        </li>\`
      ).join('');

      listEl.querySelectorAll('li[data-id]').forEach(li => {
        li.addEventListener('click', () => {
          listEl.querySelectorAll('li').forEach(x => x.style.fontWeight = '');
          li.style.fontWeight = 'bold';
          selectedId = li.dataset.id;
        });
      });
    }

    // 5초마다 자동 갱신
    refreshRooms();
    setInterval(refreshRooms, 5000);

    // 새 방 만들기 (랜덤 ID)
    document.getElementById('new-room-btn').addEventListener('click', () => {
      enterRoom('room-' + Math.random().toString(36).slice(2, 7));
    });

    // 선택한 방 입장
    document.getElementById('join-btn').addEventListener('click', () => {
      if (selectedId) enterRoom(selectedId);
    });

    async function enterRoom(roomId) {
      const mp = new ALPMultiplayer();
      await mp.joinRoom(roomId, { id: crypto.randomUUID(), name: 'Player' });
      // 로비 숨기기, 게임 화면 표시...
    }
  </script>
</body>
</html>`}</Code>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-semibold text-blue-700 dark:text-blue-300">💡 참고</p>
        <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>• 실제로 플레이어가 접속 중인 방만 목록에 표시됩니다. 빈 방은 자동 제거됩니다.</li>
          <li>• <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">count</code>가 0이 되면 최대 2분 이내에 목록에서 사라집니다.</li>
          <li>• 방 이름을 직접 정하거나 랜덤 ID를 써서 "새 방 만들기"를 구현하세요.</li>
        </ul>
      </div>

      {/* 6. 권장 인원 & 팁 */}
      <Section id="limits" title="권장 인원 & 팁" />
      <p className="mb-4 text-sm text-zinc-500">
        아래 인원은 <strong>방(room) 하나당</strong> 권장 수치입니다.
        방을 여러 개 만들면 게임 전체 인원은 그만큼 늘어납니다.
      </p>
      <div className="mb-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">게임 타입</th>
              <th className="px-4 py-2 text-left font-medium">권장 방 인원</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[
              ["턴제 (보드, 퍼즐)", "최대 50명"],
              ["협동·탐험", "최대 20명"],
              ["실시간 액션", "최대 10명"],
            ].map(([type, rec]) => (
              <tr key={type as string}>
                <td className="px-4 py-2">{type}</td>
                <td className="px-4 py-2 font-medium text-green-600 dark:text-green-400">{rec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {[
          { icon: "📨", text: "send()는 키 입력 시 즉시 + 16ms 간격으로 호출하세요. 위치처럼 자주 바뀌는 값에 적합합니다." },
          { icon: "🎯", text: "다른 플레이어 위치를 부드럽게 표시하려면 on()에 { predict: true } 옵션을 사용하세요. SDK가 인터폴레이션 버퍼로 자동 처리합니다." },
          { icon: "🏠", text: "같은 방에 들어가려면 roomId를 똑같이 맞추세요. 다른 roomId면 별개의 방입니다." },
        ].map(({ icon, text }) => (
          <div key={text} className="flex gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
            <span>{icon}</span>
            <span className="text-zinc-600 dark:text-zinc-400">{text}</span>
          </div>
        ))}
      </div>

      {/* 6. FAQ */}
      <Section id="faq" title="자주 묻는 질문" />
      <div className="space-y-4">
        {[
          {
            q: "onPlayers()는 joinRoom() 전에 호출해야 하나요?",
            a: "아닙니다. joinRoom() 전후 어느 시점에도 호출 가능합니다. 이미 방에 입장한 상태에서 onPlayers()를 등록하면 현재 접속자 목록을 즉시 전달받습니다.",
          },
          {
            q: "방이 자동으로 생성/삭제되나요?",
            a: "네. joinRoom()을 호출하면 채널이 생성되고, 모든 플레이어가 leave()하거나 페이지를 떠나면 채널이 자동으로 사라집니다. DB에 별도 저장이 필요하지 않습니다.",
          },
          {
            q: "내가 보낸 이벤트가 나에게도 오나요?",
            a: "아닙니다. send()로 보낸 이벤트는 자기 자신에게 전달되지 않습니다. 내 상태는 로컬에서 직접 관리하세요.",
          },
          {
            q: "게임 상태(DB 저장)는 어떻게 하나요?",
            a: "실시간 멀티플레이는 ALPMultiplayer로, 영구 저장이 필요한 게임 데이터는 플랫폼의 game_state API를 사용하세요. PUT /api/game-state/{slug} 로 저장, GET으로 불러옵니다.",
          },
        ].map(({ q, a }) => (
          <details key={q} className="group rounded-lg border border-zinc-200 dark:border-zinc-700">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
              <span className="mr-2 text-zinc-400 group-open:hidden">▶</span>
              <span className="mr-2 hidden text-zinc-400 group-open:inline">▼</span>
              {q}
            </summary>
            <p className="border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">{a}</p>
          </details>
        ))}
      </div>

      {/* 하단 링크 */}
      <div className="mt-12 flex flex-wrap gap-3 border-t border-zinc-100 pt-8 dark:border-zinc-800">
        <Link
          href="/develop"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          ← 개발 홈
        </Link>
        <a
          href="/alp-multiplayer-sdk.md"
          download="alp-multiplayer-sdk.md"
          className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
        >
          🤖 AI 가이드 다운로드 (.md)
        </a>
        <a
          href="https://developers.cloudflare.com/durable-objects/"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Cloudflare Durable Objects 문서 ↗
        </a>
      </div>
    </div>
  );
}
