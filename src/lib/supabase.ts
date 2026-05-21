import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// PKCE flow — 모바일 Chrome 등 일부 환경에서 OAuth 안정성 향상.
// Airnuri Social SDK 권장 설정.
export const supabase = createClient(url, key, {
  auth: { flowType: "pkce" },
});
