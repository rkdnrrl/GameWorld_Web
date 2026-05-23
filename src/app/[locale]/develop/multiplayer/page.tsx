import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm leading-relaxed text-green-300 dark:bg-black">
      <code>{children}</code>
    </pre>
  );
}

function Section({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div id={id} className="mb-3 mt-10 scroll-mt-20 border-b border-zinc-200 pb-2 dark:border-zinc-700">
      <h2 className="text-xl font-bold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
    </div>
  );
}

function ApiMethod({
  signature, returns, desc, params, paramHeader, typeHeader, descHeader,
}: {
  signature: string; returns: string; desc: string;
  params?: { name: string; type: string; desc: string }[];
  paramHeader: string; typeHeader: string; descHeader: string;
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
                <th className="pr-4 pb-1 font-medium">{paramHeader}</th>
                <th className="pr-4 pb-1 font-medium">{typeHeader}</th>
                <th className="pb-1 font-medium">{descHeader}</th>
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
  const [td, t] = await Promise.all([
    getTranslations("MultiplayGuide"),
    getTranslations("Develop"),
  ]);

  const ph = { paramHeader: td("paramHeader"), typeHeader: td("typeHeader"), descHeader: td("descHeader") };

  const toc = [
    ["how-it-works", td("toc0")], ["quickstart",   td("toc1")],
    ["api",          td("toc2")], ["full-example",  td("toc3")],
    ["game-objects", td("toc4")], ["voice",         td("toc5")],
    ["room-list",    td("toc6")], ["limits",        td("toc7")],
    ["faq",          td("toc8")],
  ];

  const feats = [
    { emoji: "📡", title: td("feat1Title"), desc: td("feat1Desc") },
    { emoji: "👥", title: td("feat2Title"), desc: td("feat2Desc") },
    { emoji: "🔒", title: td("feat3Title"), desc: td("feat3Desc") },
  ];

  const roles = [
    { icon: "👑", title: td("roleHostTitle"), items: [td("roleHostItem0"), td("roleHostItem1"), td("roleHostItem2"), td("roleHostItem3")] },
    { icon: "🖥️", title: td("roleAllTitle"),  items: [td("roleAllItem0"),  td("roleAllItem1"),  td("roleAllItem2"),  td("roleAllItem3")] },
  ];

  const tips = [
    { icon: "📨", text: td("tip0") },
    { icon: "🎯", text: td("tip1") },
    { icon: "🏠", text: td("tip2") },
  ];

  const voiceCards = [
    { icon: "🎙️", title: td("voice0Title"), desc: td("voice0Desc") },
    { icon: "🔇", title: td("voice1Title"), desc: td("voice1Desc") },
    { icon: "📡", title: td("voice2Title"), desc: td("voice2Desc") },
  ];

  const voiceTips = [td("voiceTip0"), td("voiceTip1"), td("voiceTip2"), td("voiceTip3")];

  const faqs = [
    { q: td("faq0Q"), a: td("faq0A") },
    { q: td("faq1Q"), a: td("faq1A") },
    { q: td("faq2Q"), a: td("faq2A") },
    { q: td("faq3Q"), a: td("faq3A") },
    { q: td("faq4Q"), a: td("faq4A") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* 상단 네비 */}
      <div className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/develop" className="hover:text-blue-500">{t("title")}</Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-200">{td("nav")}</span>
      </div>

      {/* 히어로 */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 p-8 text-white">
        <div className="mb-2 text-3xl">🎮</div>
        <h1 className="text-3xl font-bold">{td("heroTitle")}</h1>
        <p className="mt-2 text-violet-200">
          {td("heroSubPre")} <strong className="text-white">ALPMultiplayer SDK</strong>{td("heroSubPost")}
        </p>
        <div className="flex flex-wrap gap-2 text-sm mt-3">
          {["Durable Objects WebSocket", "Broadcast", "Presence", td("tagAutoIsolation")].map((tag) => (
            <span key={tag} className="rounded-full bg-white/20 px-3 py-0.5">{tag}</span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="https://play.airliveplay.com/multi-arena/" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-violet-700 shadow hover:bg-violet-50">
            {td("btnDemo")}
          </a>
          <Link href="/develop/multiplayer/reference"
            className="flex items-center gap-2 rounded-lg bg-white/25 px-4 py-2 text-sm font-bold text-white hover:bg-white/35">
            {td("btnRef")}
          </Link>
          <a href="/multi-arena.zip" download="multi-arena.zip"
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30">
            {td("btnSource")}
          </a>
          <a href="/alp-multiplayer-sdk.md" download="alp-multiplayer-sdk.md"
            className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25">
            {td("btnAiGuide")}
          </a>
        </div>
      </div>

      {/* 목차 */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{td("tocTitle")}</p>
        <ol className="space-y-1 text-sm text-blue-600 dark:text-blue-400">
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:underline">{label}</a>
            </li>
          ))}
        </ol>
      </div>

      {/* 1. 작동 원리 */}
      <Section id="how-it-works" title={td("s1Title")} />
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {td("s1Desc")}
      </p>
      <Code>{`게임 HTML
  └─ <script src="/_alp/sdk.js">   ← Cloudflare Worker SDK
       └─ ALPMultiplayer class

게임 JS
  └─ new ALPMultiplayer()
       └─ joinRoom("room1")
            └─ WebSocket → GameRoom (Durable Object)  ←→  other players`}</Code>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        {feats.map((c) => (
          <div key={c.title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="text-2xl">{c.emoji}</div>
            <div className="mt-1 font-semibold">{c.title}</div>
            <div className="mt-1 whitespace-pre-line text-xs text-zinc-500">{c.desc}</div>
          </div>
        ))}
      </div>

      {/* 2. 시작하기 */}
      <Section id="quickstart" title={td("s2Title")} />

      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">1</span>
        <span className="font-semibold">{td("step1")}</span>
      </div>
      <Code>{`<head>
  <script src="/_alp/sdk.js"></script>
</head>`}</Code>
      <p className="mb-6 mt-2 text-xs text-zinc-400">
        {td("notePrefix")} SDK: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/_alp/sdk.js</code> — {td("step1Note")}
      </p>

      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</span>
        <span className="font-semibold">{td("step2")}</span>
      </div>
      <Code>{`const mp = new ALPMultiplayer();

mp.on("move", (payload) => {
  console.log(payload);
});

mp.onPlayers((players) => {
  console.log(players.length);
});`}</Code>

      <div className="mb-2 mt-6 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">3</span>
        <span className="font-semibold">{td("step3")}</span>
      </div>
      <Code>{`await mp.joinRoom("room1", {
  userId: "player-unique-id",
  name:   "Player1",
  x: 100, y: 200
});

mp.send("move", { x: 150, y: 300 });`}</Code>

      {/* 3. API 레퍼런스 */}
      <Section id="api" title={td("s3Title")} />

      <ApiMethod {...ph}
        signature="joinRoom(roomId, playerInfo?, options?)" returns="Promise<void>"
        desc={td("joinRoomDesc")}
        params={[
          { name: "roomId",           type: "string",  desc: td("joinRoomP1") },
          { name: "playerInfo",       type: "object?", desc: td("joinRoomP2") },
          { name: "options.password", type: "string?", desc: td("joinRoomP3") },
        ]}
      />

      <ApiMethod {...ph}
        signature="ALPMultiplayer.getRooms(slug?)" returns="Promise<Room[]>"
        desc={td("getRoomsDesc")}
        params={[
          { name: "slug",         type: "string?", desc: td("getRoomsP1") },
          { name: "→ id",         type: "string",  desc: td("getRoomsP2") },
          { name: "→ count",       type: "number",  desc: td("getRoomsP3") },
          { name: "→ hasPassword", type: "boolean", desc: td("getRoomsP4") },
        ]}
      />

      <ApiMethod {...ph}
        signature="on(event, callback, options?)" returns="this"
        desc={td("onDesc")}
        params={[
          { name: "event",           type: "string",           desc: td("onP1") },
          { name: "callback",        type: "(payload) => void", desc: td("onP2") },
          { name: "options.predict", type: "boolean?",          desc: td("onP3") },
          { name: "options.id/x/y",  type: "string?",           desc: td("onP4") },
        ]}
      />

      <ApiMethod {...ph}
        signature="onPlayers(callback)" returns="this"
        desc={td("onPlayersDesc")}
        params={[{ name: "callback", type: "(players: object[]) => void", desc: td("onPlayersP1") }]}
      />

      <ApiMethod {...ph}
        signature="send(event, payload)" returns="void"
        desc={td("sendDesc")}
        params={[
          { name: "event",   type: "string", desc: td("sendP1") },
          { name: "payload", type: "object", desc: td("sendP2") },
        ]}
      />

      <ApiMethod {...ph}
        signature="updatePlayer(info)" returns="void"
        desc={td("updatePlayerDesc")}
        params={[{ name: "info", type: "object", desc: td("updatePlayerP1") }]}
      />

      <ApiMethod {...ph} signature="leave()" returns="Promise<void>" desc={td("leaveDesc")} />

      <ApiMethod {...ph}
        signature="isHost()" returns="boolean"
        desc={td("isHostDesc")}
        params={[{ name: "playerInfo.id", type: "string (required)", desc: td("isHostP1") }]}
      />

      {/* 4. 완성 예시 */}
      <Section id="full-example" title={td("s4Title")} sub={td("s4Sub")} />
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

      mp.on('move', ({ id, x, y, color }) => {
        const o = others.get(id);
        if (o) { o.x = x; o.y = y; }
      }, { predict: true });

      mp.onPlayers((players) => {
        const live = new Set(players.map(p => p.id));
        for (const id of others.keys()) if (!live.has(id)) others.delete(id);
        for (const p of players) {
          if (p.id !== myId && !others.has(p.id))
            others.set(p.id, { x: p.x || 300, y: p.y || 200, color: p.color });
        }
      });

      await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

      const keys = new Set();
      let lastSend = 0;
      window.addEventListener('keydown', e => { keys.add(e.code);    sendPos(); });
      window.addEventListener('keyup',   e => { keys.delete(e.code); sendPos(); });

      function sendPos() {
        if (mp) mp.send('move', { id: myId, color: myColor, x: Math.round(myX), y: Math.round(myY) });
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
      <Section id="game-objects" title={td("s5Title")} sub={td("s5Sub")} />

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <p className="font-semibold text-amber-700 dark:text-amber-300">{td("warnTitle")}</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{td("warnDesc")}</p>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {td("s5Desc")}
      </p>

      <Code>{`// Host: run monster AI + broadcast positions
function gameTick() {
  if (mp.isHost()) {
    for (const m of monsters.values()) {
      m.x += m.vx; m.y += m.vy;
      mp.send('monster-move', { id: m.id, x: m.x, y: m.y, hp: m.hp });
    }
  }
  render();
  requestAnimationFrame(gameTick);
}

// All clients: receive host positions
mp.on('monster-move', (p) => {
  const m = monsters.get(p.id);
  if (m) { m.x = p.x; m.y = p.y; m.hp = p.hp; }
}, { predict: true });

// Host change: re-check when previous host leaves
mp.onPlayers((players) => {
  console.log(mp.isHost() ? 'I am now host' : 'not host');
});`}</Code>

      <p className="mb-3 mt-6 font-semibold text-sm text-zinc-700 dark:text-zinc-200">{td("s5ProjTitle")}</p>
      <Code>{`// All clients: send attack event
function fireProjectile(x, y, dir) {
  spawnEffect(x, y);
  mp.send('fire', { shooterId: myId, x, y, dir });
}

// Host only: hit detection → broadcast result
mp.on('fire', ({ shooterId, x, y, dir }) => {
  if (!mp.isHost()) return;
  const bullet = spawnBullet(x, y, dir);
  bullets.push(bullet);
  mp.send('bullet-spawn', { id: bullet.id, x, y, dir });
});

// All clients: receive hit result
mp.on('hit', ({ targetId, damage }) => {
  const target = getEntity(targetId);
  if (target) target.hp -= damage;
});`}</Code>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {roles.map(({ icon, title, items }) => (
          <div key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-2 font-semibold">{icon} {title}</p>
            <ul className="space-y-1 text-xs text-zinc-500">
              {items.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        ))}
      </div>

      {/* 6. 방 목록 */}
      <Section id="room-list" title={td("s6Title")} sub={td("s6Sub")} />
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{td("s6Desc")}</p>
      <Code>{`const rooms = await ALPMultiplayer.getRooms();
// → [{ id: "room1", count: 3 }, { id: "room2", count: 1 }]

const mp = new ALPMultiplayer();
await mp.joinRoom(rooms[0].id, { id: myId, name: "Player" });`}</Code>

      <p className="mb-3 mt-6 text-sm text-zinc-600 dark:text-zinc-400">{td("s6LobbyDesc")}</p>
      <Code>{`async function loadRooms() {
  const rooms = await ALPMultiplayer.getRooms();
  list.innerHTML = rooms.map(r =>
    \`<li data-id="\${r.id}" data-pw="\${r.hasPassword}">
      \${r.hasPassword ? '🔒 ' : ''}\${r.id}  (\${r.count})
    </li>\`
  ).join('') || '<li>No open rooms.</li>';
}
setInterval(loadRooms, 5000);
loadRooms();`}</Code>

      <p className="mb-3 mt-6 font-semibold text-sm text-zinc-700 dark:text-zinc-200">{td("s6PwTitle")}</p>
      <Code>{`// Create password room — first player sets the password
await mp.joinRoom('room1', playerInfo, { password: '1234' });

// Join password room — wrong password rejects the Promise
try {
  await mp.joinRoom('room1', playerInfo, { password: userInput });
} catch (e) {
  alert('Wrong password');
}

// No password — omit options or use password: ''
await mp.joinRoom('room2', playerInfo);`}</Code>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-semibold text-blue-700 dark:text-blue-300">{td("tipBoxTitle")}</p>
        <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>• {td("s6Tip0")}</li>
          <li>• {td("s6Tip1")}</li>
          <li>• {td("s6Tip2")}</li>
        </ul>
      </div>

      {/* 7. 권장 인원 & 팁 */}
      <Section id="limits" title={td("s7Title")} />
      <p className="mb-4 text-sm text-zinc-500">{td("s7Desc")}</p>
      <div className="mb-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{td("s7ColType")}</th>
              <th className="px-4 py-2 text-left font-medium">{td("s7ColRec")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[
              [td("s7Row0Type"), td("s7Row0Rec")],
              [td("s7Row1Type"), td("s7Row1Rec")],
              [td("s7Row2Type"), td("s7Row2Rec")],
            ].map(([type, rec]) => (
              <tr key={type}>
                <td className="px-4 py-2">{type}</td>
                <td className="px-4 py-2 font-medium text-green-600 dark:text-green-400">{rec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {tips.map(({ icon, text }) => (
          <div key={icon} className="flex gap-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
            <span>{icon}</span>
            <span className="text-zinc-600 dark:text-zinc-400">{text}</span>
          </div>
        ))}
      </div>

      {/* 음성 채팅 */}
      <Section id="voice" title={td("s8Title")} sub={td("s8Sub")} />
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{td("s8Desc")}</p>

      <Code>{`const mp = new ALPMultiplayer();
await mp.joinRoom('room1', { id: myId, name: 'Player1' });

await mp.joinVoice();

mp.onVoiceState(({ type, peerId }) => {
  console.log(type, peerId);
});

muteBtn.addEventListener('click', () => {
  muted = !muted;
  mp.setMuted(muted);
});

mp.leaveVoice();`}</Code>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        {voiceCards.map(({ icon, title, desc }) => (
          <div key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="font-semibold">{icon} <code className="text-violet-600 dark:text-violet-400 text-xs">{title}</code></p>
            <p className="mt-1 text-xs text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <p className="font-semibold text-blue-700 dark:text-blue-300">{td("tipBoxTitle")}</p>
        <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-400">
          {voiceTips.map((tip, i) => <li key={i}>• {tip}</li>)}
        </ul>
      </div>

      {/* FAQ */}
      <Section id="faq" title={td("s9Title")} />
      <div className="space-y-4">
        {faqs.map(({ q, a }) => (
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
        <Link href="/develop"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
          {td("footBack")}
        </Link>
        <a href="/alp-multiplayer-sdk.md" download="alp-multiplayer-sdk.md"
          className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
          {td("footAiGuide")}
        </a>
        <a href="https://developers.cloudflare.com/durable-objects/" target="_blank" rel="noreferrer"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
          {td("footCFDocs")}
        </a>
      </div>
    </div>
  );
}
