'use client';
import { useEffect, useState } from 'react';

export type ShadowFilter = 'basic' | 'pcf' | 'pcfsoft';

export interface GraphicsSettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  dpr: number;
  shadowSize: number;
  antialias: boolean;
  farClip: number;
  remoteShadows: boolean;
  shadowFilter: ShadowFilter;  // hard / pcf / pcfsoft
  shadowRadius: number;        // 0~10 (0=선명, 10=매우 부드러움)
}

export const PRESETS: Record<Exclude<GraphicsSettings['preset'], 'custom'>, GraphicsSettings> = {
  low:    { preset: 'low',    dpr: 1.0, shadowSize: 0,    antialias: false, farClip: 200, remoteShadows: false, shadowFilter: 'basic',   shadowRadius: 0 },
  medium: { preset: 'medium', dpr: 1.0, shadowSize: 1024, antialias: true,  farClip: 400, remoteShadows: false, shadowFilter: 'pcf',     shadowRadius: 1 },
  high:   { preset: 'high',   dpr: 1.5, shadowSize: 2048, antialias: true,  farClip: 600, remoteShadows: true,  shadowFilter: 'pcfsoft', shadowRadius: 1 },
  ultra:  { preset: 'ultra',  dpr: 2.0, shadowSize: 4096, antialias: true,  farClip: 800, remoteShadows: true,  shadowFilter: 'pcfsoft', shadowRadius: 2 },
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
  // useState 초기화 함수로 한 번에 로드 → Canvas 두 번 마운트 방지
  const [settings, setSettings] = useState<GraphicsSettings>(() => loadSettings());

  // SSR 환경에서 마운트 후 클라이언트 값으로 보정
  useEffect(() => {
    const fromStorage = loadSettings();
    setSettings(prev => {
      // 이미 같으면 setState 안 함 (재렌더 방지)
      if (JSON.stringify(prev) === JSON.stringify(fromStorage)) return prev;
      return fromStorage;
    });
  }, []);

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
