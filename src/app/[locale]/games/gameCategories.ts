import type { Game, GameCategory } from "@/components/GameCard";

/** 목록에 표시할 순서 (여기 없는 카테고리는 숨김) */
export const GAME_CATEGORY_ORDER: GameCategory[] = [
  "earn",
  "other",
];

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
    map.get(cat)?.push(game);
  }
  return map;
}
