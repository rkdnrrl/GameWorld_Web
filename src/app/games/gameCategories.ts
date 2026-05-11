import type { Game, GameCategory } from "@/components/GameCard";

/** 목록에 표시할 순서 */
export const GAME_CATEGORY_ORDER: GameCategory[] = [
  "earn",
  "multiplay",
  "decorate",
  "other",
];

export const GAME_CATEGORY_LABEL: Record<GameCategory, string> = {
  earn: "리워드 게임",
  multiplay: "멀티플레이 게임",
  decorate: "꾸미기 게임",
  other: "기타",
};

export function normalizeCategory(game: Game): GameCategory {
  const c = game.category;
  if (c === "earn" || c === "multiplay" || c === "decorate" || c === "other") {
    return c;
  }
  return "other";
}

export function groupGamesByCategory(games: Game[]): Map<GameCategory, Game[]> {
  const map = new Map<GameCategory, Game[]>();
  for (const key of GAME_CATEGORY_ORDER) {
    map.set(key, []);
  }
  for (const game of games) {
    const cat = normalizeCategory(game);
    map.get(cat)!.push(game);
  }
  return map;
}
