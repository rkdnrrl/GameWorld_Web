/**
 * 에셋 타입 핸들러 레지스트리 (플러그인 패턴)
 *
 * 새 타입 추가법:
 *   1) src/lib/assets/kinds/{newkind}.ts 생성
 *   2) registerKind({...}) 호출
 *   3) src/lib/assets/kinds/index.ts 에 import 추가 (사이드이펙트)
 *   4) 운영자 페이지에서 asset_kinds DB row 생성 (Phase 2) 또는 시드 SQL
 *
 * 핸들러 미등록 kind 의 에셋도 동작은 함 — 다운로드/이름만 표시 (Fallback).
 */

import type { ComponentType } from 'react';
import type { Asset } from './types';

export interface AssetKindHandler {
  /** asset_kinds.id 와 매칭 — 'model','image','audio' */
  id: string;

  /** 그리드/리스트에 보일 작은 썸네일 */
  Thumbnail: ComponentType<{ asset: Asset; size?: number }>;

  /** 카드 클릭 시 뜨는 큰 미리보기 (선택 — 없으면 다운로드 only) */
  Preview?: ComponentType<{ asset: Asset; onClose: () => void }>;

  /** 편집기 (선택 — FBX 의 머티리얼 에디터 등) */
  Editor?: ComponentType<{ asset: Asset; allAssets: Asset[]; onClose: () => void; onSaved: (a: Asset) => void }>;

  /** 카드 표시용 부가 정보 (해상도, 길이 등) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe?: (asset: Asset) => string | null;
}

const REGISTRY = new Map<string, AssetKindHandler>();

export function registerKind(h: AssetKindHandler): void {
  REGISTRY.set(h.id, h);
}

export function getKind(id: string | null | undefined): AssetKindHandler | null {
  if (!id) return null;
  return REGISTRY.get(id) ?? null;
}

export function listRegisteredKinds(): AssetKindHandler[] {
  return Array.from(REGISTRY.values());
}
