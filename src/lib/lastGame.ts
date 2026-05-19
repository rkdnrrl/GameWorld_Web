/**
 * 마지막으로 진입한 게임 추적 — "이어하기" 카드 표시용.
 * 카드 클릭 / 던전 씬 문 진입 양쪽에서 호출.
 */
const KEY = "alp_last_game_id";

export function saveLastGameId(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

export function loadLastGameId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
