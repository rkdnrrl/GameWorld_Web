/**
 * UI Button onClick 스크립트 실행 — game/ui/world.playSound API 주입.
 *
 * jsRuntime(Interpreter) 가 아닌 네이티브 new Function — 빠르고 ALP 일반 스크립트와 별개.
 * 사용자가 작성한 짧은 onClick 동작용 (예: game.add('score', 1); ui.set('label', { text: '+1' }))
 */
import type { JsGameAPI } from './gameRuntime';

export function execUiButtonScript(script: string, api: JsGameAPI): void {
  if (!script || !script.trim()) return;
  // game/ui/world.playSound 래퍼 — jsRuntime 과 동일 API 표면
  const numOr = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const game = {
    get: (k: unknown, d?: unknown) => { const v = api.stateGet(String(k)); return v === undefined ? (d ?? null) : v; },
    set: (k: unknown, v: unknown) => { api.stateSet(String(k), v); },
    add: (k: unknown, n?: unknown) => api.stateAdd(String(k), numOr(n, 1)),
  };
  const ui = {
    text: (id: unknown, text: unknown, opts?: Record<string, unknown>) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      api.hudSet({ id: String(id), type: 'text', text: String(text),
        x: numOr(o.x, 0.5), y: numOr(o.y, 0.08),
        size: o.size != null ? Number(o.size) : undefined,
        color: o.color != null ? String(o.color) : undefined,
        bg: o.bg != null ? String(o.bg) : undefined,
        align: (o.align === 'left' || o.align === 'right') ? o.align : 'center' });
    },
    bar: (id: unknown, value: unknown, max?: unknown, opts?: Record<string, unknown>) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      api.hudSet({ id: String(id), type: 'bar', value: numOr(value, 0), max: numOr(max, 100),
        x: numOr(o.x, 0.5), y: numOr(o.y, 0.92),
        size: o.size != null ? Number(o.size) : undefined,
        color: o.color != null ? String(o.color) : undefined,
        bg: o.bg != null ? String(o.bg) : undefined });
    },
    clear: (id: unknown) => api.hudClear(String(id)),
    clearAll: () => api.hudClearAll(),
    set: (label: unknown, patch: unknown) => {
      if (patch && typeof patch === 'object') api.uiSet?.(String(label), patch as Record<string, unknown>);
    },
    show: (label: unknown) => api.uiVisible?.(String(label), true),
    hide: (label: unknown) => api.uiVisible?.(String(label), false),
  };
  const world = {
    playSound: (url: unknown, o?: { volume?: number; loop?: boolean }) => api.playSound(String(url), o),
  };
  try {
    const fn = new Function('game', 'ui', 'world', script);
    fn(game, ui, world);
  } catch (e) {
    console.error('[ui-button-script] 실행 오류:', e, '\n--- script ---\n' + script);
  }
}
