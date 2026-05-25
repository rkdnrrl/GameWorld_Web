import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 모바일/Chrome 환경 인증 안정성을 위해 PKCE 사용
export const supabase = createClient(url, key, {
  auth: { flowType: "pkce" },
});
