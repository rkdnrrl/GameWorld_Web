'use client';
/**
 * 게임 로직 레이어 — 스크립트가 쓰는 게임 상태(변수) + 화면 UI(HUD) + 사운드.
 *
 * 샌드박스 지향: 간단한 게임은 ui.text 한 줄, 복잡한 게임은 여러 HUD 요소 + 상태로 조립.
 * 스크립트 전역(jsRuntime 가 주입):
 *   game.get(key, default?) / game.set(key, value) / game.add(key, n=1) → number
 *   ui.text(id, text, opts?)               opts: {x,y(0~1), size, color, bg, align}
 *   ui.bar(id, value, max, opts?)          opts: {x,y(0~1), size(높이), color, bg}
 *   ui.clear(id) / ui.clearAll()
 *   world.playSound(url, opts?)            opts: {volume(0~1), loop}
 *
 * 호스트(WorldCanvas / 스튜디오 SimScene)가 createGameRuntime() 로 스토어를 만들어
 * api 를 각 스크립트 init() 에 넘기고, <GameHud runtime={...}/> 가 hud 를 화면에 그린다.
 *
 * 현재 상태/HUD 는 클라이언트 로컬 — 스튜디오 시뮬레이션 + 솔로 플레이(=호스트)에 완전 동작.
 * (멀티에서 비호스트 동기화는 후속 단계.)
 */

export interface HudElement {
  id: string;
  type: 'text' | 'bar';
  text?: string;
  value?: number;     // bar: 현재값
  max?: number;       // bar: 최대값
  x: number;          // 0~1 화면 가로 비율 (앵커)
  y: number;          // 0~1 화면 세로 비율 (앵커)
  size?: number;      // text: 폰트 px / bar: 높이 px
  color?: string;     // 글자색 / 바 채움색
  bg?: string;        // 배경(text) / 바 트랙색(bar)
  align?: 'left' | 'center' | 'right';
}

/** 스크립트 런타임에 주입되는 게임 API (jsRuntime 이 game/ui/world.playSound 로 감싸 노출). */
export interface JsGameAPI {
  stateGet(key: string): unknown;
  stateSet(key: string, value: unknown): void;
  stateAdd(key: string, delta: number): number;
  hudSet(el: HudElement): void;
  hudClear(id: string): void;
  hudClearAll(): void;
  playSound(url: string, opts?: { volume?: number; loop?: boolean }): void;
}

export interface GameRuntimeStore {
  api: JsGameAPI;
  /** 현재 HUD 요소 맵 (GameHud 가 읽음). */
  getHud(): Map<string, HudElement>;
  /** HUD 변경 알림 구독 (GameHud 재렌더용). 해제 함수 반환. */
  subscribe(listener: () => void): () => void;
  /** 시뮬레이션 시작/종료 시 상태·HUD 초기화. */
  reset(): void;
}

/** 게임 상태 + HUD + 사운드를 담는 스토어 1개 생성 (월드/시뮬당 1개). */
export function createGameRuntime(): GameRuntimeStore {
  const state = new Map<string, unknown>();
  const hud = new Map<string, HudElement>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };

  const api: JsGameAPI = {
    stateGet: (k) => state.get(k),
    stateSet: (k, v) => { state.set(k, v); },
    stateAdd: (k, d) => {
      const v = (Number(state.get(k)) || 0) + (Number(d) || 0);
      state.set(k, v);
      return v;
    },
    hudSet: (el) => { hud.set(el.id, el); notify(); },
    hudClear: (id) => { if (hud.delete(id)) notify(); },
    hudClearAll: () => { if (hud.size) { hud.clear(); notify(); } },
    playSound: (url, opts) => {
      if (!url || typeof window === 'undefined') return;
      try {
        const a = new Audio(url);
        a.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
        a.loop = Boolean(opts?.loop);
        a.play().catch(() => { /* 브라우저 자동재생 정책 — 사용자 제스처 후엔 정상 재생 */ });
      } catch { /* noop */ }
    },
  };

  return {
    api,
    getHud: () => hud,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    reset: () => { state.clear(); hud.clear(); notify(); },
  };
}
