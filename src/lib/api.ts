// 백엔드 호출은 모두 상대 경로 /api/* 로 보냄.
// Next.js의 rewrites가 BACKEND_URL로 프록시 (next.config.ts).
// 이렇게 하면 브라우저는 항상 같은 origin → CORS / Mixed Content 문제 없음.

export type User = {
  id: string;
  email: string;
  nickname: string;
  coins: number;
  createdAt: string;
};

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error?.message || "요청 처리 중 오류가 발생했습니다.";
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
};
