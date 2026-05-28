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
  /** CommonDB 기준 userId — Google OAuth 사용자는 id와 다를 수 있음 */
  commonUserId?: string;
  /** 구독 여부 — true면 광고 숨김 */
  isSubscribed?: boolean;
  /** 구독 만료일 (ISO 문자열) */
  subscriptionUntil?: string | null;
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

/** 회원가입 응답: 이메일 인증 필요 시엔 토큰 없이 메시지만 */
export type SignupResponse =
  | AuthResponse
  | { requiresEmailConfirmation: true; email: string; message: string };

/** 게임 카테고리(장르) */
export type GameGenre = {
  slug: string;
  labelKo: string;
  labelEn: string;
  emoji: string;
  sortOrder: number;
  createdAt: string;
};

/** UGC 플랫폼 — games 테이블 한 행 */
export type GameCategory = {
  slug: string;
  labelKo: string;
  labelEn: string;
  emoji: string;
  sortOrder: number;
  createdAt: string;
};

export type AssetKind = {
  id: string;
  label: string;
  icon: string | null;
  extensions: string[];
  mimeTypes: string[];
  maxSizeMb: number;
  sortOrder: number;
  enabled: boolean;
  createdAt?: string;
};

export type CharacterAnimationSlot = {
  slot: "idle" | "walk" | "run" | "jump" | "crouch" | "prone";
  name?: string | null;
  assetId?: string | null;
  modelUrl: string;
  enabled?: boolean;
  updatedAt?: string;
};

export type FolderPack = {
  id: string;
  creatorId: string;
  path: string;
  isPublic: boolean;
  description: string | null;
  coverAssetId: string | null;
  importCount: number;
  createdAt: string;
  updatedAt: string;
};

export type UgcGame = {
  slug: string;
  ownerUserId: string | null;
  title: string;
  description: string | null;
  emoji: string;
  kind: "official" | "community";
  status: "pending" | "published" | "rejected" | "hidden";
  category: "earn" | "multiplay" | "decorate" | "other";
  genre: string | null;
  storagePath: string;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  screenshots: unknown;
  tags: unknown;
  statusUrl: string | null;
  maxPlayers: number | null;
  playCount: number;
  likeCount: number;
  version: number;
  rejectReason: string | null;
  pendingStoragePath: string | null;
  pendingVersion: number | null;
  pendingUploadedAt: string | null;
  pendingRejectReason: string | null;
  pendingThumbnailUrl: string | null;
  pendingDemoVideoUrl: string | null;
  pendingScreenshots: unknown;
  pendingMediaAt: string | null;
  pendingMediaRejectReason: string | null;
  titlesI18n: Record<string, string> | null;
  descriptionsI18n: Record<string, string> | null;
  featuredTextsI18n: Record<string, string> | null;
  pendingTitle: string | null;
  pendingDescription: string | null;
  pendingEmoji: string | null;
  pendingCategory: string | null;
  pendingTags: string[] | null;
  pendingTitlesI18n: Record<string, string> | null;
  pendingDescriptionsI18n: Record<string, string> | null;
  pendingMetaAt: string | null;
  pendingMetaRejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  isFeatured: boolean;
  featuredText: string | null;
  featuredTextX: number | null;
  featuredTextY: number | null;
};

export type EquipmentItem = {
  id: string;
  name: string;
  itemEmoji: string;
  emoji: string;
  tier: string;
  desc: string | null;
  stats: {
    attackBonus?: number;
    defenseBonus?: number;
    speedBonus?: number;
    hpBonus?: number;
    durability?: number;
    durabilityMax?: number;
    equipSlot?: string;
    [key: string]: unknown;
  };
  pixelArt: unknown;
  createdAt: string;
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

      // Supabase 갱신 후 플랫폼 JWT(7일)로 재교환 시도
      let platformToken = data.session.access_token;
      let platformExpiresAt = data.session.expires_at ?? 0;
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://airliveplay.com";
        const exRes = await fetch(`${API_BASE}/api/auth/exchange`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (exRes.ok) {
          const exData = await exRes.json() as { token?: string };
          if (exData.token) {
            platformToken = exData.token;
            platformExpiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7일
          }
        }
      } catch { /* 교환 실패 시 Supabase 토큰 폴백 */ }

      session.save({ token: platformToken, user: session.getUser()! });
      session.saveRefreshInfo(data.session.refresh_token, platformExpiresAt);
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

/** ALP World 세션 정보 (play.airliveplay.com 의 WORLD_LOBBIES DO 가 반환) */
export interface WorldSession {
  id:         string;
  name:       string;
  count:      number;
  maxPlayers: number;
  createdAt:  number;
  updatedAt:  number;
}

/** 특정 worldId 의 활성 세션 목록 조회. play.airliveplay.com 의 Worker 가 처리. */
export async function listWorldSessions(worldId: string): Promise<WorldSession[]> {
  const base = process.env.NEXT_PUBLIC_PLAY_URL || 'https://play.airliveplay.com';
  try {
    const r = await fetch(`${base}/_alp/world-sessions?worldId=${encodeURIComponent(worldId)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

/** 새 세션 id 생성 — 짧고 URL-safe. 친구한테 공유하기 좋게 6자. */
export function generateSessionId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const api = {
  signup(input: { email: string; nickname: string; password: string; redirectTo?: string }) {
    return request<SignupResponse>("/api/auth/signup", {
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
  /** Supabase 토큰 → 플랫폼 JWT (7일 만료) 교환 */
  exchange(token: string) {
    return request<{ token: string }>("/api/auth/exchange", {
      method: "POST",
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

  /** 보관함에서 아이템 제거 (코인 보상 없음). inventory_items 의 BigInt id 를 string 으로 전달. */
  deleteInventoryItem(token: string, id: string) {
    return request<{ ok: true }>(`/api/inventory/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
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

  /** 낚시 도감 */
  getFishingCompendium(token: string) {
    return request<{
      lifetimeTotal: number;
      byType: { type: string; count: number; coins: number }[];
      byRarity: { rarity: string; count: number }[];
      topItems: { name: string; emoji: string; type: string; rarity: string; count: number }[];
    }>("/api/catches/compendium", { headers: authHeaders(token) });
  },

  /** 일일 미션 조회 */
  getDailyMissions(token: string) {
    return request<{
      date: string;
      missions: { id: string; label: string; icon: string; target: number; reward: number; progress: number; completed: boolean; rewardPaid: boolean }[];
    }>("/api/missions/daily", { headers: authHeaders(token) });
  },

  /** 일일 미션 보상 수령 */
  claimMission(token: string, missionId: string) {
    return request<{ ok: boolean; reward: number; coins: number }>(
      "/api/missions/daily/claim",
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ missionId }) },
    );
  },

  /** 던전 개인 최고 기록 조회 */
  getDungeonRecord(token: string) {
    return request<{ record: { dungeonMaxFloor: number; dungeonMaxKills: number } | null }>(
      "/api/dungeon/record",
      { headers: authHeaders(token) },
    );
  },

  /** 상점 카탈로그 */
  getShopCatalog() {
    return request<{ items: { id: string; name: string; emoji: string; price: number; kind: string; desc: string }[] }>(
      "/api/shop/catalog",
    );
  },

  /** 상점 구매 */
  shopBuy(token: string, itemId: string, quantity: number) {
    return request<{ ok: boolean; itemId: string; itemName: string; quantity: number; spent: number; remainingCoins: number }>(
      "/api/shop/buy",
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ itemId, quantity }) },
    );
  },

  /** 보유 장비 목록 */
  getEquipment(token: string) {
    return request<{ equipment: EquipmentItem[] }>(
      "/api/craft/equipment",
      { headers: authHeaders(token) },
    );
  },

  /** 강화석 재고 */
  getEnhancementStock(token: string) {
    return request<{ stock: Record<string, number> }>(
      "/api/craft/enhancement-stock",
      { headers: authHeaders(token) },
    );
  },

  /** 장비 강화 */
  enhanceEquipment(token: string, equipId: string, itemType: string) {
    return request<{ ok: boolean; success: boolean; stats: Record<string, number> | null }>(
      `/api/craft/equipment/${equipId}/enhance`,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ itemType }) },
    );
  },

  /** 장비 수리 */
  repairEquipment(token: string, equipId: string, finalDur: number, totalCost: number) {
    return request<{ ok: boolean; costPaid: number; equipment: EquipmentItem }>(
      `/api/craft/equipment/${equipId}/repair`,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ finalDur, totalCost }) },
    );
  },

  /**
   * 게임 단일 조회 (공개 — 인증 불필요).
   * 응답 형식은 GET /api/games/:slug 와 동일하다.
   */
  getGame(slug: string) {
    return request<{
      game: {
        slug: string;
        title: string;
        description: string | null;
        emoji: string;
        kind: "official" | "community";
        category: string;
        tags: string[];
        thumbnailUrl: string | null;
        screenshots: string[];
        url: string;
        playCount?: number;
        likeCount?: number;
        publishedAt?: string | null;
      };
    }>(`/api/games/${encodeURIComponent(slug)}`);
  },

  /** 운영자: 모더레이션 대기 중인 UGC 게임 목록 */
  operatorListPendingGames(token: string) {
    return request<{ games: UgcGame[] }>("/api/operator/games/pending", {
      headers: authHeaders(token),
    });
  },

  /** 운영자: UGC 게임 승인 → status=published */
  operatorApproveGame(token: string, slug: string) {
    return request<{ game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/approve`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 운영자: UGC 게임 거절 → status=rejected, 사유 저장 */
  operatorRejectGame(token: string, slug: string, reason: string) {
    return request<{ game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/reject`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    });
  },

  /** 운영자: 이미 published 된 게임 숨김 → status=hidden */
  operatorHideGame(token: string, slug: string) {
    return request<{ game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/hide`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 운영자: hidden 게임 다시 공개 → status=published */
  operatorUnhideGame(token: string, slug: string) {
    return request<{ game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/unhide`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 운영자: 검수 대기 중인 재업로드 목록 */
  operatorListPendingUpdates(token: string) {
    return request<{ games: UgcGame[] }>("/api/operator/games/pending-updates", {
      headers: authHeaders(token),
    });
  },

  /** 운영자: 보류 업데이트 승인 → staging zip 을 라이브로 반영 */
  operatorApproveUpdate(token: string, slug: string) {
    return request<{ ok: true; game: UgcGame }>(
      `/api/operator/games/${encodeURIComponent(slug)}/approve-update`,
      { method: "POST", headers: authHeaders(token) },
    );
  },

  /** 운영자: 보류 업데이트 거절 → staging 폐기 + 사유 저장 */
  operatorRejectUpdate(token: string, slug: string, reason: string) {
    return request<{ ok: true; game: UgcGame }>(
      `/api/operator/games/${encodeURIComponent(slug)}/reject-update`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ reason }),
      },
    );
  },

  /** 운영자: 미디어 단독 검수 대기 목록 */
  operatorListPendingMedia(token: string) {
    return request<{ games: UgcGame[] }>("/api/operator/games/pending-media", {
      headers: authHeaders(token),
    });
  },

  /** 운영자: 미디어 승인 → staging → live */
  operatorApproveMedia(token: string, slug: string) {
    return request<{ ok: true; game: UgcGame }>(
      `/api/operator/games/${encodeURIComponent(slug)}/approve-media`,
      { method: "POST", headers: authHeaders(token) },
    );
  },

  /** 운영자: 미디어 거절 → staging 폐기 + 사유 저장 */
  operatorRejectMedia(token: string, slug: string, reason: string) {
    return request<{ ok: true; game: UgcGame }>(
      `/api/operator/games/${encodeURIComponent(slug)}/reject-media`,
      {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    );
  },

  /** 카테고리 목록 (공개) */
  getCategories() {
    return request<{ categories: GameCategory[] }>("/api/categories");
  },

  /** 장르 목록 (공개) */
  getGenres() {
    return request<{ genres: GameGenre[] }>("/api/genres");
  },

  /** 운영자: 장르 추가 */
  operatorCreateGenre(token: string, data: { slug: string; labelKo: string; labelEn: string; emoji?: string; sortOrder?: number }) {
    return request<{ ok: true; genre: GameGenre }>("/api/operator/genres", {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 장르 수정 */
  operatorUpdateGenre(token: string, slug: string, data: { labelKo?: string; labelEn?: string; emoji?: string; sortOrder?: number }) {
    return request<{ ok: true; genre: GameGenre }>(`/api/operator/genres/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 장르 삭제 */
  operatorDeleteGenre(token: string, slug: string) {
    return request<{ ok: true }>(`/api/operator/genres/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 운영자: 카테고리 추가 */
  operatorCreateCategory(token: string, data: { slug: string; labelKo: string; labelEn: string; emoji?: string; sortOrder?: number }) {
    return request<{ ok: true; category: GameCategory }>("/api/operator/categories", {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 카테고리 수정 */
  operatorUpdateCategory(token: string, slug: string, data: { labelKo?: string; labelEn?: string; emoji?: string; sortOrder?: number }) {
    return request<{ ok: true; category: GameCategory }>(`/api/operator/categories/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 카테고리 삭제 */
  operatorDeleteCategory(token: string, slug: string) {
    return request<{ ok: true }>(`/api/operator/categories/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /* ── Asset Kinds ──────────────────────────── */
  /** 공개: 활성 에셋 타입 목록 */
  listAssetKinds() {
    return request<{ kinds: AssetKind[] }>("/api/asset-kinds");
  },

  /** 운영자: 비활성 포함 전체 */
  operatorListAssetKinds(token: string) {
    return request<{ kinds: AssetKind[] }>("/api/asset-kinds/all", {
      headers: authHeaders(token),
    });
  },

  /** 운영자: 에셋 타입 추가 */
  operatorCreateAssetKind(token: string, data: {
    id: string; label: string; icon?: string; extensions: string[];
    mimeTypes?: string[]; maxSizeMb?: number; sortOrder?: number; enabled?: boolean;
  }) {
    return request<{ kind: AssetKind }>("/api/asset-kinds", {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 에셋 타입 수정 */
  operatorUpdateAssetKind(token: string, id: string, data: Partial<{
    label: string; icon: string | null; extensions: string[];
    mimeTypes: string[]; maxSizeMb: number; sortOrder: number; enabled: boolean;
  }>) {
    return request<{ kind: AssetKind }>(`/api/asset-kinds/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 에셋 타입 삭제 (사용 중이면 409) */
  operatorDeleteAssetKind(token: string, id: string) {
    return request<{ ok: true }>(`/api/asset-kinds/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 마켓플레이스: 공개 에셋 검색 + 페이지네이션. token 전달 시 liked 필드 포함 */
  listMyAssets(token: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ assets: any[] }>("/api/assets/my", {
      headers: authHeaders(token),
    });
  },

  getCharacterAnimations() {
    return request<{
      slots: Partial<Record<CharacterAnimationSlot["slot"], CharacterAnimationSlot>>;
      order: CharacterAnimationSlot["slot"][];
    }>("/api/character-animations");
  },

  operatorGetCharacterAnimations(token: string) {
    return request<{
      slots: Partial<Record<CharacterAnimationSlot["slot"], CharacterAnimationSlot>>;
      order: CharacterAnimationSlot["slot"][];
    }>("/api/operator/character-animations", {
      headers: authHeaders(token),
    });
  },

  operatorUpdateCharacterAnimations(
    token: string,
    slots: Partial<Record<CharacterAnimationSlot["slot"], Partial<CharacterAnimationSlot>>>,
  ) {
    return request<{
      ok: true;
      saved: string[];
      slots: Partial<Record<CharacterAnimationSlot["slot"], CharacterAnimationSlot>>;
      order: CharacterAnimationSlot["slot"][];
    }>("/api/operator/character-animations", {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
  },

  listPublicAssets(
    params: { q?: string; kind?: string; tag?: string; sort?: 'recent' | 'name' | 'popular'; page?: number; pageSize?: number } = {},
    token?: string,
  ) {
    const sp = new URLSearchParams();
    if (params.q)        sp.set('q', params.q);
    if (params.kind)     sp.set('kind', params.kind);
    if (params.tag)      sp.set('tag', params.tag);
    if (params.sort)     sp.set('sort', params.sort);
    if (params.page)     sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    const qs = sp.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ assets: any[]; page: number; pageSize: number; total: number; hasMore: boolean }>(
      `/api/assets/public${qs ? `?${qs}` : ''}`,
      token ? { headers: authHeaders(token) } : undefined,
    );
  },

  /** 마켓플레이스: 공개 에셋을 내 라이브러리로 복사 */
  cloneAsset(token: string, id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ asset: any }>(`/api/assets/${encodeURIComponent(id)}/clone`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 좋아요 */
  likeAsset(token: string, id: string) {
    return request<{ liked: boolean; likeCount: number }>(`/api/assets/${encodeURIComponent(id)}/like`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 좋아요 취소 */
  unlikeAsset(token: string, id: string) {
    return request<{ liked: boolean; likeCount: number }>(`/api/assets/${encodeURIComponent(id)}/like`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 내가 좋아요한 에셋 id 목록 */
  listMyAssetLikes(token: string) {
    return request<{ ids: string[] }>("/api/assets/my-likes", {
      headers: authHeaders(token),
    });
  },

  /** 작가 공개 프로필 + 통계 (토큰 있으면 isFollowing/isMe 포함) */
  getUserProfile(username: string, token?: string) {
    return request<{ profile: {
      username: string;
      joinedAt: string;
      publicCount: number;
      likesTotal: number;
      importsTotal: number;
      followerCount: number;
      followingCount: number;
      isFollowing: boolean;
      isMe: boolean;
    } }>(
      `/api/users/${encodeURIComponent(username)}/profile`,
      token ? { headers: authHeaders(token) } : undefined,
    );
  },

  /** 작가 팔로우 */
  followUser(token: string, username: string) {
    return request<{ isFollowing: boolean; followerCount: number }>(
      `/api/users/${encodeURIComponent(username)}/follow`,
      { method: "POST", headers: authHeaders(token) },
    );
  },

  /** 작가 언팔로우 */
  unfollowUser(token: string, username: string) {
    return request<{ isFollowing: boolean; followerCount: number }>(
      `/api/users/${encodeURIComponent(username)}/follow`,
      { method: "DELETE", headers: authHeaders(token) },
    );
  },

  /** 알림 목록 */
  listNotifications(token: string, params: { page?: number } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    const qs = sp.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ notifications: Array<{ id: string; type: string; payload: any; readAt: string | null; createdAt: string }>; page: number; pageSize: number; total: number; unread: number; hasMore: boolean }>(
      `/api/notifications${qs ? `?${qs}` : ''}`,
      { headers: authHeaders(token) },
    );
  },

  /** 안읽음 카운트 (벨 배지 폴링용) */
  notificationsUnreadCount(token: string) {
    return request<{ unread: number }>("/api/notifications/unread-count", { headers: authHeaders(token) });
  },

  /** 단일 읽음 */
  markNotificationRead(token: string, id: string) {
    return request<{ ok: true }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH", headers: authHeaders(token),
    });
  },

  /** 전체 읽음 */
  markAllNotificationsRead(token: string) {
    return request<{ ok: true; marked: number }>("/api/notifications/read-all", {
      method: "POST", headers: authHeaders(token),
    });
  },

  /** 내 팩 목록 */
  listMyPacks(token: string) {
    return request<{ packs: Array<FolderPack & { assetCount: number }> }>(
      "/api/packs/my", { headers: authHeaders(token) },
    );
  },

  /** 공개 팩 (마켓) */
  listPublicPacks(params: { q?: string; sort?: 'recent' | 'popular'; page?: number; pageSize?: number } = {}) {
    const sp = new URLSearchParams();
    if (params.q)        sp.set('q', params.q);
    if (params.sort)     sp.set('sort', params.sort);
    if (params.page)     sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    const qs = sp.toString();
    return request<{
      packs: Array<FolderPack & {
        creator: { username: string | null } | null;
        assetCount: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cover: any;
      }>;
      page: number; pageSize: number; total: number; hasMore: boolean;
    }>(`/api/packs/public${qs ? `?${qs}` : ''}`);
  },

  /** 팩 상세 + 안의 에셋 */
  getPack(id: string, token?: string) {
    return request<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pack: FolderPack & { creator: { username: string | null } | null; cover: any };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assets: any[];
    }>(`/api/packs/${encodeURIComponent(id)}`, token ? { headers: authHeaders(token) } : undefined);
  },

  /** 팩 upsert (creatorId+path) */
  upsertPack(token: string, body: { path: string; isPublic: boolean; description?: string; coverAssetId?: string | null }) {
    return request<{ pack: FolderPack }>(`/api/packs`, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  /** 팩 메타 삭제 (에셋은 그대로) */
  deletePack(token: string, id: string) {
    return request<{ ok: true }>(`/api/packs/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: authHeaders(token),
    });
  },

  /** 팩 전체 가져오기 — 모든 에셋 clone + 폴더 구조 유지 */
  importPack(token: string, id: string) {
    return request<{ ok: true; imported: number; skipped: number }>(`/api/packs/${encodeURIComponent(id)}/import`, {
      method: "POST", headers: authHeaders(token),
    });
  },

  /** 내가 팔로우한 작가들의 최근 공개 에셋 */
  listFollowingFeed(token: string, params: { page?: number } = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    const qs = sp.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ assets: any[]; page: number; pageSize: number; total: number; hasMore: boolean }>(
      `/api/users/me/following-feed${qs ? `?${qs}` : ''}`,
      { headers: authHeaders(token) },
    );
  },

  /** 에셋 신고 */
  reportAsset(token: string, id: string, body: { reason: 'inappropriate' | 'copyright' | 'spam' | 'malware' | 'other'; comment?: string }) {
    return request<{ ok: true; reportCount: number; autoHidden: boolean }>(`/api/assets/${encodeURIComponent(id)}/report`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  /** 운영자: 신고 큐 */
  operatorListAssetReports(token: string, params: { status?: 'pending' | 'dismissed' | 'resolved' | 'all'; page?: number } = {}) {
    const sp = new URLSearchParams();
    if (params.status) sp.set('status', params.status);
    if (params.page)   sp.set('page', String(params.page));
    const qs = sp.toString();
    return request<{
      reports: Array<{
        id: string; assetId: string; reporterId: string; reason: string; comment: string | null;
        status: string; resolution: string | null; createdAt: string;
        asset: {
          id: string; name: string; kind: string | null; modelUrl: string; thumbnailUrl: string | null;
          isPublic: boolean; reportCount: number; creatorId: string;
          creator: { username: string | null } | null;
        };
      }>;
      page: number; pageSize: number; total: number; hasMore: boolean;
    }>(`/api/operator/asset-reports${qs ? `?${qs}` : ''}`, { headers: authHeaders(token) });
  },

  /** 운영자: 신고 처리 */
  operatorResolveAssetReport(token: string, id: string, resolution: 'dismiss' | 'hide' | 'delete') {
    return request<{ ok: true }>(`/api/operator/asset-reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
  },

  /** 작가의 공개 에셋 목록 */
  listUserAssets(
    username: string,
    params: { q?: string; kind?: string; sort?: 'recent' | 'name' | 'popular'; page?: number; pageSize?: number } = {},
    token?: string,
  ) {
    const sp = new URLSearchParams();
    if (params.q)        sp.set('q', params.q);
    if (params.kind)     sp.set('kind', params.kind);
    if (params.sort)     sp.set('sort', params.sort);
    if (params.page)     sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    const qs = sp.toString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ assets: any[]; page: number; pageSize: number; total: number; hasMore: boolean }>(
      `/api/users/${encodeURIComponent(username)}/assets${qs ? `?${qs}` : ''}`,
      token ? { headers: authHeaders(token) } : undefined,
    );
  },

  /** 에셋 버전 목록 (소유자) */
  listAssetVersions(token: string, id: string) {
    return request<{
      currentVersion: number;
      versions: Array<{ id: string; assetId: string; version: number; modelUrl: string; thumbnailUrl: string | null; fileSize: string | null; note: string | null; createdAt: string }>;
    }>(`/api/assets/${encodeURIComponent(id)}/versions`, { headers: authHeaders(token) });
  },

  /** 새 버전 업로드 (XHR로 진행률) */
  uploadAssetVersion(token: string, id: string, file: File, note: string | undefined, onProgress?: (pct: number) => void) {
    return new Promise<{ asset: unknown; version: number }>((resolve, reject) => {
      const form = new FormData();
      form.append('model', file);
      if (note) form.append('note', note);
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = e => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error('잘못된 응답')); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error?.message || '업로드 실패')); }
          catch { reject(new Error('업로드 실패')); }
        }
      };
      xhr.onerror = () => reject(new Error('네트워크 오류'));
      const base = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';
      xhr.open('POST', `${base}/api/assets/${encodeURIComponent(id)}/versions`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(form);
    });
  },

  /** 특정 버전을 현재로 복원 */
  revertAssetVersion(token: string, id: string, version: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return request<{ asset: any }>(`/api/assets/${encodeURIComponent(id)}/versions/${version}/revert`, {
      method: "POST", headers: authHeaders(token),
    });
  },

  /** 버전 삭제 (현재 버전은 불가) */
  deleteAssetVersion(token: string, id: string, version: number) {
    return request<{ ok: true }>(`/api/assets/${encodeURIComponent(id)}/versions/${version}`, {
      method: "DELETE", headers: authHeaders(token),
    });
  },

  /** 에셋 일괄 작업 — delete/move/addTags/removeTags/setPublic */
  batchUpdateAssets(token: string, body: {
    ids: string[];
    action: 'delete' | 'move' | 'addTags' | 'removeTags' | 'setPublic';
    value?: unknown;
  }) {
    return request<{ ok: true; updated?: number; deleted?: number; skipped: number; folder?: string | null; isPublic?: boolean }>(
      "/api/assets/batch",
      {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  },

  /** 유저: 메타데이터 수정 신청 (검수 대기) */
  submitPendingMeta(token: string, slug: string, data: { title?: string; description?: string; emoji?: string; category?: string; genre?: string; tags?: string[]; titlesI18n?: Record<string,string>; descriptionsI18n?: Record<string,string> }) {
    return request<{ ok: true; game: UgcGame }>(`/api/games/${encodeURIComponent(slug)}/pending-meta`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 유저: 메타 수정 신청 취소 */
  cancelPendingMeta(token: string, slug: string) {
    return request<{ ok: true }>(`/api/games/${encodeURIComponent(slug)}/pending-meta`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 운영자: 메타 검수 대기 목록 */
  operatorListPendingMeta(token: string) {
    return request<{ games: UgcGame[] }>("/api/operator/games/pending-meta", {
      headers: authHeaders(token),
    });
  },

  /** 운영자: 메타 수정 승인 */
  operatorApproveMeta(token: string, slug: string) {
    return request<{ ok: true; game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/approve-meta`, {
      method: "POST",
      headers: authHeaders(token),
    });
  },

  /** 운영자: 메타 수정 거부 */
  operatorRejectMeta(token: string, slug: string, reason: string) {
    return request<{ ok: true; game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/reject-meta`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  },

  /** 운영자: community ↔ official 전환 */
  operatorSetKind(token: string, slug: string, kind: "official" | "community") {
    return request<{ ok: true; game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/set-kind`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
  },

  /** 운영자: 메타 직접 수정 (검수 없이 즉시 반영) */
  operatorEditMeta(token: string, slug: string, data: { title?: string; description?: string; emoji?: string; category?: string; tags?: string[]; titlesI18n?: Record<string,string>; descriptionsI18n?: Record<string,string> }) {
    return request<{ ok: true; game: UgcGame }>(`/api/operator/games/${encodeURIComponent(slug)}/meta`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  /** 운영자: 모든 게임 목록 (상태·종류 무관, 관리용) */
  operatorListAllGames(token: string) {
    return request<{ games: UgcGame[] }>("/api/operator/games/all", {
      headers: authHeaders(token),
    });
  },

  /** 운영자/owner: 게임 삭제 (R2 파일 + DB row). */
  deleteGame(token: string, slug: string) {
    return request<{ ok: true }>(`/api/games/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  // ── 프리팹 (스튜디오 오브젝트 스냅샷) ──
  /** 본인 프리팹 목록 (최신순). */
  listMyPrefabs(token: string) {
    return request<{ prefabs: Prefab[] }>("/api/prefabs/my", {
      headers: authHeaders(token),
    });
  },
  /** 새 프리팹 저장. */
  createPrefab(token: string, body: { name: string; payload: unknown; thumbnailUrl?: string | null }) {
    return request<{ prefab: Prefab }>("/api/prefabs", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  /** 이름/payload/thumbnail 수정. */
  updatePrefab(token: string, id: string, body: { name?: string; payload?: unknown; thumbnailUrl?: string | null }) {
    return request<{ prefab: Prefab }>(`/api/prefabs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  /** 프리팹 삭제. */
  deletePrefab(token: string, id: string) {
    return request<{ ok: true }>(`/api/prefabs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  // ── 유저 스크립트 컴포넌트 ──
  listMyScriptComponents(token: string) {
    return request<{ components: ScriptComponent[] }>("/api/script-components/my", {
      headers: authHeaders(token),
    });
  },
  /** 공식 컴포넌트 목록 (운영자가 만든 것, 모든 유저 접근) — 비로그인도 OK */
  listOfficialScriptComponents(token?: string) {
    return request<{ components: ScriptComponent[] }>("/api/script-components/official", {
      headers: token ? authHeaders(token) : {},
    });
  },
  /** 특정 id 들 한번에 가져오기 (월드 런타임 — 부착된 컴포넌트 fetch).
   *  서버가 본인 것 + 공식 컴포넌트만 반환. */
  getScriptComponentsByIds(token: string | undefined, ids: string[]) {
    if (ids.length === 0) return Promise.resolve({ components: [] });
    const qs = `ids=${encodeURIComponent(ids.join(','))}`;
    return request<{ components: ScriptComponent[] }>(`/api/script-components/by-ids?${qs}`, {
      headers: token ? authHeaders(token) : {},
    });
  },
  createScriptComponent(token: string, body: { name: string; icon?: string | null; description?: string | null; code: string; propsSchema?: ScriptComponentPropDef[] }) {
    return request<{ component: ScriptComponent }>("/api/script-components", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  updateScriptComponent(token: string, id: string, body: Partial<{ name: string; icon: string | null; description: string | null; code: string; propsSchema: ScriptComponentPropDef[] }>) {
    return request<{ component: ScriptComponent }>(`/api/script-components/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  deleteScriptComponent(token: string, id: string) {
    return request<{ ok: true }>(`/api/script-components/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  // ── 운영자 전용 스크립트 컴포넌트 (공식 관리) ──
  operatorListScriptComponents(token: string) {
    return request<{ components: ScriptComponent[] }>("/api/operator/script-components", {
      headers: authHeaders(token),
    });
  },
  operatorCreateScriptComponent(token: string, body: { name: string; icon?: string | null; description?: string | null; code: string; isOfficial?: boolean; propsSchema?: ScriptComponentPropDef[] }) {
    return request<{ component: ScriptComponent }>("/api/operator/script-components", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  operatorUpdateScriptComponent(token: string, id: string, body: Partial<{ name: string; icon: string | null; description: string | null; code: string; isOfficial: boolean; propsSchema: ScriptComponentPropDef[] }>) {
    return request<{ component: ScriptComponent }>(`/api/operator/script-components/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    });
  },
  operatorDeleteScriptComponent(token: string, id: string) {
    return request<{ ok: true }>(`/api/operator/script-components/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  },

  /** 프리팹 썸네일 이미지 업로드 (R2). url 반환 — 이후 updatePrefab 으로 연결.
   *  FormData 사용을 위해 request 헬퍼 대신 raw fetch (request 가 Content-Type:json 강제). */
  async uploadPrefabThumbnail(token: string, file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    const base = process.env.NEXT_PUBLIC_API_URL || 'https://airliveplay.com';
    const res = await fetch(`${base}/api/prefabs/thumbnail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },  // Content-Type 은 browser 가 자동 설정
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      let msg = '업로드 실패';
      try { msg = JSON.parse(txt).error?.message || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
};

/** props 스키마 항목 — 운영자/유저가 컴포넌트 만들 때 각 prop 의 UI 정의 */
export interface ScriptComponentPropDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'enum';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

/** 유저 정의 스크립트 컴포넌트 */
export interface ScriptComponent {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  code: string;
  /** props 스키마 — 비어있으면 Studio 가 free-form 입력 UI 사용 */
  propsSchema?: ScriptComponentPropDef[];
  isOfficial?: boolean;
  createdAt: string;
  updatedAt: string;
  // operator 목록 응답에서만 — creator 정보
  creator?: { username: string | null } | null;
}

/** 프리팹 — 스튜디오 오브젝트 스냅샷 */
export interface Prefab {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  // payload 는 { version, root } 형태 — 자세한 타입은 컴포넌트 측에서 정의
  payload: unknown;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  /** 토큰이 이미 만료됐는지 확인 */
  isExpired(): boolean {
    if (typeof window === "undefined") return false;
    const raw = localStorage.getItem(EXPIRES_AT_KEY);
    if (!raw) return false;
    return Date.now() / 1000 > Number(raw);
  },
  /** 만료까지 남은 초 (없으면 null) */
  expiresInSeconds(): number | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(EXPIRES_AT_KEY);
    if (!raw) return null;
    return Math.floor(Number(raw) - Date.now() / 1000);
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
