"use client";

import { useEffect } from "react";
import { session, SESSION_CHANGE_EVENT, api } from "@/lib/api";

function insertIframe(commonUserId: string) {
  if (document.getElementById("assistant-iframe")) return;
  const iframe = document.createElement("iframe");
  iframe.id = "assistant-iframe";
  iframe.src = `https://assistant-chi-two.vercel.app?userId=${commonUserId}&app=platform`;

  let iframeW = 220, iframeH = 300;
  let iframeX = window.innerWidth  - iframeW;
  let iframeY = window.innerHeight - iframeH;
  iframe.style.cssText =
    `position:fixed;left:${iframeX}px;top:${iframeY}px;width:${iframeW}px;height:${iframeH}px;border:none;background:transparent;z-index:9999;`;
  document.body.appendChild(iframe);

  // 부모 페이지에서 마우스 위치를 직접 추적 → 정확한 드래그
  let mouseX = 0, mouseY = 0;
  let isDragging = false;
  let dragStartMouseX = 0, dragStartMouseY = 0;
  let dragStartIframeX = 0, dragStartIframeY = 0;
  let dragEndTimer: ReturnType<typeof setTimeout> | null = null;

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!isDragging) return;
    iframeX = Math.max(0, Math.min(window.innerWidth  - iframeW, dragStartIframeX + (mouseX - dragStartMouseX)));
    iframeY = Math.max(0, Math.min(window.innerHeight - iframeH, dragStartIframeY + (mouseY - dragStartMouseY)));
    iframe.style.left = iframeX + "px";
    iframe.style.top  = iframeY + "px";
  });
  document.addEventListener("mouseup", () => { isDragging = false; });

  window.addEventListener("message", (e) => {
    if (e.data?.type === "assistant:drag") {
      if (!isDragging) {
        // 드래그 시작: 현재 마우스·iframe 위치를 기준점으로 기록
        isDragging = true;
        dragStartMouseX  = mouseX;
        dragStartMouseY  = mouseY;
        dragStartIframeX = iframeX;
        dragStartIframeY = iframeY;
      }
      // 드래그 종료 감지: 150ms 동안 메시지 없으면 종료
      if (dragEndTimer) clearTimeout(dragEndTimer);
      dragEndTimer = setTimeout(() => { isDragging = false; }, 150);
    }
    if (e.data?.type === "assistant:resize") {
      iframeW = e.data.width;
      iframeH = e.data.height;
      iframe.style.width  = iframeW + "px";
      iframe.style.height = iframeH + "px";
    }
  });
}

async function mount() {
  const token = session.getToken();
  if (!token) return;

  // 세션에 commonUserId가 이미 있으면 바로 삽입
  const cached = session.getUser();
  if (cached?.commonUserId) {
    insertIframe(cached.commonUserId);
    return;
  }

  // 없으면 /api/auth/me 호출해서 최신 commonUserId 획득
  try {
    const { user } = await api.me(token);
    const cuid = user.commonUserId || user.id;
    insertIframe(cuid);
  } catch {
    // 네트워크 오류 시 id 폴백
    if (cached?.id) insertIframe(cached.id);
  }
}

function unmount() {
  document.getElementById("assistant-iframe")?.remove();
}

export default function CharacterIframe() {
  useEffect(() => {
    mount();

    const onChange = () => {
      if (session.getToken()) {
        mount();
      } else {
        unmount();
      }
    };

    window.addEventListener(SESSION_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onChange);
  }, []);

  return null;
}
