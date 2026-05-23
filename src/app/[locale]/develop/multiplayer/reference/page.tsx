import React from "react";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

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

export default async function MultiplayReference() {
  const tr = await getTranslations("MultiplayRef");

  const mistakes = [
    { bad: tr("mistake0Bad"), fix: tr("mistake0Fix") },
    { bad: tr("mistake1Bad"), fix: tr("mistake1Fix") },
    { bad: tr("mistake2Bad"), fix: tr("mistake2Fix") },
    { bad: tr("mistake3Bad"), fix: tr("mistake3Fix") },
  ];

  const tableRows = [
    [tr("s6Row0Type"), tr("s6Row0Rec")],
    [tr("s6Row1Type"), tr("s6Row1Rec")],
    [tr("s6Row2Type"), tr("s6Row2Rec")],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">

      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Link href="/develop" className="hover:text-blue-500">{tr("nav1")}</Link>
          <span>/</span>
          <Link href="/develop/multiplayer" className="hover:text-blue-500">{tr("nav2")}</Link>
          <span>/</span>
          <span className="text-zinc-700 dark:text-zinc-200">{tr("nav3")}</span>
        </div>
        <Link href="/develop/multiplayer" className="text-sm text-blue-500 hover:underline">
          {tr("navFull")}
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold">{tr("title")}</h1>
      <p className="mb-8 text-sm text-zinc-500">{tr("subtitle")}</p>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* 1. HTML 추가 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs text-white">1</span>
            {tr("s1Title")}
          </h2>
          <Block>{`<script src="/_alp/sdk.js"></script>`}</Block>
          <p className="mt-2 text-xs text-zinc-400">
            {tr("s1Note").split("ALPMultiplayer")[0]}
            <code className="text-violet-500">ALPMultiplayer</code>
            {tr("s1Note").split("ALPMultiplayer")[1]}
          </p>
        </div>

        {/* 2. 권장 순서 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <span className="text-lg">📋</span> {tr("s2Title")}
          </h2>
          <Block>{tr("s2Code")}</Block>
          <p className="mt-2 text-xs text-zinc-400">{tr("s2Note")}</p>
        </div>

        {/* 3. API 목록 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-4 font-bold">{tr("s3Title")}</h2>
          <div className="space-y-3">

            {/* joinRoom */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="violet">{tr("joinRoomChip")}</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("joinRoomDesc")}
                <br />
                <code className="text-xs text-zinc-400">{tr("joinRoomPRoom")}</code> — {tr("joinRoomRoom")}
                <br />
                <code className="text-xs text-zinc-400">{tr("joinRoomPInfo")}</code> — {tr("joinRoomInfo")}
                <br />
                <code className="text-xs text-zinc-400">{"{ password: '...' }"}</code> — {tr("joinRoomPw")}
              </div>
            </div>

            {/* on */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="green">{tr("onChip")}</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("onDesc")}
                <br />
                <span className="text-xs">{tr("onNote")}</span>
              </div>
            </div>

            {/* onPlayers */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="green">{tr("onPlayersChip")}</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("onPlayersDesc")}
                <br />
                <span className="text-xs text-zinc-400">{tr("onPlayersNote")}</span>
              </div>
            </div>

            {/* on predict */}
            <div className="flex flex-col gap-1 rounded-lg bg-violet-50 px-4 py-3 dark:bg-violet-950/20 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0">
                <Chip color="violet">on(event, fn, {"{"}predict:true{"}"})</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{tr("onPredictDesc")}</div>
            </div>

            {/* send */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="violet">{tr("sendChip")}</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("sendDesc")}
                <br />
                <span className="text-xs text-red-500">{tr("sendRate")}</span>
              </div>
            </div>

            {/* updatePlayer */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="zinc">{tr("updateChip")}</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{tr("updateDesc")}</div>
            </div>

            {/* leave */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="red">leave()</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{tr("leaveDesc")}</div>
            </div>

            {/* joinVoice */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="violet">joinVoice(options?)</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("joinVoiceDesc")}
                <br />
                <span className="text-xs text-zinc-400">{tr("joinVoiceReturns")}</span>
              </div>
            </div>

            {/* setMuted / leaveVoice */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0 flex flex-col gap-1">
                <Chip color="zinc">setMuted(bool)</Chip>
                <Chip color="red">leaveVoice()</Chip>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <code>setMuted(true/false)</code> — {tr("setMutedDesc")}
                <br />
                <code>leaveVoice()</code> — {tr("leaveVoiceDesc")}
              </div>
            </div>

            {/* onVoiceState */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="green">onVoiceState(cb)</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("onVoiceDesc")}
                <br />
                <span className="text-xs text-zinc-400"><code>{'cb({ type: "joined"|"left", peerId })'}</code></span>
              </div>
            </div>

            {/* isHost */}
            <div className="flex flex-col gap-1 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-950/20 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="yellow">isHost()</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("isHostDesc")}
                <br />
                <span className="text-xs text-zinc-400">{tr("isHostNote")}</span>
              </div>
            </div>

            {/* getRooms */}
            <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800 sm:flex-row sm:items-start sm:gap-4">
              <div className="shrink-0"><Chip color="green">getRooms(slug?)</Chip></div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                {tr("getRoomsDesc").split("ALPMultiplayer.getRooms()")[0]}
                <code className="text-violet-500">ALPMultiplayer.getRooms()</code>
                {tr("getRoomsDesc").split("ALPMultiplayer.getRooms()")[1]}
                <br />
                <span className="text-xs text-zinc-400">{tr("getRoomsReturns")}</span>
              </div>
            </div>

          </div>
        </div>

        {/* 4. 복붙 예시 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-3 font-bold">{tr("s4Title")}</h2>
          <Block>{`const mp    = new ALPMultiplayer();
const myId  = crypto.randomUUID();
const others = new Map(); // id → { x, y, color }

// predict: true — SDK delivers interpolated positions at 60fps
mp.on('move', ({ id, x, y, color }) => {
  const o = others.get(id);
  if (o) { o.x = x; o.y = y; }
}, { predict: true });

// Manage join/leave (onPlayers keeps the others map in sync)
mp.onPlayers((players) => {
  const live = new Set(players.map(p => p.id));
  for (const id of others.keys()) if (!live.has(id)) others.delete(id);
  for (const p of players) {
    if (p.id !== myId && !others.has(p.id))
      others.set(p.id, { x: p.x || 0, y: p.y || 0, color: p.color });
  }
});

await mp.joinRoom('room1', { id: myId, color: myColor, x: myX, y: myY });

// Send immediately on key press + every 16ms
const keys = new Set();
let lastSend = 0;
window.addEventListener('keydown', e => { keys.add(e.code);    sendPos(); });
window.addEventListener('keyup',   e => { keys.delete(e.code); sendPos(); });
function sendPos() { mp.send('move', { id: myId, color: myColor, x: myX, y: myY }); }

function loop(now) {
  if (now - lastSend > 16) { sendPos(); lastSend = now; }
  // Render — others.x/y are updated each frame by the SDK
  requestAnimationFrame(loop);
}`}</Block>
        </div>

        {/* 5. predict 옵션 */}
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-800 dark:bg-violet-950/20">
          <h2 className="mb-3 font-bold">{tr("s5Title")}</h2>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            <code className="text-violet-600">{"{ predict: true }"}</code> {tr("s5Desc")}
          </p>
          <Block>{`// Without predict (manual lerp needed)
mp.on('move', (p) => { other.tx = p.x; other.ty = p.y; });
// Game loop: other.x += (other.tx - other.x) * 0.2;

// With predict (SDK handles it)
mp.on('move', (p) => { other.x = p.x; other.y = p.y; }, { predict: true });
// Game loop: just read other.x, other.y and render`}</Block>
        </div>

        {/* 6. 권장 인원 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-1 font-bold">
            {tr("s6Title")} <span className="text-xs font-normal text-zinc-400">({tr("s6Sub")})</span>
          </h2>
          <p className="mb-3 text-xs text-zinc-400">{tr("s6Desc")}</p>
          <div className="mb-4 overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800 text-sm">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">{tr("s6ColType")}</th>
                  <th className="px-3 py-2 text-left">{tr("s6ColRec")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tableRows.map(([type, rec]) => (
                  <tr key={type}>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{type}</td>
                    <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">{rec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400">
            {tr("s6ConcurrentNote")}<br />{tr("s6SendNote")}
          </p>
        </div>

        {/* 7. 흔한 실수 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h2 className="mb-3 font-bold">{tr("s7Title")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {mistakes.map(({ bad, fix }) => (
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
        <Link href="/develop/multiplayer"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
          {tr("footBack")}
        </Link>
        <a href="https://play.airliveplay.com/multi-arena/" target="_blank" rel="noreferrer"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">
          {tr("footDemo")}
        </a>
        <a href="/multi-arena.zip" download="multi-arena.zip"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
          {tr("footSource")}
        </a>
      </div>

    </div>
  );
}
