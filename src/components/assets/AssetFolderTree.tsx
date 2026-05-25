'use client';
/**
 * 폴더 트리 — 사이드바 내부 컴포넌트
 * 접기/펴기, 클릭 필터, 활성 표시
 */
import { useState } from 'react';
import type { FolderNode } from '@/lib/assets/folders';

interface Props {
  nodes: FolderNode[];
  selectedFolder: string | null;
  rootCount: number;        // 폴더 없는 (루트) 에셋 수
  onSelect: (path: string | null) => void;
}

export default function AssetFolderTree({ nodes, selectedFolder, rootCount, onSelect }: Props) {
  return (
    <div>
      {/* 루트 (분류 안됨) */}
      {rootCount > 0 && (
        <FolderRow
          name="(루트)"
          icon="📂"
          path=""
          depth={0}
          active={selectedFolder === ''}
          hasChildren={false}
          onClick={() => onSelect(selectedFolder === '' ? null : '')}
        />
      )}
      {nodes.map(n => (
        <FolderBranch key={n.path}
          node={n}
          depth={0}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FolderBranch({ node, depth, selectedFolder, onSelect }: {
  node: FolderNode;
  depth: number;
  selectedFolder: string | null;
  onSelect: (path: string | null) => void;
}) {
  // 깊이 2 까지 기본 펼침, 이후 닫힘
  const [open, setOpen] = useState(depth < 2);
  const active = selectedFolder === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <FolderRow
        name={node.name}
        icon={open && hasChildren ? '📂' : '📁'}
        path={node.path}
        depth={depth}
        active={active}
        hasChildren={hasChildren}
        open={open}
        onToggle={hasChildren ? () => setOpen(!open) : undefined}
        onClick={() => onSelect(active ? null : node.path)}
      />
      {open && node.children.map(c => (
        <FolderBranch key={c.path}
          node={c}
          depth={depth + 1}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function FolderRow({ name, icon, depth, active, hasChildren, open, onToggle, onClick }: {
  name: string;
  icon: string;
  path: string;
  depth: number;
  active: boolean;
  hasChildren: boolean;
  open?: boolean;
  onToggle?: () => void;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 1 }}>
      {/* 들여쓰기 + 토글 */}
      <div style={{ width: depth * 12 }} />
      <button
        onClick={onToggle ?? (() => {})}
        style={{
          width: 16, height: 22,
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.4)', cursor: hasChildren ? 'pointer' : 'default',
          fontSize: 9, padding: 0, flexShrink: 0,
        }}>
        {hasChildren ? (open ? '▾' : '▸') : ''}
      </button>
      <button
        onClick={onClick}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px',
          background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
          border: 'none', borderRadius: 6,
          color: active ? '#c7d2fe' : 'rgba(255,255,255,0.78)',
          fontSize: 12, cursor: 'pointer', textAlign: 'left',
          fontWeight: active ? 700 : 500,
          minWidth: 0,
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </button>
    </div>
  );
}
