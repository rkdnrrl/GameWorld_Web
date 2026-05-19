"use client";

/**
 * AssistantCharacter — Kamego 통합 가이드 기준 구현
 * - iframe은 화면 전체(inset:0)에 렌더링하고 SVG clipPath로 캐릭터 영역만 hit-test 활성화
 * - assistant:bounds 로 캐릭터/메뉴 영역 좌표 수신
 * - assistant:bubble:show/hide 로 말풍선을 부모에서 직접 렌더링 (externalBubbles=1 필수)
 * - assistant:navigate 로 외부 링크 새 탭
 * - 부모는 마우스 위치만 iframe으로 전달 (시선 추적)
 * - Live2D 로딩 3초 + bounds 도착 후 로딩 오버레이 종료
 */

import { useState, useEffect, useRef } from "react";

const IFRAME_SRC = "https://assistant-chi-two.vercel.app";

type Bound = { x: number; y: number; w: number; h: number; kind?: string };
type Bubble = { id: string; text: string; x: number; y: number; anchor?: "above" | "below" };

const BASE_CHAR_WIDTH = 200; // 기준 캐릭터 너비 — 이 크기일 때 말풍선이 디자인 원본 크기

type Props = {
  userId: string;
  app?: string;
};

export default function CharacterWidget({ userId, app = "platform" }: Props) {
  const [charBounds, setCharBounds]   = useState<Bound[]>([]);
  const [iframeReady, setIframeReady] = useState(false);
  const [bubbles, setBubbles]         = useState<Bubble[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── postMessage 수신 (iframe → 부모) ──
  useEffect(() => {
    let firstBoundsTime = 0;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d?.type) return;

      if (d.type === "assistant:bounds") {
        const arr: Bound[] = Array.isArray(d.bounds) ? d.bounds : [d.bounds];
        setCharBounds(arr);
        if (firstBoundsTime === 0) {
          firstBoundsTime = Date.now();
          // 첫 bounds 도착 후 Live2D 렌더링 3초 추가 대기
          readyTimer = setTimeout(() => setIframeReady(true), 3000);
        }
      }
      if (d.type === "assistant:navigate" && typeof d.url === "string") {
        window.open(d.url, "_blank");
      }
      if (d.type === "assistant:bubble:show") {
        setBubbles((prev) => [
          ...prev.filter((b) => b.id !== d.id),
          { id: d.id, text: d.text, x: d.x, y: d.y, anchor: d.anchor || "above" },
        ]);
      }
      if (d.type === "assistant:bubble:hide") {
        setBubbles((prev) => prev.filter((b) => b.id !== d.id));
      }
    }
    window.addEventListener("message", onMsg);

    // 15초 fallback — iframe이 망가져도 진입은 가능하도록
    const fallback = setTimeout(() => setIframeReady(true), 15000);

    return () => {
      window.removeEventListener("message", onMsg);
      clearTimeout(fallback);
      if (readyTimer) clearTimeout(readyTimer);
    };
  }, []);

  // ── 마우스 위치 → iframe (시선 추적) ──
  useEffect(() => {
    function onMove(e: MouseEvent) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "assistant:mousemove", x: e.clientX, y: e.clientY },
        "*"
      );
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const src = `${IFRAME_SRC}?userId=${encodeURIComponent(userId)}&app=${encodeURIComponent(app)}&size=large&externalBubbles=1`;

  return (
    <>
      {/* 로딩 오버레이 */}
      {!iframeReady && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "#0f0920",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: "4px solid #58CC02",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "assistant-spin 1s linear infinite",
            }}
          />
          <style>{`@keyframes assistant-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 외부 말풍선 — pointer-events:none이라 페이지 클릭 통과 */}
      {bubbles.map((b) => (
        <div
          key={b.id}
          style={{
            position: "fixed",
            left: b.x,
            top: b.y,
            transform: `translateX(-50%) ${b.anchor === "above" ? "translateY(-100%)" : ""}`,
            pointerEvents: "none",
            background: "rgba(20,15,40,0.95)",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 16,
            border: "1.5px solid rgba(168,85,247,0.4)",
            boxShadow: "0 4px 16px rgba(0,0,0,.5)",
            fontSize: 12,
            fontWeight: 600,
            maxWidth: 220,
            textAlign: "center",
            lineHeight: 1.4,
            zIndex: 10000,
          }}
        >
          {b.text}
        </div>
      ))}

      {/* SVG clipPath — bounds 영역만 iframe 노출 */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <clipPath id="assistantClip" clipPathUnits="userSpaceOnUse">
            {charBounds.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} />
            ))}
          </clipPath>
        </defs>
      </svg>

      {/* iframe — 전체화면, clipPath로 hit-test 영역 제한 */}
      <iframe
        ref={iframeRef}
        src={src}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          background: "transparent",
          clipPath: charBounds.length > 0 ? "url(#assistantClip)" : "inset(100%)",
          zIndex: 9999,
        }}
        allow="autoplay"
      />
    </>
  );
}
