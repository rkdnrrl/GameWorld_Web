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

function ApiMethod({ signature, returns, official, officialLabel, desc, params, paramHeader, typeHeader, reqHeader, descHeader }: {
  signature: string; returns: string; official?: boolean; officialLabel?: string; desc: string;
  params?: { name: string; type: string; req?: boolean; desc: string }[];
  paramHeader?: string; typeHeader?: string; reqHeader?: string; descHeader?: string;
}) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
        <code className="font-mono text-sm font-semibold text-violet-700 dark:text-violet-300">{signature}</code>
        <div className="flex items-center gap-2">
          {official && officialLabel && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
              {officialLabel}
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
                <th className="pb-1 pr-4 font-medium">{paramHeader}</th>
                <th className="pb-1 pr-4 font-medium">{typeHeader}</th>
                <th className="pb-1 pr-4 font-medium">{reqHeader}</th>
                <th className="pb-1 font-medium">{descHeader}</th>
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
  const td = await getTranslations("Develop");
  const ti = await getTranslations("InvGuide");

  const apiCommon = {
    officialLabel: ti("officialOnly"),
    paramHeader:   ti("paramHeader"),
    typeHeader:    ti("typeHeader"),
    reqHeader:     ti("reqHeader"),
    descHeader:    ti("descHeader"),
  };

  const permRows: [string, boolean, boolean][] = [
    [ti("permRow0"), true,  true],
    [ti("permRow1"), true,  true],
    [ti("permRow2"), true,  false],
    [ti("permRow3"), true,  false],
    [ti("permRow4"), true,  false],
  ];

  const errRows: [string, string][] = [
    [ti("err0"), ti("errMsg0")],
    [ti("err1"), ti("errMsg1")],
    [ti("err2"), ti("errMsg2")],
    [ti("err3"), ti("errMsg3")],
    [ti("err4"), ti("errMsg4")],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">

      {/* 브레드크럼 */}
      <div className="mb-8 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/develop" className="hover:text-blue-500">{td("title")}</Link>
        <span>/</span>
        <span className="text-zinc-700 dark:text-zinc-200">{ti("breadcrumb")}</span>
      </div>

      {/* 히어로 */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white">
        <p className="text-sm font-medium text-emerald-100">{ti("heroTag")}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{ti("heroTitle")}</h1>
        <p className="mt-3 leading-relaxed text-emerald-100">{ti("heroDesc")}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a href="#quick-start" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">{ti("btnQuickStart")}</a>
          <a href="#api" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">{ti("btnApi")}</a>
          <a href="#examples" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium hover:bg-white/30">{ti("btnExamples")}</a>
        </div>
      </div>

      {/* 권한 표 */}
      <Section id="overview" title={ti("permTitle")} />
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold text-zinc-700 dark:text-zinc-200">{ti("permColTask")}</th>
              <th className="px-4 py-2.5 text-center font-semibold text-indigo-600 dark:text-indigo-300">{ti("permColOfficial")}</th>
              <th className="px-4 py-2.5 text-center font-semibold text-zinc-500">{ti("permColCommunity")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {permRows.map(([label, official, community]) => (
              <tr key={label} className="bg-white dark:bg-zinc-900">
                <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{label}</td>
                <td className="px-4 py-2.5 text-center">{official ? <Badge color="green">{ti("permOk")}</Badge> : <Badge color="red">{ti("permNo")}</Badge>}</td>
                <td className="px-4 py-2.5 text-center">{community ? <Badge color="green">{ti("permOk")}</Badge> : <Badge color="red">{ti("permNo")}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 빠른 시작 */}
      <Section id="quick-start" title={ti("quickTitle")} sub={ti("quickSub")} />
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{ti("step1Label")}</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{ti("step1Desc")}</p>
          <Code>{`<script src="/_alp/sdk.js"></script>`}</Code>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{ti("step2Label")}</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            {ti("step2Desc").split("?token=")[0]}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">?token=</code>
            {ti("step2Desc").split("?token=")[1]}
          </p>
          <Code>{`const token = new URLSearchParams(location.search).get('token') || '';
const inv = new ALPInventory(token);`}</Code>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{ti("step3Label")}</p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{ti("step3Desc")}</p>
          <Code>{ti("step3Code")}</Code>
        </div>
      </div>

      {/* API 레퍼런스 */}
      <Section id="api" title={ti("apiTitle")} />

      <ApiMethod
        {...apiCommon}
        signature="inv.getItems(opts?)"
        returns="Promise<{ items: Item[], total: number }>"
        desc={ti("getItemsDesc")}
        params={[
          { name: "category",   type: "string",   desc: ti("getItemsP_category") },
          { name: "kind",       type: "string",   desc: ti("getItemsP_kind") },
          { name: "sourceGame", type: "string",   desc: ti("getItemsP_sourceGame") },
          { name: "tags",       type: "string[]", desc: ti("getItemsP_tags") },
          { name: "limit",      type: "number",   desc: ti("getItemsP_limit") },
          { name: "offset",     type: "number",   desc: ti("getItemsP_offset") },
        ]}
      />

      <ApiMethod
        {...apiCommon}
        signature="inv.getItem(id)"
        returns="Promise<{ item: Item }>"
        desc={ti("getItemDesc")}
        params={[{ name: "id", type: "string", req: true, desc: ti("getItemP_id") }]}
      />

      <ApiMethod
        {...apiCommon}
        signature="inv.addItem(item | item[])"
        returns="Promise<{ items: Item[] }>"
        official
        desc={ti("addItemDesc")}
        params={[
          { name: "kind",     type: "string",   req: true,  desc: ti("addItemP_kind") },
          { name: "category", type: "string",   req: true,  desc: ti("addItemP_category") },
          { name: "name",     type: "string",   req: true,  desc: ti("addItemP_name") },
          { name: "icon",     type: "string",   req: false, desc: ti("addItemP_icon") },
          { name: "qty",      type: "number",   req: false, desc: ti("addItemP_qty") },
          { name: "tags",     type: "string[]", req: false, desc: ti("addItemP_tags") },
          { name: "stats",    type: "object",   req: false, desc: ti("addItemP_stats") },
        ]}
      />

      <ApiMethod
        {...apiCommon}
        signature="inv.consumeItem(id, amount?)"
        returns="Promise<{ item?: Item, deleted?: true }>"
        desc={ti("consumeItemDesc")}
        params={[
          { name: "id",     type: "string", req: true,  desc: ti("consumeItemP_id") },
          { name: "amount", type: "number", req: false, desc: ti("consumeItemP_amount") },
        ]}
      />

      <ApiMethod
        {...apiCommon}
        signature="inv.updateItem(id, patch)"
        returns="Promise<{ item: Item }>"
        official
        desc={ti("updateItemDesc")}
        params={[
          { name: "id",    type: "string",   req: true,  desc: ti("updateItemP_id") },
          { name: "qty",   type: "number",   req: false, desc: ti("updateItemP_qty") },
          { name: "stats", type: "object",   req: false, desc: ti("updateItemP_stats") },
          { name: "name",  type: "string",   req: false, desc: ti("updateItemP_name") },
          { name: "icon",  type: "string",   req: false, desc: ti("updateItemP_icon") },
          { name: "tags",  type: "string[]", req: false, desc: ti("updateItemP_tags") },
        ]}
      />

      <ApiMethod
        {...apiCommon}
        signature="inv.removeItem(id)"
        returns="Promise<{ ok: true }>"
        official
        desc={ti("removeItemDesc")}
        params={[{ name: "id", type: "string", req: true, desc: ti("removeItemP_id") }]}
      />

      {/* 아이템 설계 가이드 */}
      <Section id="item-schema" title={ti("schemaTitle")} sub={ti("schemaSub")} />
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{ti("schemaCatLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {["fish","material","food","weapon","armor","consumable","decoration","currency","key","misc"].map((c) => (
            <Badge key={c} color="zinc">{c}</Badge>
          ))}
        </div>
        <p className="mt-4 mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200">{ti("schemaTagLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {["hp_recovery","mp_recovery","attack_buff","rare","unique","stackable","tradeable","quest"].map((tag) => (
            <Badge key={tag} color="indigo">{tag}</Badge>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-400">{ti("schemaNote")}</p>
      </div>

      {/* 예제 */}
      <Section id="examples" title={ti("examplesTitle")} />

      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🎣</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">{ti("ex1Title")}</p>
            <p className="text-xs text-zinc-500">{ti("ex1Sub")}</p>
          </div>
        </div>
        <Code>{ti("ex1Code")}</Code>
      </div>

      <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-800 dark:bg-sky-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">⚔️</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">{ti("ex2Title")}</p>
            <p className="text-xs text-zinc-500">{ti("ex2Sub")}</p>
          </div>
        </div>
        <Code>{ti("ex2Code")}</Code>
      </div>

      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">⏱</span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">{ti("ex3Title")}</p>
            <p className="text-xs text-zinc-500">{ti("ex3Sub")}</p>
          </div>
        </div>
        <Code>{ti("ex3Code")}</Code>
      </div>

      {/* 에러 처리 */}
      <Section id="errors" title={ti("errorsTitle")} />
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-500">{ti("errColSituation")}</th>
              <th className="px-4 py-2.5 text-left font-medium text-zinc-500">{ti("errColMsg")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {errRows.map(([situation, msg]) => (
              <tr key={situation}>
                <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{situation}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-red-600 dark:text-red-400">{msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Code>{ti("errCode")}</Code>
      </div>

      {/* 하단 링크 */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <Link href="/develop" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {ti("footBack")}
        </Link>
        <Link href="/develop/multiplayer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {ti("footNext")}
        </Link>
      </div>
    </div>
  );
}
