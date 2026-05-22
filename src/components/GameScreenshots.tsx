"use client";

import { useState } from "react";

export default function GameScreenshots({ screenshots }: { screenshots: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  if (screenshots.length === 0) return null;

  return (
    <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">🖼 스크린샷</h2>

      {/* 썸네일 그리드 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {screenshots.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(url)}
            className="aspect-video overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200 transition hover:ring-blue-400 hover:shadow-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`스크린샷 ${i + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* 라이트박스 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected}
            alt="스크린샷"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/40"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
