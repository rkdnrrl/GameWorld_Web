'use client';
/**
 * 실시간 알림 구독 훅 — alp-games-router 의 NotifyHub DO 에 WS 연결.
 *  - 로그인 시 wss://play.airliveplay.com/_alp/notify?token=... 로 연결 (수신 전용)
 *  - 알림 수신 → onNotification 콜백 + window 이벤트(NOTIFICATION_PUSH_EVENT) 디스패치
 *  - 30초마다 ping (idle keepalive), 끊기면 지수 백오프 재연결
 *  - 세션 변경(로그인/로그아웃) 시 재연결, 비로그인 시 noop
 *
 * 토큰은 wss(TLS) 쿼리로 전달 — 브라우저 WebSocket 이 헤더를 못 붙이는 표준 제약.
 * 연결은 암호화되며 ALP 토큰은 단기 만료라 노출 창이 제한적.
 */
import { useEffect, useRef } from 'react';
import { session, SESSION_CHANGE_EVENT } from '@/lib/api';

const WS_BASE = process.env.NEXT_PUBLIC_NOTIFY_WS || 'wss://play.airliveplay.com';

export const NOTIFICATION_PUSH_EVENT = 'alp-notification-push';
export const DM_PUSH_EVENT = 'alp-dm-push';
// 대화를 읽음 처리한 직후 — DM 배지 즉시 갱신용 (SocialPanel 이 수신)
export const DM_READ_EVENT = 'alp-dm-read';

export interface PushNotification {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export interface DmPush {
  conversationId: string;
  messageId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string | null;
  preview: string;
  createdAt: string;
}

// 현재 열려있는 DM 대화 id — 그 대화창에 있는 동안엔 DM 토스트를 띄우지 않기 위함.
// DmChatModal / messages 페이지가 mount 시 설정, unmount 시 null.
let _activeDmConv: string | null = null;
export function setActiveDmConversation(id: string | null) { _activeDmConv = id; }
export function getActiveDmConversation() { return _activeDmConv; }

export function useNotificationStream(onNotification?: (n: PushNotification) => void) {
  const cbRef = useRef(onNotification);
  cbRef.current = onNotification;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    function cleanupSocket() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        try { ws.close(); } catch { /* noop */ }
        ws = null;
      }
    }

    function connect() {
      if (disposed) return;
      const token = session.getToken();
      if (!token) return; // 비로그인 — 토큰 생기면 SESSION_CHANGE 로 재시도
      try {
        ws = new WebSocket(`${WS_BASE}/_alp/notify?token=${encodeURIComponent(token)}`);
      } catch { scheduleReconnect(); return; }

      ws.onopen = () => {
        attempts = 0;
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === 1) { try { ws.send('ping'); } catch { /* noop */ } }
        }, 30_000);
      };
      ws.onmessage = (evt) => {
        if (evt.data === 'pong') return;
        let msg: { type?: string; notification?: PushNotification; dm?: DmPush };
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (msg.type === 'notification' && msg.notification) {
          const n = msg.notification;
          cbRef.current?.(n);
          window.dispatchEvent(new CustomEvent(NOTIFICATION_PUSH_EVENT, { detail: n }));
        } else if (msg.type === 'dm' && msg.dm) {
          window.dispatchEvent(new CustomEvent(DM_PUSH_EVENT, { detail: msg.dm }));
        }
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
      ws.onclose = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (!disposed) scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer) return;
      if (!session.getToken()) return; // 로그아웃 상태면 재연결 안 함
      const delays = [2000, 4000, 8000, 15000, 30000];
      const d = delays[Math.min(attempts, delays.length - 1)];
      attempts++;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, d);
    }

    // 로그인/로그아웃 → 기존 소켓 정리 후 재연결(또는 비로그인이면 idle)
    function onSession() {
      attempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      cleanupSocket();
      connect();
    }

    connect();
    window.addEventListener(SESSION_CHANGE_EVENT, onSession);

    return () => {
      disposed = true;
      window.removeEventListener(SESSION_CHANGE_EVENT, onSession);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      cleanupSocket();
    };
  }, []);
}
