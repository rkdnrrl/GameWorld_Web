/**
 * 비공개 테스트 게이트 — 테스터(알파 승인) 또는 운영자만 게임플레이(미니게임·3D 월드 입장) 가능.
 * 정식 등급분류 전까지 일반 사용자의 플레이를 차단하기 위함.
 */
import { api, session, type User } from "@/lib/api";

/** 현재 사용자가 게임플레이 가능한지 — 테스터(alphaApproved) 또는 운영자 */
export function canPlay(user: User | null | undefined): boolean {
  if (!user) return false;
  return !!(user.alphaApproved || user.isOperator || user.operatorAccess);
}

/**
 * 서버에서 최신 프로필을 받아 세션을 갱신한 뒤 재판정.
 * 코드 redeem 직후 localStorage 세션이 stale 해서 테스터가 막히는 것을 방지.
 */
export async function refreshCanPlay(): Promise<boolean> {
  const token = session.getToken();
  if (!token) return false;
  try {
    const { user } = await api.me(token);
    session.updateStoredUser(user);
    return canPlay(user);
  } catch {
    return canPlay(session.getUser());
  }
}
