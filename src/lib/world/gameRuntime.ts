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
 *   api.startFetch(url, key) → boolean     인증 없는 GET. HTTPS·credentials:omit·분당 30회
 *   api.callMyApi(keyName, url, options, resultKey) → boolean   본인 등록 키로 임의 호출
 *     options: { method? = 'GET', body? (object → JSON), headers? }
 *     인증 헤더는 런타임이 자동 주입 — 스크립트는 키 값 못 봄
 *   api.getResult(key) → null | { ok, data?, error? }   polling 으로 결과 받기
 *   api.clearResult(key) / api.isPending(key) / api.hasMyApi(keyName)
 *
 * 호스트(WorldCanvas / 스튜디오 SimScene)가 createGameRuntime() 로 스토어를 만들어
 * api 를 각 스크립트 init() 에 넘기고, <GameHud runtime={...}/> 가 hud 를 화면에 그린다.
 *
 * 현재 상태/HUD 는 클라이언트 로컬 — 스튜디오 시뮬레이션 + 솔로 플레이(=호스트)에 완전 동작.
 * (멀티에서 비호스트 동기화는 후속 단계.)
 */

export interface HudElement {
  id: string;
  type: 'text' | 'bar' | 'image';
  text?: string;
  value?: number;     // bar: 현재값
  max?: number;       // bar: 최대값
  url?: string;       // image: 이미지 URL
  w?: number;         // image: 가로 px
  h?: number;         // image: 세로 px
  x: number;          // 0~1 화면 가로 비율 (앵커)
  y: number;          // 0~1 화면 세로 비율 (앵커)
  size?: number;      // text: 폰트 px / bar: 높이 px
  color?: string;     // 글자색 / 바 채움색
  bg?: string;        // 배경(text) / 바 트랙색(bar)
  align?: 'left' | 'center' | 'right';
}

/** 멀티 동기화용 — 호스트가 전원에게 보내는 상태+HUD 전체 스냅샷. */
export interface GameSnapshot {
  state: Array<[string, unknown]>;
  hud: HudElement[];
}

/** 멀티 동기화 스크립트 이벤트 (sendScriptEvent 채널, objectId 는 '__game__' 센티넬). */
export const GAME_SYNC_EVENT = '__gamesync__';   // 호스트→전원: 상태+HUD 스냅샷
export const GAME_SOUND_EVENT = '__gamesound__'; // 호스트→전원: 사운드 재생

/** 스크립트 런타임에 주입되는 게임 API (jsRuntime 이 game/ui/world.playSound 로 감싸 노출). */
export interface JsGameAPI {
  stateGet(key: string): unknown;
  stateSet(key: string, value: unknown): void;
  stateAdd(key: string, delta: number): number;
  hudSet(el: HudElement): void;
  hudClear(id: string): void;
  hudClearAll(): void;
  playSound(url: string, opts?: { volume?: number; loop?: boolean }): void;
  /** UI 시스템 (kind === 'ui' 인 MapObject) 의 props 패치 — label 로 검색.
   *  호스트(StudioCanvas/WorldCanvas)가 setObjects 와 연결. 없으면 noop. */
  uiSet?: (label: string, patch: Record<string, unknown>) => void;
  /** UI 오브젝트 visibility 토글 — label 로 검색. */
  uiVisible?: (label: string, visible: boolean) => void;
  /** 맵 데이터 KV — 메모리 캐시 기반 동기 read/write.
   *  shared=true 면 맵 전역, false 면 플레이어 개인.
   *  set 은 메모리 + 백그라운드 서버 save (호스트만). load 는 메모리만. */
  dataGet?:  (key: string, shared: boolean) => unknown;
  dataSet?:  (key: string, value: unknown, shared: boolean) => void;
  dataAll?:  (shared: boolean) => Record<string, unknown>;
}

export interface GameRuntimeStore {
  api: JsGameAPI;
  /** 현재 HUD 요소 맵 (GameHud 가 읽음). */
  getHud(): Map<string, HudElement>;
  /** HUD 변경 알림 구독 (GameHud 재렌더용). 해제 함수 반환. */
  subscribe(listener: () => void): () => void;
  /** 시뮬레이션 시작/종료 시 상태·HUD 초기화. */
  reset(): void;
  // ── 멀티 동기화 (월드 호스트만 사용; 스튜디오 시뮬은 안 씀) ──
  /** 마지막 takeSnapshot 이후 상태/HUD 가 바뀌었는지. */
  isDirty(): boolean;
  /** 강제로 dirty 표시 (새 플레이어 입장 시 재전송용). */
  markDirty(): void;
  /** 현재 상태+HUD 스냅샷 반환 + dirty 클리어 (호스트 broadcast). */
  takeSnapshot(): GameSnapshot;
  /** 수신한 스냅샷 적용 — 상태+HUD 교체, 재전송 안 함 (비호스트). */
  applySnapshot(snap: GameSnapshot): void;
  /** 수신한 사운드 로컬 재생 (비호스트). */
  playRemoteSound(url: string, opts?: { volume?: number; loop?: boolean }): void;
  /** 맵 데이터 캐시 — 호스트가 서버에서 load 후 한 번에 채움 (scope 별). */
  loadDataSnapshot(entries: Array<{ key: string; value: unknown; shared: boolean }>): void;
  /** 단일 entry 적용 — broadcast 수신용. */
  applyDataPatch(key: string, value: unknown, shared: boolean): void;
}

/**
 * 게임 상태 + HUD + 사운드를 담는 스토어 1개 생성 (월드/시뮬당 1개).
 * opts.onSound: 스크립트가 world.playSound 를 호출할 때마다 불림 — 호스트가 전원에게 broadcast 하는 용도.
 *   (비호스트는 스크립트가 안 도므로 playSound 가 안 불림 → onSound 도 안 불림.)
 */
export function createGameRuntime(opts?: {
  onSound?: (url: string, o?: { volume?: number; loop?: boolean }) => void;
  /** UI 시스템(kind='ui' MapObject) props 패치 콜백 — 호스트가 setObjects 로 연결. */
  onUiSet?: (label: string, patch: Record<string, unknown>) => void;
  /** UI 오브젝트 visibility 콜백. */
  onUiVisible?: (label: string, visible: boolean) => void;
  /** 맵 데이터 변경 시 호스트가 받음 — 서버 save + broadcast 용. */
  onDataSet?: (key: string, value: unknown, shared: boolean) => void;
}): GameRuntimeStore {
  const state = new Map<string, unknown>();
  const hud = new Map<string, HudElement>();
  // 맵 데이터 KV 캐시 — 개인(mine) / 전역(shared) 분리.
  // load 시 서버에서 받아 채움 (호스트). set 시 메모리 + onDataSet 콜백 (호스트 save + broadcast).
  const mineData = new Map<string, unknown>();
  const sharedData = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  let dirty = false;
  const notify = () => { for (const l of listeners) l(); };

  const playLocal = (url: string, o?: { volume?: number; loop?: boolean }) => {
    if (!url || typeof window === 'undefined') return;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, o?.volume ?? 1));
      a.loop = Boolean(o?.loop);
      a.play().catch(() => { /* 브라우저 자동재생 정책 — 사용자 제스처 후엔 정상 재생 */ });
    } catch { /* noop */ }
  };

  const api: JsGameAPI = {
    stateGet: (k) => state.get(k),
    stateSet: (k, v) => { state.set(k, v); dirty = true; },
    stateAdd: (k, d) => {
      const v = (Number(state.get(k)) || 0) + (Number(d) || 0);
      state.set(k, v); dirty = true;
      return v;
    },
    hudSet: (el) => { hud.set(el.id, el); dirty = true; notify(); },
    hudClear: (id) => { if (hud.delete(id)) { dirty = true; notify(); } },
    hudClearAll: () => { if (hud.size) { hud.clear(); dirty = true; notify(); } },
    playSound: (url, o) => { playLocal(String(url), o); opts?.onSound?.(String(url), o); },
    uiSet:     (label, patch) => opts?.onUiSet?.(String(label), patch),
    uiVisible: (label, v)     => opts?.onUiVisible?.(String(label), !!v),
    dataGet:   (key, shared) => (shared ? sharedData : mineData).get(String(key)),
    dataSet:   (key, value, shared) => {
      (shared ? sharedData : mineData).set(String(key), value);
      opts?.onDataSet?.(String(key), value, !!shared);
    },
    dataAll:   (shared) => {
      const m = shared ? sharedData : mineData;
      const obj: Record<string, unknown> = {};
      for (const [k, v] of m) obj[k] = v;
      return obj;
    },
  };

  return {
    api,
    getHud: () => hud,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    reset: () => { state.clear(); hud.clear(); dirty = true; notify(); },
    isDirty: () => dirty,
    markDirty: () => { dirty = true; },
    takeSnapshot: () => { dirty = false; return { state: [...state.entries()], hud: [...hud.values()] }; },
    applySnapshot: (snap) => {
      state.clear();
      for (const [k, v] of snap.state || []) state.set(k, v);
      hud.clear();
      for (const el of snap.hud || []) if (el && el.id) hud.set(el.id, el);
      notify();
    },
    playRemoteSound: (url, o) => playLocal(String(url), o),
    loadDataSnapshot: (entries) => {
      mineData.clear(); sharedData.clear();
      for (const e of entries) {
        if (e.shared) sharedData.set(e.key, e.value);
        else          mineData.set(e.key, e.value);
      }
    },
    applyDataPatch: (key, value, shared) => {
      (shared ? sharedData : mineData).set(key, value);
    },
  };
}
