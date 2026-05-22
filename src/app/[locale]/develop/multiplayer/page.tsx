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
            ["game-objects", "게임 오브젝트 동기화 (몬스터·투사체)"],
            ["voice", "음성 채팅"],
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
        signature="joinRoom(roomId, playerInfo?, options?)"
        returns="Promise<void>"
        desc="지정한 방에 입장하고 Presence에 내 정보를 등록합니다. Cloudflare Durable Objects에 WebSocket으로 연결합니다. 서버에서 welcome 메시지를 받은 뒤 resolve됩니다."
        params={[
          { name: "roomId",           type: "string",  desc: "방 이름 (같은 slug + roomId면 같은 방에 연결됨)" },
          { name: "playerInfo",       type: "object?", desc: "Presence에 등록할 내 정보 (자유 형식 JSON). 다른 플레이어가 onPlayers()로 수신." },
          { name: "options.password", type: "string?", desc: "방 비밀번호. 첫 입장자가 설정값으로 고정됩니다. 이후 입장자가 틀리면 Promise가 reject됩니다." },
        ]}
      />

      <ApiMethod
        signature="ALPMultiplayer.getRooms(slug?)"
        returns="Promise<Room[]>"
        desc="현재 게임에 열려 있는 방 목록을 가져옵니다. 인스턴스 없이 정적 메서드로 호출 가능합니다. 인원 많은 순으로 정렬됩니다."
        params={[
          { name: "slug",   type: "string?", desc: "게임 slug. 생략 시 현재 URL에서 자동 감지됩니다." },
          { name: "→ id",   type: "string",  desc: "방 ID" },
          { name: "→ count",       type: "number",  desc: "현재 접속 인원" },
          { name: "→ hasPassword", type: "boolean", desc: "비밀번호 필요 여부 (로비 UI에서 🔒 표시에 활용)" },
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

      <ApiMethod
        signature="isHost()"
        returns="boolean"
        desc="현재 클라이언트가 방의 호스트(가장 먼저 입장한 플레이어)인지 반환합니다. 호스트만 몬스터 AI·충돌 판정 등 게임 오브젝트를 제어하고 결과를 브로드캐스트해야 합니다. 호스트 퇴장 시 onPlayers()가 재호출되므로 그 시점에 다시 확인하세요."
        params={[
          { name: "playerInfo.id", type: "string (필수)", desc: "joinRoom()에 넘긴 playerInfo에 id 필드가 있어야 isHost() 판별이 가능합니다." },
        ]}
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

      {/* 5. 게임 오브젝트 동기화 */}
      <Section id="game-objects" title="게임 오브젝트 동기화" sub="몬스터·투사체·함정 등 플레이어가 아닌 오브젝트를 동기화하는 방법" />

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <p className="font-semibold text-amber-700 dark:text-amber-300">⚠️ 흔한 실수</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          모든 클라이언트가 독립적으로 몬스터 AI를 실행하면 위치가 서로 달라집니다.
          반드시 <strong>한 클라이언트(호스트)만</strong> 오브젝트를 제어하고 나머지는 받아서 렌더링해야 합니다.
        </p>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mp.isHost()</code>는 현재 방에서
        가장 먼저 입장한 플레이어(호스트)인지 반환합니다.
        호스트가 퇴장하면 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">onPlayers()</code>가
        재호출되므로 그 시점에 다시 확인하면 됩니다.
      </p>

      <Code>{`// ── 호스트: 몬스터 AI 실행 + 위치 브로드캐스트 ──────────────
function gameTick() {
  if (mp.isHost()) {
    // 몬스터 AI 업데이트 (위치, 체력 등)
    for (const m of monsters.values()) {
      m.x += m.vx;
      m.y += m.vy;
      mp.send('monster-move', { id: m.id, x: m.x, y: m.y, hp: m.hp });
    }
  }
  // 렌더링은 모든 클라이언트가 동일하게
  render();
  requestAnimationFrame(gameTick);
}

// ── 모든 클라이언트: 호스트가 보낸 위치를 받아 렌더링 ──────
// predict: true — 몬스터도 플레이어처럼 부드러운 보간 적용
mp.on('monster-move', (p) => {
  const m = monsters.get(p.id);
  if (m) { m.x = p.x; m.y = p.y; m.hp = p.hp; }
}, { predict: true });

// ── 호스트 교체: 기존 호스트가 나가면 자동으로 다음 플레이어가 호스트 ──
mp.onPlayers((players) => {
  // 이 콜백이 호출될 때 mp.isHost()가 이미 새 값으로 업데이트됨
  console.log(mp.isHost() ? '내가 호스트가 됐습니다' : '호스트 아님');
});`}</Code>

      <p className="mb-3 mt-6 font-semibold text-sm text-zinc-700 dark:text-zinc-200">공격·투사체 동기화</p>
      <Code>{`// ── 공격 발사: 호스트만 판정, 클라이언트는 시각 효과만 ─────

// 모든 클라이언트: 공격 이벤트 전송 (내가 쐈다는 신호)
function fireProjectile(x, y, dir) {
  // 로컬 시각 효과 (즉시 표시)
  spawnEffect(x, y);
  // 호스트에게 알림
  mp.send('fire', { shooterId: myId, x, y, dir });
}

// 호스트만: 피격 판정 후 결과를 브로드캐스트
mp.on('fire', ({ shooterId, x, y, dir }) => {
  if (!mp.isHost()) return;   // 호스트가 아니면 무시

  const bullet = spawnBullet(x, y, dir);
  bullets.push(bullet);
  mp.send('bullet-spawn', { id: bullet.id, x, y, dir });
});

// 호스트: 매 프레임 총알 이동 + 피격 체크
function updateBullets() {
  if (!mp.isHost()) return;
  for (const b of bullets) {
    b.x += Math.cos(b.dir) * b.speed;
    b.y += Math.sin(b.dir) * b.speed;
    const hit = checkHit(b);
    if (hit) {
      mp.send('hit', { targetId: hit.id, damage: b.damage });
      bullets.splice(bullets.indexOf(b), 1);
    } else {
      mp.send('bullet-move', { id: b.id, x: b.x, y: b.y });
    }
  }
}

// 모든 클라이언트: 피격 결과 수신
mp.on('hit', ({ targetId, damage }) => {
  const target = getEntity(targetId);
  if (target) target.hp -= damage;
});`}</Code>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {[
          { icon: "👑", title: "호스트가 하는 것", items: ["몬스터 AI 실행", "충돌 판정", "피격 판정", "결과 브로드캐스트"] },
          { icon: "🖥️", title: "모든 클라이언트가 하는 것", items: ["호스트 데이터 수신", "위치 보간 (predict:true)", "렌더링", "내 입력 전송"] },
        ].map(({ icon, title, items }) => (
          <div key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-2 font-semibold">{icon} {title}</p>
            <ul className="space-y-1 text-xs text-zinc-500">
              {items.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        ))}
      </div>

      {/* 6. 방 목록 (로비) */}
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
        아래는 로비 화면을 구현하는 최소 예시입니다. 5초마다 자동 갱신하며, 비밀번호 있는 방은 🔒로 표시됩니다.
      </p>
      <Code>{`async function loadRooms() {
  const rooms = await ALPMultiplayer.getRooms();
  // rooms: [{ id, count, hasPassword }, ...]   ← hasPassword로 🔒 표시

  list.innerHTML = rooms.map(r =>
    \`<li data-id="\${r.id}" data-pw="\${r.hasPassword}">
      \${r.hasPassword ? '🔒 ' : ''}\${r.id}  (\${r.count}명)
    </li>\`
  ).join('') || '<li>열려 있는 방이 없습니다.</li>';

  list.querySelectorAll('li[data-id]').forEach(li => {
    li.addEventListener('click', () => {
      roomInput.value = li.dataset.id;
      // 비밀번호 있는 방 클릭 시 비밀번호 입력창 표시
      pwInput.style.display = li.dataset.pw === 'true' ? '' : 'none';
    });
  });
}
setInterval(loadRooms, 5000);
loadRooms();`}</Code>

      <p className="mb-3 mt-6 font-semibold text-sm text-zinc-700 dark:text-zinc-200">비밀번호 방 만들기 & 입장</p>
      <Code>{`// 비밀번호 있는 방 만들기 — 첫 입장자가 비밀번호를 설정합니다
await mp.joinRoom('room1', playerInfo, { password: '1234' });

// 비밀번호 있는 방 입장 — 틀리면 Promise가 reject됩니다
try {
  await mp.joinRoom('room1', playerInfo, { password: userInput });
} catch (e) {
  // e.message === '[ALP] 비밀번호가 틀렸습니다.'
  alert('비밀번호가 틀렸습니다.');
}

// 비밀번호 없는 방 — options 생략 또는 password: ''
await mp.joinRoom('room2', playerInfo);`}</Code>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-semibold text-blue-700 dark:text-blue-300">💡 참고</p>
        <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>• 비밀번호는 <strong>첫 입장자</strong>가 설정합니다. 이후 입장자는 같은 비밀번호를 입력해야 합니다.</li>
          <li>• <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">getRooms()</code>는 비밀번호 자체가 아닌 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">hasPassword: true/false</code>만 반환합니다.</li>
          <li>• 빈 방은 자동 제거됩니다 (count = 0이 되면 최대 2분 이내).</li>
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

      {/* 음성 채팅 */}
      <Section id="voice" title="음성 채팅" sub="같은 방 플레이어끼리 WebRTC P2P 음성 연결 — 서버 미경유, 무료" />

      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mp.joinVoice()</code>를 호출하면
        마이크 권한을 요청하고 현재 방의 모든 플레이어와 WebRTC로 직접 연결합니다.
        오디오 데이터는 서버를 거치지 않아 추가 비용이 없습니다.
      </p>

      <Code>{`const mp = new ALPMultiplayer();
await mp.joinRoom('room1', { id: myId, name: '플레이어1' });

// 음성 채팅 참여 (브라우저 마이크 권한 팝업 표시)
await mp.joinVoice();

// 누가 연결/해제됐는지 감지
mp.onVoiceState(({ type, peerId }) => {
  console.log(type === 'joined' ? peerId + ' 음성 연결' : peerId + ' 음성 해제');
});

// 음소거 토글
muteBtn.addEventListener('click', () => {
  muted = !muted;
  mp.setMuted(muted);
  muteBtn.textContent = muted ? '🔇 음소거 해제' : '🔊 음소거';
});

// 음성 종료 (mp.leave() 호출 시 자동 처리됨)
mp.leaveVoice();`}</Code>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        {[
          { icon: "🎙️", title: "joinVoice()", desc: "마이크 권한 요청 후 방 전원과 P2P 연결" },
          { icon: "🔇", title: "setMuted(bool)", desc: "마이크 음소거 / 해제 (연결은 유지)" },
          { icon: "📡", title: "onVoiceState(cb)", desc: "joined / left 이벤트로 UI 업데이트" },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="font-semibold">{icon} <code className="text-violet-600 dark:text-violet-400 text-xs">{title}</code></p>
            <p className="mt-1 text-xs text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-semibold text-blue-700 dark:text-blue-300">💡 참고</p>
        <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>• 오디오는 <strong>P2P 직접 전송</strong> — Cloudflare Worker/DO를 거치지 않아 무료입니다.</li>
          <li>• 기업망·학교 등 엄격한 NAT 환경에서는 TURN 서버가 필요할 수 있습니다. <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">joinVoice({'{ iceServers: [...] }'})</code>로 전달하세요.</li>
          <li>• 메시 구조(모두가 모두에게 연결)라 <strong>10명 이하</strong> 권장입니다.</li>
          <li>• <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mp.leave()</code> 호출 시 음성도 자동 종료됩니다.</li>
        </ul>
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
            q: "비밀번호 방을 만들 수 있나요?",
            a: "네. joinRoom()의 세 번째 인자에 { password: '비밀번호' }를 전달하면 됩니다. 첫 입장자가 비밀번호를 설정하며, 이후 입장자가 틀리면 Promise가 reject됩니다. getRooms()의 hasPassword 필드로 로비에서 🔒 표시를 할 수 있습니다.",
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
