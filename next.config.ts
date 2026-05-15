import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// 백엔드 주소. 빌드/서버 시작 시점에 평가됨.
// - 로컬: 미설정 → http://localhost:4000 (default)
// - Vercel: BACKEND_URL=http://<Lightsail_IP>:4000 (Vercel 환경변수에 등록)
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
