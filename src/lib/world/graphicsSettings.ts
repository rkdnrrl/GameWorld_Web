'use client';
import { useEffect, useState } from 'react';

export type ShadowFilter = 'basic' | 'pcf' | 'pcfsoft' | 'vsm';

export interface GraphicsSettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  dpr: number;
  shadowSize: number;
  antialias: boolean;
  farClip: number;
  remoteShadows: boolean;
  shadowFilter: ShadowFilter;  // hard / pcf / pcfsoft
  shadowRadius: number;        // 0~10 (0=선명, 10=매우 부드러움)
  /** 카메라로부터 이 거리(m) 이상이면 mesh/skinned mesh 를 visible=false 처리(distance culling).
   *  0 = 비활성. farClip 보다 작아야 효과 있음 (farClip 으로도 안 그려지므로). */
  cullDistance: number;
  /** three 내장 frustumCulled — 카메라 시야 밖 mesh 안 그림(그림자는 유지). 거의 공짜·안전. */
  frustumCull: boolean;
  /** 벽 등 큰 불투명 메시 뒤에 가려진 mesh 안 그림 (레이캐스트, 실험적·CPU 비용 있음). */
  occlusionCull: boolean;
  /** 성능 통계 HUD (드로우콜·삼각형·컬링 수) 표시 — 디버그용. */
  showStats: boolean;
  /** 최대 렌더 FPS 상한. 0 = 무제한(디스플레이 주사율 그대로). 고주사율(120/144Hz) 기기에서
   *  GPU/배터리 절감용. XR(VR) 세션 중에는 무시(헤드셋이 자체 주사율로 구동). */
  maxFps: number;
  /** 절차적 효과음(발소리·물 첨벙·바람) 마스터 볼륨 0~1. 0 = 끔. (BGM/앰비언트와 별개) */
  sfxVolume: number;
}

export const PRESETS: Record<Exclude<GraphicsSettings['preset'], 'custom'>, GraphicsSettings> = {
  low:    { preset: 'low',    dpr: 1.0, shadowSize: 0,    antialias: false, farClip: 200, remoteShadows: false, shadowFilter: 'basic',   shadowRadius: 0, cullDistance: 120, frustumCull: true, occlusionCull: false, showStats: false, maxFps: 0, sfxVolume: 0.5 },
  medium: { preset: 'medium', dpr: 1.0, shadowSize: 1024, antialias: true,  farClip: 400, remoteShadows: false, shadowFilter: 'pcf',     shadowRadius: 1, cullDistance: 250, frustumCull: true, occlusionCull: false, showStats: false, maxFps: 0, sfxVolume: 0.5 },
  high:   { preset: 'high',   dpr: 1.5, shadowSize: 2048, antialias: true,  farClip: 600, remoteShadows: true,  shadowFilter: 'pcfsoft', shadowRadius: 1, cullDistance: 500, frustumCull: true, occlusionCull: false, showStats: false, maxFps: 0, sfxVolume: 0.5 },
  // cullDistance 0(컬링 끔)이 아니라 farClip(800) 바로 아래 700 으로 둔다 — 거리 컬링을 완전히 끄면
  // 콘텐츠 많은 월드에서 화면 밖·먼 메시까지 전부 드로우+그림자 캐스트 → 프레임 드랍 주원인.
  // 700 이면 farClip 안쪽이라 팝핑 거의 없이 원거리 드로우/그림자 제거.
  ultra:  { preset: 'ultra',  dpr: 2.0, shadowSize: 4096, antialias: true,  farClip: 800, remoteShadows: true,  shadowFilter: 'pcfsoft', shadowRadius: 2, cullDistance: 700, frustumCull: true, occlusionCull: false, showStats: false, maxFps: 0, sfxVolume: 0.5 },
};

// 기본 프리셋은 high — ultra(4096 그림자·800m 드로우)는 약·중급 GPU 에서 무거워 첫 진입부터 프레임 드랍.
// high 도 2048 pcfsoft 그림자+원격 그림자라 품질 충분. 강한 GPU 는 설정에서 ultra 선택 가능.
export const DEFAULT_SETTINGS: GraphicsSettings = PRESETS.high;

const STORAGE_KEY = 'alp-graphics-settings';

function loadSettings(): GraphicsSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    // 명명된 프리셋(low/medium/high/ultra)은 항상 최신 PRESETS 정의를 따른다 —
    // 프리셋 값이 코드에서 갱신되면(예: ultra 거리컬링 추가) 저장된 유저에게도 즉시 반영.
    // 'custom' 만 저장된 정확한 값을 유지(유저가 직접 조절한 설정 보존).
    if (parsed.preset && parsed.preset !== 'custom' && PRESETS[parsed.preset]) {
      return PRESETS[parsed.preset];
    }
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
