import { NextResponse } from "next/server";

// next.config.ts 의 rewrites 와 동일한 기본값
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

/**
 * Next 서버에서 백엔드로 직접 요청해 TCP/HTTP 연결 가능 여부만 확인합니다.
 * (브라우저의 /api/* 는 rewrite 되므로 이 경로는 /api 밖에 둡니다.)
 */
export async function GET() {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    void res.status;
    return NextResponse.json({ ok: true as const });
  } catch {
    return NextResponse.json({
      ok: false as const,
      backendUrl: BACKEND_URL,
    });
  }
}
