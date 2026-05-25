/**
 * 가상 폴더 유틸 — 슬래시로 구분된 경로 문자열을 트리로 변환
 *
 * 규칙:
 *   - 빈 문자열 / null / undefined → "루트" (분류 안됨)
 *   - 경로는 항상 "/" 로 시작 (예: "/캐릭터/주인공")
 *   - 끝 슬래시는 제거 ("/캐릭터/" → "/캐릭터")
 *   - 중복 슬래시 정규화 ("//a//b" → "/a/b")
 *   - 각 세그먼트 50자 제한, 깊이 8단계 제한 (UI 폭주 방지)
 */

import type { Asset } from './types';

const MAX_SEGMENT_LEN = 50;
const MAX_DEPTH       = 8;

/** 입력값을 표준 폴더 경로로 정규화 (실패 시 null = 루트) */
export function normalizeFolder(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // 슬래시 정규화 + 앞에 '/' 강제
  let path = '/' + s.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (path === '/') return null;
  const segs = path.slice(1).split('/').map(seg => seg.trim().slice(0, MAX_SEGMENT_LEN)).filter(Boolean);
  if (segs.length === 0) return null;
  if (segs.length > MAX_DEPTH) segs.length = MAX_DEPTH;
  return '/' + segs.join('/');
}

/** 모든 에셋의 고유 폴더 목록 (정렬됨) — 루트는 제외 */
export function listFolders(assets: Asset[]): string[] {
  const set = new Set<string>();
  for (const a of assets) {
    const f = normalizeFolder(a.folder);
    if (f) set.add(f);
  }
  return Array.from(set).sort();
}

/** 폴더별 직접 자식 카운트 — 사이드바 표시용 */
export function countByFolder(assets: Asset[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    const f = normalizeFolder(a.folder);
    const key = f ?? '__root__';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/** 폴더 트리 노드 */
export interface FolderNode {
  /** 표시명 (마지막 세그먼트) */
  name: string;
  /** 절대 경로 (예: "/캐릭터/주인공") — 필터에 사용 */
  path: string;
  /** 하위 폴더 */
  children: FolderNode[];
}

/** 플랫 폴더 목록을 트리로 변환 */
export function buildFolderTree(folders: string[]): FolderNode[] {
  const root: FolderNode = { name: '', path: '', children: [] };

  // 모든 부모 경로도 자동으로 만들어줘야 함
  // 예: ['/a/b/c'] 만 있어도 /a, /a/b 노드 생성
  for (const path of folders) {
    const segs = path.slice(1).split('/');
    let cursor = root;
    let accum = '';
    for (const seg of segs) {
      accum += '/' + seg;
      let child = cursor.children.find(c => c.name === seg);
      if (!child) {
        child = { name: seg, path: accum, children: [] };
        cursor.children.push(child);
      }
      cursor = child;
    }
  }

  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: FolderNode[]) {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const n of nodes) sortTree(n.children);
}

/** 부모 폴더 — "/a/b/c" → "/a/b" — 최상위면 null */
export function parentOf(path: string): string | null {
  const i = path.lastIndexOf('/');
  if (i <= 0) return null;
  return path.slice(0, i);
}
