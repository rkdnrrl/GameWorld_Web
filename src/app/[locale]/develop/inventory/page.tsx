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

function ApiMethod({ signature, returns, official, desc, params }: {
  signature: string; returns: string; official?: boolean; desc: string;
  params?: { name: string; type: string; req?: boolean; desc: string }[];
}) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
        <code className="font-mono text-sm font-semibold text-violet-700 dark:text-violet-300">{signature}</code>
        <div className="flex items-center gap-2">
          {official && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
              공식 게임 전용
            </span>
          )}
          <span className="font-mono text-xs text-zinc-400">→ {returns}</span>
        </div>
      </div>
      <div className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
        <p>{desc}</p>
        {params && params.length > 0 && (
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="pb-1 pr-4 font-medium">파라미터</th>
                <th className="pb-1 pr-4 font-medium">타입</th>
                <th className="pb-1 pr-4 font-medium">필수</th>
                <th className="pb-1 font-medium">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {params.map((p) => (
                <tr key={p.name}>
                  <td className="py-1 pr-4 font-mono text-violet-600 dark:text-violet-400">{p.name}</td>
                  <td className="py-1 pr-4 font-mono text-zinc-500">{p.type}</td>
                  <td className="py-1 pr-4 text-zinc-400">{p.req ? "✓" : "-"}</td>
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

function Badge({ children, color = "zinc" }: { children: string; color?: "zinc" | "green" | "red" | "indigo" }) {
  const cls = {
    zinc:   "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    green:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    red:    "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  }[color];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export default async function InventoryGuide() {
  const t = await getTranslations("Develop");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">

      {/* 브레드크럼 */}
      <div className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/develop" className="hover:text-blue-500">{t("title")}</Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-200">공유 인벤토리 가이드</span>
      </div>

      {/* 히어로 */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white">
        <p className="text-sm font-medium text-emerald-100">ALP Platform SDK</p>
        <h1 className="mt-1 text-3xl font-extrabold">공유 인벤토리</h1>
        <p className="mt-3 text-emerald-100 leading-relaxed">
          공식 게임끼리 아이템을 공유하는 크로스게임 인벤토리 시스템입니다.
          낚시 게임에서 잡은 물고기를 던전 게임에서 체력 회복 아이템으로 쓰는 식으로 연동됩니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a href="#quick-start" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">빠른 시작 →</a>
          <a href="#api" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">API 레퍼런스 →</a>
          <a href="#examples" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">예제 →</a>
        </div>
      </div>

      {/* ── 권한 표 ── */}
      <Section id="overview" title="게임 종류별 권한" />
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-zinc-700 dark:text-zinc-200">작업</th>
              <th className="px-4 py-2.5 text-center font-semibold text-indigo-600 dark:text-indigo-300">공식 게임</th>
              <th className="px-4 py-2.5 text-center font-semibold text-zinc-500">커뮤니티 게임</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[
              ["아이템 조회 (getItems)", true, true],
              ["아이템 소비 (consumeItem)", true, true],
              ["아이템 생성 (addItem)", true, false],
              ["아이템 수정 (updateItem)", true, false],
              ["아이템 삭제 (removeItem)", true, false],
            ].map(([label, official, community]) => (
              <tr key={String(label)} className="bg-white dark:bg-zinc-900">
                <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{String(label)}</td>
                <td className="px-4 py-2.5 text-center">{official ? <Badge color="green">✓ 가능</Badge> : <Badge color="red">✗ 불가</Badge>}</td>
                <td className="px-4 py-2.5 text-center">{community ? <Badge color="green">✓ 가능</Badge> : <Badge color="red">✗ 불가</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 빠른 시작 ── */}
      <Section id="quick-start" title="빠른 시작" sub="3단계로 인벤토리 연동하기" />

      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Step 1 — SDK 로드</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">게임 HTML에 ALP SDK 스크립트를 추가합니다. 멀티플레이 SDK와 동일한 파일입니다.</p>
          <Code>{`<script src="/_alp/sdk.js"></script>`}</Code>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Step 2 — 초기화</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">URL의 <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">?token=</code> 파라미터에서 유저 토큰을 읽어 인스턴스를 생성합니다.</p>
          <Code>{`const token = new URLSearchParams(location.search).get('token') || '';
const inv = new ALPInventory(token);`}</Code>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Step 3 — 사용</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">아이템을 추가하거나 조회합니다.</p>
          <Code>{`// 아이템 추가 (공식 게임만)
await inv.addItem({
  kind:     'salmon',      // 게임 내부 식별자
  category: 'fish',       // 아이템 종류 (다른 게임이 필터링에 사용)
  name:     '연어',
  icon:     '🐟',
  qty:      1,
  stats:    { weight: 2.3, freshness: 100 }
});

// 아이템 조회 (공식 + 커뮤니티 모두 가능)
const { items } = await inv.getItems({ category: 'fish' });
console.log(items); // [{ id, kind, name, qty, stats, ... }]

// 아이템 소비 (공식 + 커뮤니티 모두 가능)
await inv.consumeItem(items[0].id, 1);`}</Code>
        </div>
      </div>

      {/* ── API 레퍼런스 ── */}
      <Section id="api" title="API 레퍼런스" />

      <ApiMethod
        signature="inv.getItems(opts?)"
        returns="Promise<{ items: Item[], total: number }>"
        desc="유저의 인벤토리 아이템 목록을 조회합니다. 다른 공식 게임이 생성한 아이템도 포함됩니다."
        params={[
          { name: "category", type: "string", desc: "카테고리 필터 (예: 'fish', 'weapon')" },
          { name: "kind",     type: "string", desc: "종류 필터 (예: 'salmon')" },
          { name: "sourceGame", type: "string", desc: "특정 게임이 만든 아이템만 조회" },
          { name: "tags",     type: "string[]", desc: "태그 필터 (하나라도 일치하면 포함)" },
          { name: "limit",    type: "number", desc: "최대 개수 (기본 50, 최대 200)" },
          { name: "offset",   type: "number", desc: "페이징 오프셋" },
        ]}
      />

      <ApiMethod
        signature="inv.getItem(id)"
        returns="Promise<{ item: Item }>"
        desc="아이템 ID로 단일 아이템을 조회합니다."
        params={[{ name: "id", type: "string", req: true, desc: "아이템 ID (문자열)" }]}
      />

      <ApiMethod
        signature="inv.addItem(item | item[])"
        returns="Promise<{ items: Item[] }>"
        official
        desc="아이템을 인벤토리에 추가합니다. 배열을 전달하면 한 번에 최대 50개 추가할 수 있습니다."
        params={[
          { name: "kind",     type: "string",   req: true,  desc: "게임 내부 식별자 (예: 'iron_sword')" },
          { name: "category", type: "string",   req: true,  desc: "1차 분류 — 다른 게임이 이 값으로 필터링" },
          { name: "name",     type: "string",   req: true,  desc: "표시 이름" },
          { name: "icon",     type: "string",   req: false, desc: "이모지/아이콘 (최대 16자)" },
          { name: "qty",      type: "number",   req: false, desc: "수량 (기본 1)" },
          { name: "tags",     type: "string[]", req: false, desc: "추가 태그 (예: ['rare', 'hp_recovery'])" },
          { name: "stats",    type: "object",   req: false, desc: "능력치 자유 JSON (예: { attack: 5 })" },
        ]}
      />

      <ApiMethod
        signature="inv.consumeItem(id, amount?)"
        returns="Promise<{ item?: Item, deleted?: true }>"
        desc="아이템 수량을 차감합니다. qty가 0이 되면 자동으로 삭제됩니다. 커뮤니티 게임도 사용 가능합니다."
        params={[
          { name: "id",     type: "string", req: true,  desc: "아이템 ID" },
          { name: "amount", type: "number", req: false, desc: "차감할 수량 (기본 1)" },
        ]}
      />

      <ApiMethod
        signature="inv.updateItem(id, patch)"
        returns="Promise<{ item: Item }>"
        official
        desc="아이템 정보를 수정합니다. 이 게임이 생성한 아이템만 수정 가능합니다."
        params={[
          { name: "id",    type: "string", req: true,  desc: "아이템 ID" },
          { name: "qty",   type: "number", req: false, desc: "새 수량 (0이면 삭제)" },
          { name: "stats", type: "object", req: false, desc: "능력치 덮어쓰기" },
          { name: "name",  type: "string", req: false, desc: "표시 이름 변경" },
          { name: "icon",  type: "string", req: false, desc: "아이콘 변경" },
          { name: "tags",  type: "string[]", req: false, desc: "태그 교체" },
        ]}
      />

      <ApiMethod
        signature="inv.removeItem(id)"
        returns="Promise<{ ok: true }>"
        official
        desc="아이템을 완전히 삭제합니다. 이 게임이 생성한 아이템만 삭제 가능합니다."
        params={[{ name: "id", type: "string", req: true, desc: "아이템 ID" }]}
      />

      {/* ── 아이템 필드 가이드 ── */}
      <Section id="item-schema" title="아이템 설계 가이드" sub="다른 게임과 호환되도록 category / tags / stats 를 일관성 있게 정의하세요" />

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">추천 category 값</p>
        <div className="flex flex-wrap gap-2">
          {["fish","material","food","weapon","armor","consumable","decoration","currency","key","misc"].map((c) => (
            <Badge key={c} color="zinc">{c}</Badge>
          ))}
        </div>
        <p className="mt-4 mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">추천 tags 값</p>
        <div className="flex flex-wrap gap-2">
          {["hp_recovery","mp_recovery","attack_buff","rare","unique","stackable","tradeable","quest"].map((t) => (
            <Badge key={t} color="indigo">{t}</Badge>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          category 와 tags 는 자유롭게 정의할 수 있지만, 다른 게임과 아이템을 교환하려면 같은 값을 써야 합니다.
          플랫폼 공식 카테고리는 추후 문서화될 예정입니다.
        </p>
      </div>

      {/* ── 예제 ── */}
      <Section id="examples" title="예제" />

      {/* 예제 1: 공식 낚시 게임 */}
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🎣</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">공식 낚시 게임 — 물고기 아이템 생성</p>
            <p className="text-xs text-zinc-500">kind=official 게임. 유저가 물고기를 잡을 때 인벤토리에 추가합니다.</p>
          </div>
        </div>
        <Code>{`const token = new URLSearchParams(location.search).get('token') || '';
const inv = new ALPInventory(token);

// 물고기 잡기 성공 시 호출
async function onFishCaught(fish) {
  try {
    const { items } = await inv.addItem({
      kind:     fish.id,            // 'salmon', 'tuna', 'goldfish' ...
      category: 'fish',
      name:     fish.name,
      icon:     fish.emoji,
      qty:      1,
      stats: {
        weight:    fish.weight,
        freshness: 100,             // 시간이 지나면 감소시킬 수 있음
        rarity:    fish.rarity,     // 'common' | 'rare' | 'legendary'
      },
      tags: [fish.rarity, 'food'],
    });
    showNotification('인벤토리에 추가됐습니다: ' + fish.name);
  } catch (e) {
    console.error('인벤토리 추가 실패:', e.message);
  }
}`}</Code>
      </div>

      {/* 예제 2: 커뮤니티 던전 게임 */}
      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-800 dark:bg-sky-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">⚔️</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">커뮤니티 던전 게임 — 음식 아이템 소비</p>
            <p className="text-xs text-zinc-500">kind=community 게임. 낚시 게임에서 얻은 물고기를 체력 회복으로 사용합니다.</p>
          </div>
        </div>
        <Code>{`const token = new URLSearchParams(location.search).get('token') || '';
const inv = new ALPInventory(token);

// 아이템 창 열기 — food 카테고리 아이템만 표시
async function openFoodInventory() {
  const { items } = await inv.getItems({ category: 'fish', tags: ['food'] });
  renderItemList(items);
}

// 아이템 선택 → 사용
async function useItem(item) {
  try {
    await inv.consumeItem(item.id, 1);

    // stats 에서 효과 계산
    const hpHeal = (item.stats.weight || 1) * 10;
    player.hp = Math.min(player.maxHp, player.hp + hpHeal);
    showEffect('+' + hpHeal + ' HP');
  } catch (e) {
    if (e.message.includes('수량 부족')) {
      showError('아이템이 없습니다.');
    }
  }
}`}</Code>
      </div>

      {/* 예제 3: 아이템 신선도 시스템 */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">⏱</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">고급 패턴 — 아이템 상태 업데이트</p>
            <p className="text-xs text-zinc-500">공식 게임이 자기 아이템의 stats를 시간 경과에 따라 업데이트합니다.</p>
          </div>
        </div>
        <Code>{`// 낚시 게임 로드 시: 신선도가 낮아진 물고기 업데이트
async function updateFishFreshness() {
  const { items } = await inv.getItems({
    sourceGame: 'fishing-game',   // 이 게임이 만든 것만
    category:   'fish',
  });

  for (const item of items) {
    const hoursPassed = (Date.now() - new Date(item.updatedAt)) / 3_600_000;
    const newFreshness = Math.max(0, (item.stats.freshness || 100) - hoursPassed * 5);

    if (newFreshness !== item.stats.freshness) {
      await inv.updateItem(item.id, {
        stats: { ...item.stats, freshness: Math.round(newFreshness) },
      });
    }
  }
}`}</Code>
      </div>

      {/* ── 에러 처리 ── */}
      <Section id="errors" title="에러 처리" />
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-500">상황</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-500">에러 메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
            {[
              ["토큰 없음 / 만료", "401 Unauthorized"],
              ["커뮤니티 게임이 addItem 호출", "공식(official) 게임에서만 아이템을 생성·수정할 수 있습니다."],
              ["다른 게임 아이템 수정 시도", "아이템을 생성한 게임만 수정할 수 있습니다."],
              ["consumeItem — 수량 부족", "수량 부족 (보유 N)"],
              ["존재하지 않는 아이템", "아이템을 찾을 수 없습니다."],
            ].map(([situation, msg]) => (
              <tr key={String(situation)}>
                <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{String(situation)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-red-600 dark:text-red-400">{String(msg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Code>{`// 모든 inv.* 메서드는 실패 시 Error를 throw합니다
try {
  await inv.consumeItem(itemId, 1);
} catch (e) {
  console.error(e.message); // "수량 부족 (보유 0)"
}`}</Code>
      </div>

      {/* 하단 링크 */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <Link href="/develop" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 개발 홈
        </Link>
        <Link href="/develop/multiplayer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          멀티플레이 가이드 →
        </Link>
      </div>
    </div>
  );
}
