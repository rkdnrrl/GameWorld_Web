/**
 * 맵 오브젝트 kind — 단일 진실의 원천 (single source of truth).
 *
 * 새 kind 추가 시 이 파일만 수정 → 모든 곳에서 인식됨.
 * 단, 실제 렌더링/물리 동작은 각 렌더러 (StudioCanvas, WorldCanvas) 에서 분기 처리해야 함.
 *
 * 향후 DB-driven 으로 가려면 (운영자가 동적으로 kind 등록) :
 *   1. Supabase `object_kinds` 테이블 추가
 *   2. 빌드 시 또는 런타임에 fetch → 이 배열 갱신
 *   3. 렌더러는 kind 명을 받아 동적으로 컴포넌트 로드 (registry pattern)
 *  현재는 정적 배열이 가장 안전. union 타입 추출되어 TS 검증 통과.
 */
export const OBJECT_KINDS = [
  // 기본 도형
  'cube', 'sphere', 'cylinder', 'plane',
  // FBX/GLB
  'asset',
  // 조명
  'pointlight', 'spotlight', 'dirlight',
  // 게임플레이
  'spawn', 'empty', 'ui', 'terrain', 'sound',
  // 특수 시각 효과
  'water', 'portal', 'particle',
] as const;

export type ObjectKind = typeof OBJECT_KINDS[number];

/** 런타임 검증 — 임의 문자열이 유효한 kind 인지 */
export function isObjectKind(k: unknown): k is ObjectKind {
  return typeof k === 'string' && (OBJECT_KINDS as readonly string[]).includes(k);
}
