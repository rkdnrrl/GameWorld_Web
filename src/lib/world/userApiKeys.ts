/**
 * 유저 개인 API 키 저장소 — 유저가 임의 이름으로 등록.
 *
 * UX:
 *   - 유저가 UI 에서 "myGpt" 같은 이름 + 인증 방식 (Bearer / 커스텀 헤더) + 키 값 등록
 *   - 스크립트는 이름으로 참조: api.callMyApi("myGpt", url, options, resultKey)
 *   - 런타임이 fetch 시 인증 헤더 자동 주입 — 스크립트는 키 값 못 봄
 *
 * 보안:
 *   - localStorage 캐시 (jsRuntime 동기 접근 필요)
 *   - 서버 DB AES-256-GCM 암호화 (다른 디바이스 sync)
 *   - 서버 row 의 service 컬럼 = 유저 지정 이름. encryptedKey = JSON 전체 암호화.
 */

const STORAGE_KEY = 'alp.userApiKeys';

export type AuthType = 'bearer' | 'custom';

export interface ApiKeyConfig {
  /** auth 방식 — bearer: "Authorization: Bearer {value}", custom: 지정 헤더 */
  authType: AuthType;
  /** custom 일 때 헤더 이름 (예: 'x-api-key', 'anthropic-version' 같이 부가 헤더면 별도 옵션 권장) */
  customHeader?: string;
  /** 실제 키 / 토큰 값 */
  value: string;
  /** UI 표시용 라벨 (선택) */
  label?: string;
}

interface KeyStore {
  [name: string]: ApiKeyConfig;
}

const VALID_NAME = /^[a-zA-Z0-9_-]{1,40}$/;

function readStore(): KeyStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeStore(store: KeyStore): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* quota or disabled */ }
}

export function isValidApiName(name: string): boolean {
  return VALID_NAME.test(name);
}

export function getApiKeyConfig(name: string): ApiKeyConfig | null {
  if (!isValidApiName(name)) return null;
  return readStore()[name] || null;
}

export function setApiKeyConfig(name: string, config: ApiKeyConfig): void {
  if (!isValidApiName(name)) throw new Error('이름은 영숫자·_·- 만 (1~40자)');
  if (!config.value || !config.value.trim()) throw new Error('키 값 필요');
  if (config.authType === 'custom' && !config.customHeader?.trim()) throw new Error('custom 인증은 헤더 이름 필요');
  const store = readStore();
  store[name] = { ...config, value: config.value.trim() };
  writeStore(store);
}

export function removeApiKey(name: string): void {
  const store = readStore();
  delete store[name];
  writeStore(store);
}

export function listApiKeys(): Array<{ name: string; config: ApiKeyConfig }> {
  const store = readStore();
  return Object.keys(store).map((name) => ({ name, config: store[name] }));
}

/** 런타임이 fetch 시 호출 — 어느 헤더에 어떤 값을 주입할지. null = 키 없음. */
export function getAuthHeader(name: string): { headerName: string; headerValue: string } | null {
  const config = getApiKeyConfig(name);
  if (!config) return null;
  if (config.authType === 'bearer') {
    return { headerName: 'Authorization', headerValue: `Bearer ${config.value}` };
  }
  if (config.authType === 'custom' && config.customHeader) {
    return { headerName: config.customHeader, headerValue: config.value };
  }
  return null;
}

/* ── 서버 sync — DB AES-256-GCM 암호화 (다른 디바이스 공유) ───── */

const API_BASE = (typeof window !== 'undefined' && (window as { __ALP_API__?: string }).__ALP_API__) || 'https://airliveplay.com';

async function getAuthHeaderForApi(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const mod = await import('@/lib/api');
    const tok = mod.session?.getToken?.();
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch { return {}; }
}

export async function syncFromServer(): Promise<void> {
  const headers = await getAuthHeaderForApi();
  if (!headers.Authorization) return;
  try {
    const listRes = await fetch(`${API_BASE}/api/user/api-keys`, { headers });
    if (!listRes.ok) return;
    const { services } = await listRes.json();
    if (!Array.isArray(services)) return;
    const store: KeyStore = {};
    await Promise.all(services.map(async (s: { service: string }) => {
      try {
        const r = await fetch(`${API_BASE}/api/user/api-keys/${encodeURIComponent(s.service)}`, { headers });
        if (!r.ok) return;
        const data = await r.json();
        // 서버는 key 필드에 JSON 문자열 (암호화 전 원본) 반환
        if (typeof data.key === 'string') {
          try {
            const cfg = JSON.parse(data.key) as ApiKeyConfig;
            if (cfg && cfg.value && cfg.authType) store[s.service] = cfg;
          } catch { /* 옛 평문 키일 수 있음 — 무시 */ }
        }
      } catch { /* 한 키 실패해도 진행 */ }
    }));
    writeStore(store);
  } catch (e) {
    console.warn('[userApiKeys] syncFromServer 실패:', (e as Error).message);
  }
}

export async function syncToServer(name: string): Promise<boolean> {
  const headers = await getAuthHeaderForApi();
  if (!headers.Authorization) return false;
  const config = getApiKeyConfig(name);
  if (!config) return false;
  try {
    const r = await fetch(`${API_BASE}/api/user/api-keys/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      // 전체 config 를 JSON 문자열로 — 서버가 한 덩어리로 암호화
      body: JSON.stringify({ key: JSON.stringify(config) }),
    });
    return r.ok;
  } catch { return false; }
}

export async function removeFromServer(name: string): Promise<boolean> {
  const headers = await getAuthHeaderForApi();
  if (!headers.Authorization) return false;
  try {
    const r = await fetch(`${API_BASE}/api/user/api-keys/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers,
    });
    return r.ok;
  } catch { return false; }
}
