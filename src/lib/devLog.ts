/**
 * 개발 환경 전용 로거 — 프로덕션 빌드에서 콘솔 소음 제거.
 *
 * 사용법:
 *   import { devLog, devWarn, devError } from "@/lib/devLog";
 *   devLog("[StudioCanvas] something happened", data);
 *
 * 운영 노출이 필요한 진짜 에러는 `console.error` 그대로 + Sentry 자동 캡처.
 * 디버그·트레이스용 노이즈만 이걸로 마이그레이션할 것.
 */
const isDev =
  typeof process !== "undefined" &&
  process.env.NODE_ENV !== "production";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devLog(...args: any[]): void {
  if (isDev) console.log(...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devWarn(...args: any[]): void {
  if (isDev) console.warn(...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devError(...args: any[]): void {
  if (isDev) console.error(...args);
}
