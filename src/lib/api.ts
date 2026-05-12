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
    return "백엔드 서버로 요청을 전달하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.";
  }

  if (status > 0) {
    return `요청 처리 중 오류가 발생했습니다. (HTTP ${status})`;
  }
  return "네트워크 오류입니다. 연결과 백엔드 서버 상태를 확인해 주세요.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
};

const TOKEN_KEY = "gameworld_token";
const USER_KEY = "gameworld_user";

/** 같은 탭에서 로그인/로그아웃 후 헤더 등이 갱신되도록 알림 */
export const SESSION_CHANGE_EVENT = "gameworld-session-change";

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
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
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
    notifySessionChange();
  },
  /** 서버에서 받은 최신 프로필로 로컬 사용자 정보만 갱신 (토큰 유지) */
  updateStoredUser(user: User) {
    if (typeof window === "undefined") return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    notifySessionChange();
  },
};
