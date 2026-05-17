"use client";

import { useEffect } from "react";
import { session, SESSION_CHANGE_EVENT, api } from "@/lib/api";

function insertIframe(commonUserId: string) {
  if (document.getElementById("assistant-iframe")) return;
  const iframe = document.createElement("iframe");
  iframe.id = "assistant-iframe";
  iframe.src = `https://assistant-chi-two.vercel.app?userId=${commonUserId}&app=platform`;

  let iframeW = 220, iframeH = 390;
  let iframeX = -1, iframeY = -1; // -1 = 아직 left/top으로 전환 안 됨 (right/bottom 기준)
  iframe.style.cssText =
    `position:fixed;right:0;bottom:0;width:${iframeW}px;height:${iframeH}px;border:none;background:transparent;z-index:9999;`;
  document.body.appendChild(iframe);

  function switchToLeftTop() {
    if (iframeX >= 0) return;
    const rect = iframe.getBoundingClientRect();
    iframeX = rect.left;
    iframeY = rect.top;
    iframe.style.right  = "";
    iframe.style.bottom = "";
    iframe.style.left = iframeX + "px";
    iframe.style.top  = iframeY + "px";
  }

  let isDragging = false;
  let grabX = 0, grabY = 0, grabSet = false;

  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      // 드래그 중: 첫 이벤트에서 grab 오프셋 확정
      if (!grabSet) {
        grabX = e.clientX - iframeX;
        grabY = e.clientY - iframeY;
        grabSet = true;
      }
      iframeX = Math.max(0, Math.min(window.innerWidth  - iframeW, e.clientX - grabX));
      iframeY = Math.max(0, Math.min(window.innerHeight - iframeH, e.clientY - grabY));
      iframe.style.left = iframeX + "px";
      iframe.style.top  = iframeY + "px";
    }
    // 눈 추적: iframe 기준 좌표로 변환
    iframe.contentWindow?.postMessage({ type: "assistant:mousemove", x: e.clientX - iframeX, y: e.clientY - iframeY }, "*");
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      grabSet = false;
      iframe.style.pointerEvents = "auto";
    }
  });

  window.addEventListener("message", (e) => {
    if (e.data?.type === "assistant:navigate") {
      window.open(e.data.url, "_blank");
    }
    if (e.data?.type === "assistant:drag" && !isDragging) {
      // 드래그 시작: pointer-events:none으로 부모가 마우스 직접 수신
      switchToLeftTop();
      isDragging = true;
      grabSet = false;
      iframe.style.pointerEvents = "none";
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
