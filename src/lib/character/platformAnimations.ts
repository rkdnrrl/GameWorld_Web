'use client';

import * as THREE from 'three';
import { retargetClipsToModel } from './mixamoRig';

// 슬롯은 문자열 — 하드코딩된 6개 외에 운영자가 추가한 슬롯도 지원
export type PlatformAnimState = string;

export type CharacterAnimationSlot = {
  slot: string;
  name?: string | null;
  assetId?: string | null;
  modelUrl: string;
  enabled?: boolean;
};

let slotConfigPromise: Promise<Record<string, CharacterAnimationSlot>> | null = null;
const fbxClipCache = new Map<string, Promise<THREE.AnimationClip[]>>();

export function platformClipName(slot: string) {
  return `ALP_${slot}`;
}

export function clearPlatformAnimationCache() {
  slotConfigPromise = null;
  fbxClipCache.clear();
}

export async function loadPlatformAnimationSlots() {
  if (slotConfigPromise) return slotConfigPromise;
  slotConfigPromise = fetch('/api/character-animations', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return {};
      const data = await res.json();
      const slots = (data?.slots || {}) as Record<string, CharacterAnimationSlot>;
      // 서버가 반환한 모든 슬롯을 동적으로 로드 (SLOT_ORDER 하드코딩 제거)
      const enabled: Record<string, CharacterAnimationSlot> = {};
      for (const [slot, value] of Object.entries(slots)) {
        if (value?.modelUrl && value.enabled !== false) enabled[slot] = value;
      }
      return enabled;
    })
    .catch(() => ({}));
  return slotConfigPromise;
}

async function loadClipsFromFbx(url: string) {
  if (fbxClipCache.has(url)) return fbxClipCache.get(url)!;
  const promise = import('three/examples/jsm/loaders/FBXLoader.js').then(({ FBXLoader }) => new Promise<THREE.AnimationClip[]>((resolve, reject) => {
    new FBXLoader().load(url, (fbx) => {
      resolve(((fbx as unknown as { animations?: THREE.AnimationClip[] }).animations || []).map((clip) => clip.clone()));
    }, undefined, reject);
  }));
  fbxClipCache.set(url, promise);
  return promise;
}

export async function loadPlatformAnimationStateClips(targetRoot: THREE.Object3D) {
  const slots = await loadPlatformAnimationSlots();
  const clipsByState = new Map<string, THREE.AnimationClip>();

  await Promise.all(Object.entries(slots).map(async ([slot, config]) => {
    if (!config?.modelUrl) return;
    try {
      const rawClips = await loadClipsFromFbx(config.modelUrl);
      if (!rawClips.length) return;
      const retargeted = retargetClipsToModel(rawClips, targetRoot);
      const clip = retargeted[0].clone();
      clip.name = platformClipName(slot);
      clipsByState.set(slot, clip);
    } catch (err) {
      console.warn('[platform-animation] failed to load', slot, config.modelUrl, err);
    }
  }));

  return clipsByState;
}
