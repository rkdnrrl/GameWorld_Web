"use client";

/**
 * CharacterWidget — AI 비서 캐릭터 iframe
 * iframe은 항상 220×390 으로 렌더링하고 CSS transform: scale()로 축소 (선명함 유지)
 * 드래그 바(—) + 리사이즈 핸들(┌) + localStorage 위치·크기 저장 + 터치 지원
 */

import { useState, useEffect, useRef } from "react";

const IFRAME_SRC = "https://assistant-chi-two.vercel.app";
const NATURAL_W  = 220;
const NATURAL_H  = 390;
const ASPECT     = NATURAL_H / NATURAL_W;
const DESKTOP_W  = 220;
const MOBILE_W   = 140;
const MIN_W      = 80;
const MAX_W      = 360;

const isMobile = () => window.innerWidth < 640;

function load<T>(k: string, f: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "null");
    if (v != null) return v as T;
  } catch {}
  return f;
}

type Pos  = { x: number; y: number };
type Size = { w: number; h: number };

type Props = {
  userId: string;
  app?: string;
  bottomOffset?: number;
  storageKey?: string;
};

export default function CharacterWidget({
  userId,
  app = "platform",
  bottomOffset = 0,
  storageKey = "charwidget",
}: Props) {
  const mob = typeof window !== "undefined" ? isMobile() : false;
  const defaultSize: Size = {
    w: mob ? MOBILE_W : DESKTOP_W,
    h: Math.round((mob ? MOBILE_W : DESKTOP_W) * ASPECT),
  };

  const [pos,        setPos]        = useState<Pos>(() => load(`${storageKey}_pos`,  { x: -1, y: -1 }));
  const [size,       setSize]       = useState<Size>(() => load(`${storageKey}_size`, defaultSize));
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const posRef     = useRef<Pos>(pos);
  const sizeRef    = useRef<Size>(size);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef  = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    posRef.current = pos;
    if (pos.x >= 0) localStorage.setItem(`${storageKey}_pos`, JSON.stringify(pos));
  }, [pos, storageKey]);

  useEffect(() => {
    sizeRef.current = size;
    localStorage.setItem(`${storageKey}_size`, JSON.stringify(size));
  }, [size, storageKey]);

  // 눈 추적: iframe 영역(툴바 아래) 기준 좌표로 변환
  useEffect(() => {
    const TOOLBAR_H = 32;
    function onMove(e: MouseEvent) {
      const p = posRef.current;
      const s = sizeRef.current;
      // wrapper의 left/top: 드래그 후엔 p, 아니면 우하단 고정
      const wrapperLeft = p.x >= 0 ? p.x : window.innerWidth  - s.w;
      const wrapperTop  = p.y >= 0 ? p.y : window.innerHeight - (s.h + TOOLBAR_H) - bottomOffset;
      // iframe은 wrapper 안에서 TOOLBAR_H만큼 아래
      const elX = wrapperLeft;
      const elY = wrapperTop + TOOLBAR_H;
      const scale = s.w / NATURAL_W;
      iframeRef.current?.contentWindow?.postMessage({
        type: "assistant:mousemove",
        x: (e.clientX - elX) / scale,
        y: (e.clientY - elY) / scale,
      }, "*");
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [bottomOffset]);

  function startDrag(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = wrapperRef.current;
    if (!el) return;

    // right/bottom으로 위치 잡혀있으면 left/top으로 전환
    if (posRef.current.x < 0) {
      const r = el.getBoundingClientRect();
      posRef.current = { x: r.left, y: r.top };
      el.style.right = "";
      el.style.bottom = "";
      el.style.left = r.left + "px";
      el.style.top  = r.top + "px";
    }

    const isTouch = "touches" in e;
    const sMx = isTouch ? e.touches[0].clientX : e.clientX;
    const sMy = isTouch ? e.touches[0].clientY : e.clientY;
    const sX  = posRef.current.x;
    const sY  = posRef.current.y;
    setIsDragging(true);

    function onMove(ev: MouseEvent | TouchEvent) {
      if (ev.cancelable) ev.preventDefault();
      const t = "touches" in ev ? ev.touches[0] : (ev as MouseEvent);
      const cx = t.clientX;
      const cy = t.clientY;
      const wrapperH = sizeRef.current.h + 32; // toolbar 포함
      const nx = Math.max(0, Math.min(window.innerWidth  - sizeRef.current.w, sX + cx - sMx));
      const ny = Math.max(0, Math.min(window.innerHeight - wrapperH, sY + cy - sMy));
      posRef.current = { x: nx, y: ny };
      el.style.left = nx + "px";
      el.style.top  = ny + "px";
    }
    function onUp() {
      setIsDragging(false);
      setPos({ ...posRef.current });
      document.removeEventListener("mousemove", onMove as EventListener);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove as EventListener);
      document.removeEventListener("touchend",  onUp);
    }
    document.addEventListener("mousemove", onMove as EventListener);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove as EventListener, { passive: false });
    document.addEventListener("touchend",  onUp);
  }

  function startResize(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    const isTouch = "touches" in e;
    const sMx = isTouch ? e.touches[0].clientX : e.clientX;
    const sMy = isTouch ? e.touches[0].clientY : e.clientY;
    const sW  = sizeRef.current.w;
    setIsResizing(true);

    function onMove(ev: MouseEvent | TouchEvent) {
      if (ev.cancelable) ev.preventDefault();
      const t = "touches" in ev ? ev.touches[0] : (ev as MouseEvent);
      const delta = ((sMx - t.clientX) + (sMy - t.clientY)) / 2;
      const nw = Math.max(MIN_W, Math.min(MAX_W, sW + delta));
      const next: Size = { w: Math.round(nw), h: Math.round(nw * ASPECT) };
      sizeRef.current = next;
      setSize(next);
    }
    function onUp() {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMove as EventListener);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove as EventListener);
      document.removeEventListener("touchend",  onUp);
    }
    document.addEventListener("mousemove", onMove as EventListener);
    document.addEventListener("mouseup",   onUp);
    document.addEventListener("touchmove", onMove as EventListener, { passive: false });
    document.addEventListener("touchend",  onUp);
  }

  const scale     = size.w / NATURAL_W;
  const blocked   = isResizing || isDragging;
  const TOOLBAR_H = 32;
  const wrapperH  = size.h + TOOLBAR_H;

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        ...(pos.x >= 0 ? { left: pos.x, top: pos.y } : { right: 0, bottom: bottomOffset }),
        width: size.w,
        height: wrapperH,
        zIndex: 9999,
        background: "transparent",
      }}
    >
      {/* 툴바 — 솔리드 배경, iframe 위쪽 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: TOOLBAR_H,
        display: "flex", alignItems: "center",
        background: "rgba(30,30,40,0.85)",
        borderRadius: "8px 8px 0 0",
        boxShadow: "0 -1px 0 rgba(255,255,255,0.15) inset",
        zIndex: 3,
      }}>
        {/* 리사이즈 핸들 (좌) */}
        <div
          onMouseDown={startResize}
          onTouchStart={startResize}
          style={{
            width: 32, height: TOOLBAR_H, cursor: "nwse-resize",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            width: 12, height: 12,
            borderTop:  "2.5px solid #fff",
            borderLeft: "2.5px solid #fff",
            borderRadius: "2px 0 0 0",
          }} />
        </div>
        {/* 드래그 바 (가운데 그래버) */}
        <div
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          style={{
            flex: 1, height: TOOLBAR_H, cursor: "grab",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.6)", marginLeft: 4 }} />
        </div>
      </div>

      {/* 차단 오버레이 (드래그/리사이즈 중) */}
      {blocked && <div style={{ position: "absolute", inset: 0, zIndex: 1 }} />}

      {/* iframe 영역 — 툴바 아래 */}
      <div style={{ position: "absolute", top: TOOLBAR_H, left: 0, right: 0, bottom: 0 }}>
        <iframe
          ref={iframeRef}
          src={`${IFRAME_SRC}?userId=${userId}&app=${app}`}
          style={{
            width: NATURAL_W,
            height: NATURAL_H,
            border: "none",
            background: "transparent",
            pointerEvents: blocked ? "none" : "auto",
            transform: `scale(${scale})`,
            transformOrigin: "bottom right",
            position: "absolute",
            bottom: 0,
            right: 0,
            willChange: "transform",
          }}
          allow="autoplay"
        />
      </div>
    </div>
  );
}
