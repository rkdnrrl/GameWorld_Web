// 백엔드 호출은 모두 상대 경로 /api/* 로 보냄.
// Next.js의 rewrites가 BACKEND_URL로 프록시 (next.config.ts).
// 이렇게 하면 브라우저는 항상 같은 origin → CORS / Mixed Content 문제 없음.

export type User = {
  id: string;
  email: string;
  nickname: string;
  coins: number;
  createdAt: string;
  /** DB 플래그 (선택) */
  isOperator?: boolean;
  /** 이메일 화이트리스트 등 포함한 운영 콘솔 접근 가능 여부 */
  operatorAccess?: boolean;
};

/** 우주 낚시 등에서 저장하는 픽셀 스프라이트 (서버 JSONB) */
export type CatchPixelArt = {
  w: number;
  h: number;
  palette: string[];
  cells: number[];
};

export type CatchItem = {
  id: string;
  itemName: string;
  itemEmoji: string;
  itemType: string;
  rarity: string;
  size: number | null;
  coinValue: number;
  sold: boolean;
  soldAt: string | null;
  caughtAt: string;
  pixelArt?: CatchPixelArt | null;
};

export type SharedPixelArtSummary = {
  name: string;
  rarity: string;
  type: string;
  createdAt: string;
  /** 목록 요청 시 includeImageData=1 이면 포함 */
  imageData?: string;
};

export type SharedPixelArtListResponse = {
  items: SharedPixelArtSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SharedPixelArtFull = SharedPixelArtSummary & { imageData: string };

export type AuthResponse = {
  user: User;
  token: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/** 백엔드마다 다른 JSON 오류 형식을 최대한 해석 */
function extractApiErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;

    const nested = o.error;
    if (nested && typeof nested === "object" && nested !== null) {
      const msg = (nested as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }

    if (typeof o.message === "string" && o.message.trim()) {
      return o.message.trim();
    }
    if (Array.isArray(o.message) && o.message.length > 0) {
      const parts = o.message.filter((x) => typeof x === "string") as string[];
      if (parts.length) return parts.join(" ");
    }

    if (typeof o.error === "string" && o.error.trim()) {
      return o.error.trim();
    }
    if (typeof o.detail === "string" && o.detail.trim()) {
      return o.detail.trim();
    }
  }

  if (status === 401 || status === 403) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (status === 404) {
    return "로그인 API를 찾을 수 없습니다. 백엔드 주소(BACKEND_URL)와 경로를 확인해 주세요.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (status > 0) {
    return `요청 처리 중 오류가 발생했습니다. (HTTP ${status})`;
  }
  return "네트워크 오류입니다. 연결과 백엔드 서버 상태를 확인해 주세요.";
}

/** Supabase refresh token으로 access_token 갱신 (동시 호출 중복 방지) */
let _refreshingPromise: Promise<boolean> | null = null;
async function tryRefreshToken(): Promise<boolean> {
  if (_refreshingPromise) return _refreshingPromise;
  _refreshingPromise = (async () => {
    try {
      const refreshToken = session.getRefreshToken();
      if (!refreshToken) return false;
      const { supabase } = await import("./supabase");
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) return false;
      session.save({ token: data.session.access_token, user: session.getUser()! });
      session.saveRefreshInfo(data.session.refresh_token, data.session.expires_at ?? 0);
      return true;
    } catch {
      return false;
    } finally {
      _refreshingPromise = null;
    }
  })();
  return _refreshingPromise;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // 토큰이 곧 만료되면 미리 갱신
  if (session.isNearExpiry()) {
    await tryRefreshToken();
  }
  const hasBody =
    init.body !== undefined && init.body !== null && init.body !== "";

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, extractApiErrorMessage(null, 0));
  }

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = {};
    }
  }

  if (!res.ok) {
    // 토큰 만료·무효 → refresh 시도 후 1회 재시도, 실패 시 로그아웃
    if (res.status === 401) {
      const wasLoggedIn = !!session.getToken();
      const refreshed = wasLoggedIn ? await tryRefreshToken() : false;
      if (refreshed) {
        // 새 토큰으로 재시도
        const newToken = session.getToken();
        const retryInit = {
          ...init,
          headers: { ...(init.headers || {}), Authorization: newToken ? `Bearer ${newToken}` : "" },
        };
        const retryRes = await fetch(path, retryInit);
        if (retryRes.ok) {
          const retryText = await retryRes.text();
          return (retryText ? JSON.parse(retryText) : {}) as T;
        }
      }
      session.clear();
      if (wasLoggedIn && typeof window !== "undefined") {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    const message = extractApiErrorMessage(data, res.status);
    throw new ApiError(res.status, message);
  }

  return data as T;
}

export const api = {
  signup(input: { email: string; nickname: string; password: string }) {
    return request<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  /** Bearer 필요. 백엔드가 `{ user }` 형태로 응답한다고 가정 */
  me(token: string) {
    return request<{ user: User }>("/api/auth/me", {
      method: "GET",
      headers: authHeaders(token),
    });
  },
  /**
   * 닉네임 변경. 백엔드 예: `PATCH /api/auth/me` body `{ nickname }`
   * 응답은 `{ user }` 또는 로그인과 동일한 `{ user, token }` 모두 허용
   */
  updateProfile(token: string, input: { nickname: string }) {
    return request<{ user: User; token?: string }>("/api/auth/me", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    });
  },
  /**
   * 회원 탈퇴. 백엔드 예: `DELETE /api/auth/me`
   * 비밀번호 확인이 필요하면 백엔드·이 호출 시그니처를 함께 맞추면 됩니다.
   */
  deleteAccount(token: string) {
    return request<Record<string, unknown>>("/api/auth/me", {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 보관함 (미판매 아이템) 조회 */
  getInventory(token: string, page = 1, limit = 50) {
    return request<{
      catches: CatchItem[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/catches/inventory?page=${page}&limit=${limit}`, {
      headers: authHeaders(token),
    });
  },

  /** 아이템 판매 — ids 배열 또는 all: true */
  sellCatches(token: string, body: { ids?: string[]; all?: boolean }) {
    return request<{ sold: number; coinsEarned: number; totalCoins: number }>(
      "/api/catches/sell",
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      }
    );
  },

  /** 운영자: shared_pixel_arts 목록 — includeImageData 로 썸네일용 imageData 포함 가능 */
  operatorListSharedPixelArts(
    token: string,
    opts?: {
      q?: string;
      page?: number;
      limit?: number;
      /** true 이면 각 행에 imageData 포함(응답 크기 큼, 서버에서 limit 최대 60) */
      includeImageData?: boolean;
    },
  ) {
    const qs = new URLSearchParams();
    qs.set("page", String(opts?.page ?? 1));
    qs.set("limit", String(opts?.limit ?? 50));
    if (opts?.q?.trim()) qs.set("q", opts.q.trim());
    if (opts?.includeImageData) qs.set("includeImageData", "1");
    return request<SharedPixelArtListResponse>(
      `/api/operator/shared-pixel-arts?${qs.toString()}`,
      { headers: authHeaders(token) },
    );
  },

  operatorGetSharedPixelArt(token: string, name: string) {
    const qs = new URLSearchParams({ name });
    return request<{ item: SharedPixelArtFull }>(
      `/api/operator/shared-pixel-arts/one?${qs.toString()}`,
      { headers: authHeaders(token) },
    );
  },

  operatorPatchSharedPixelArt(
    token: string,
    name: string,
    body: { rarity?: string; type?: string; imageData?: string },
  ) {
    const qs = new URLSearchParams({ name });
    return request<{ item: SharedPixelArtFull }>(
      `/api/operator/shared-pixel-arts/one?${qs.toString()}`,
      {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      },
    );
  },

  operatorBulkDeletePreview(token: string, from: string, to: string) {
    const qs = new URLSearchParams({ from, to });
    return request<{ count: number }>(
      `/api/operator/shared-pixel-arts/bulk-delete-preview?${qs.toString()}`,
      { headers: authHeaders(token) },
    );
  },

  operatorBulkDelete(token: string, from: string, to: string) {
    return request<{ ok: boolean; deleted: number }>(
      "/api/operator/shared-pixel-arts/bulk-delete",
      {
        method: "DELETE",
        headers: authHeaders(token),
        body: JSON.stringify({ from, to }),
      },
    );
  },

  operatorDeleteSharedPixelArt(token: string, name: string) {
    const qs = new URLSearchParams({ name });
    return request<{ ok: boolean; deleted: string }>(
      `/api/operator/shared-pixel-arts/one?${qs.toString()}`,
      {
        method: "DELETE",
        headers: authHeaders(token),
      },
    );
  },

  operatorActivityLogs(
    token: string,
    opts?: { action?: string; nickname?: string; page?: number; limit?: number },
  ) {
    const qs = new URLSearchParams();
    qs.set("page",  String(opts?.page  ?? 1));
    qs.set("limit", String(opts?.limit ?? 50));
    if (opts?.action   && opts.action !== "all") qs.set("action",   opts.action);
    if (opts?.nickname?.trim())                  qs.set("nickname", opts.nickname.trim());
    return request<{
      items: {
        id: string;
        userId: string;
        nickname: string;
        action: string;
        detail: Record<string, unknown>;
        createdAt: string;
      }[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/operator/activity-logs?${qs.toString()}`, { headers: authHeaders(token) });
  },

  operatorSmeltCatalog(token: string) {
    return request<{ items: { id: string; name: string; emoji: string }[] }>(
      "/api/operator/smelt-stock/catalog",
      { headers: authHeaders(token) },
    );
  },

  operatorGrantSmeltStock(
    token: string,
    targetNickname: string,
    items: { productId: string; count: number }[],
  ) {
    return request<{
      ok: boolean;
      targetNickname: string;
      granted: { productId: string; name: string; emoji: string; count: number }[];
      errors: string[];
    }>("/api/operator/smelt-stock/grant", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ targetNickname, items }),
    });
  },

  operatorEquipArtStatus(token: string) {
    return request<{
      total: number;
      cached: number;
      missing: number;
      items: { noun: string; slot: string; hasCache: boolean }[];
    }>("/api/operator/equip-art/status", { headers: authHeaders(token) });
  },

  craftEquipArtGenerateOne(token: string, noun: string) {
    return request<{ ok: boolean; noun: string; imageDataUrl: string }>(
      "/api/craft/equip-art/generate-one",
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ noun }),
      },
    );
  },

  operatorFishingItemsStatus(token: string) {
    return request<{
      total: number;
      cached: number;
      missing: number;
      items: { name: string; emoji: string; tier: string; hasCache: boolean }[];
    }>("/api/operator/fishing-items/status", { headers: authHeaders(token) });
  },

  donateConfirm(
    token: string,
    body: { paymentKey: string; orderId: string; amount: number },
  ) {
    return request<{ ok: boolean; coins: number; amount: number; alreadyProcessed?: boolean }>(
      "/api/donate/confirm",
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      },
    );
  },

  aiFishingItemsGenerateOne(token: string, nounName: string) {
    return request<{ ok: boolean; nounName: string; name: string; emoji: string; imageUrl: string }>(
      "/api/ai/fishing-items/generate-one",
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ nounName }),
      },
    );
  },
};

const TOKEN_KEY         = "gameworld_token";
const USER_KEY          = "gameworld_user";
const REFRESH_TOKEN_KEY = "gameworld_refresh_token";
const EXPIRES_AT_KEY    = "gameworld_expires_at"; // Unix 초

/** 같은 탭에서 로그인/로그아웃 후 헤더 등이 갱신되도록 알림 */
export const SESSION_CHANGE_EVENT = "gameworld-session-change";
/** 401 등으로 서버가 세션을 거부했을 때 (강제 로그아웃) */
export const SESSION_EXPIRED_EVENT = "gameworld-session-expired";

function notifySessionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export const session = {
  save({ token, user }: AuthResponse) {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notifySessionChange();
  },
  /** 로그인 시 refresh token + 만료 시각 함께 저장 */
  saveRefreshInfo(refreshToken: string, expiresAt: number) {
    if (typeof window === "undefined") return;
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  /** 토큰이 60초 이내 만료되는지 확인 */
  isNearExpiry(): boolean {
    if (typeof window === "undefined") return false;
    const raw = localStorage.getItem(EXPIRES_AT_KEY);
    if (!raw) return false;
    return Date.now() / 1000 > Number(raw) - 60;
  },
  getUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    notifySessionChange();
  },
  /** 서버에서 받은 최신 프로필로 로컬 사용자 정보만 갱신 (토큰 유지) */
  updateStoredUser(user: User) {
    if (typeof window === "undefined") return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notifySessionChange();
  },
};
