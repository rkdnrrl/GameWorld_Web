'use client';

import * as THREE from 'three';
import { retargetClipsToModel } from './mixamoRig';

export type PlatformAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'prone';

export type CharacterAnimationSlot = {
  slot: PlatformAnimState;
  name?: string | null;
  assetId?: string | null;
  modelUrl: string;
  enabled?: boolean;
};

const SLOT_ORDER: PlatformAnimState[] = ['idle', 'walk', 'run', 'jump', 'crouch', 'prone'];

let slotConfigPromise: Promise<Partial<Record<PlatformAnimState, CharacterAnimationSlot>>> | null = null;
const fbxClipCache = new Map<string, Promise<THREE.AnimationClip[]>>();

export function platformClipName(slot: PlatformAnimState) {
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
      const slots = (data?.slots || {}) as Partial<Record<PlatformAnimState, CharacterAnimationSlot>>;
      const enabled: Partial<Record<PlatformAnimState, CharacterAnimationSlot>> = {};
      for (const slot of SLOT_ORDER) {
        const value = slots[slot];
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
  const clipsByState = new Map<PlatformAnimState, THREE.AnimationClip>();

  await Promise.all(SLOT_ORDER.map(async (slot) => {
    const config = slots[slot];
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
