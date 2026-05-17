import GameCard, { type Game, type GameCategory } from "@/components/GameCard";
import AdBanner from "@/components/AdBanner";
import GameWorldMap from "@/components/GameWorldMap";
import { getTranslations } from "next-intl/server";
import {
  GAME_CATEGORY_ORDER,
  groupGamesByCategory,
} from "./gameCategories";

/** 게임 목록에서 숨김 */
const HIDDEN_GAME_IDS = new Set<string>(["rock-clicker", "alchemy"]);
const HIDDEN_TITLE = "돌깨기 클리커";
const HIDDEN_URL_PATTERN = /rock-clicker/i;

function isHiddenGame(g: Game): boolean {
  if (HIDDEN_GAME_IDS.has(g.id)) return true;
  if (g.title?.trim() === HIDDEN_TITLE) return true;
  if (g.url && HIDDEN_URL_PATTERN.test(g.url)) return true;
  return false;
}

function filterVisibleGames(games: Game[]): Game[] {
  return games.filter((g) => !isHiddenGame(g));
}

async function getGames(): Promise<Game[]> {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/games`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) throw new Error("failed");
    const data = await res.json();
    return filterVisibleGames(data.games ?? []);
  } catch {
    return filterVisibleGames([
      {
        id: "cube-multiplay",
        title: "큐브 멀티플레이",
        description: "친구들과 함께 즐기는 실시간 멀티플레이 큐브 게임",
        url: "http://13.125.187.132:3001",
        emoji: "🎲",
        tags: ["멀티플레이", "실시간"],
        players: null,
        rooms: null,
        maxPlayers: 100,
        category: "multiplay",
      },
    ]);
  }
}

const CATEGORY_LABEL_KEY: Record<GameCategory, string> = {
  earn: "categoryEarn",
  multiplay: "categoryMultiplay",
  decorate: "categoryDecorate",
  other: "categoryOther",
};

export default async function GamesPage() {
  const t = await getTranslations("Games");
  const games = await getGames();
  const byCat = groupGamesByCategory(games);

  return (
    <section className="mx-auto w-full max-w-6xl min-w-0 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1.5 break-words text-sm text-zinc-500">
          게임을 클릭하면 바로 입장합니다
        </p>
      </div>

      <div className="mb-6">
        <AdBanner slot="leaderboard" />
        <AdBanner slot="banner" />
      </div>

      {/* 월드맵 — earn 카테고리 게임만 */}
      <GameWorldMap games={byCat.get("earn") ?? games} />

      {/* 멀티플레이 / 꾸미기 게임은 기존 카드로 */}
      {GAME_CATEGORY_ORDER.filter(cat => cat !== "earn").map((cat) => {
        const list = byCat.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={cat} className="mt-12">
            <h2 className="mb-4 break-words text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl dark:text-zinc-50">
              {t(CATEGORY_LABEL_KEY[cat])}
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
