import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // 모든 경로에서 locale 라우팅 적용, 단 다음은 제외:
  //   - api/*       : 백엔드 프록시
  //   - ingest/*    : PostHog 리버스 프록시 (광고차단기 우회)
  //   - _next/*     : Next.js 내부 자산
  //   - _vercel/*   : Vercel 인프라
  //   - *.<ext>     : 정적 파일 (favicon.ico, images, fonts 등)
  matcher: ["/((?!api|ingest|_next|_vercel|.*\\..*).*)"],
};
