'use client';
import { useEffect, useState } from 'react';

export interface GraphicsSettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  dpr: number;            // 픽셀 비율 1.0 / 1.5 / 2.0
  shadowSize: number;     // 그림자 맵 (0 = 끔)
  antialias: boolean;
  farClip: number;        // 시야 거리 (m)
}

export const PRESETS: Record<Exclude<GraphicsSettings['preset'], 'custom'>, GraphicsSettings> = {
  low:    { preset: 'low',    dpr: 1.0, shadowSize: 0,    antialias: false, farClip: 200 },
  medium: { preset: 'medium', dpr: 1.0, shadowSize: 1024, antialias: true,  farClip: 400 },
  high:   { preset: 'high',   dpr: 1.5, shadowSize: 2048, antialias: true,  farClip: 600 },
  ultra:  { preset: 'ultra',  dpr: 2.0, shadowSize: 4096, antialias: true,  farClip: 800 },
};

export const DEFAULT_SETTINGS: GraphicsSettings = PRESETS.ultra;

const STORAGE_KEY = 'alp-graphics-settings';

function loadSettings(): GraphicsSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: GraphicsSettings) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function useGraphicsSettings() {
  const [settings, setSettings] = useState<GraphicsSettings>(DEFAULT_SETTINGS);

  // 초기 로드 (클라이언트에서만)
  useEffect(() => { setSettings(loadSettings()); }, []);

  const updateSettings = (partial: Partial<GraphicsSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial, preset: 'custom' as const };
      saveSettings(next);
      return next;
    });
  };

  const applyPreset = (name: Exclude<GraphicsSettings['preset'], 'custom'>) => {
    const next = PRESETS[name];
    setSettings(next);
    saveSettings(next);
  };

  return { settings, updateSettings, applyPreset };
}
