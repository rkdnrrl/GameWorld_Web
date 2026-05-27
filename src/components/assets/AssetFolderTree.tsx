'use client';
/**
 * 폴더 트리 — 사이드바 내부 컴포넌트
 * 접기/펴기, 클릭 필터, 활성 표시, 드래그-드롭으로 에셋 이동
 */
import { useState } from 'react';
import type { FolderNode } from '@/lib/assets/folders';

interface Props {
  nodes: FolderNode[];
  selectedFolder: string | null;
  rootCount: number;
  onSelect: (path: string | null) => void;
  onDrop: (folder: string | null, files?: File[]) => void;
  dragActive: boolean;
  onDeleteFolder?: (path: string) => void;
}

export default function AssetFolderTree({ nodes, selectedFolder, rootCount, onSelect, onDrop, dragActive, onDeleteFolder }: Props) {
  return (
    <div>
      {(rootCount > 0 || dragActive) && (
        <FolderRow
          name="(루트)"
          icon="📂"
          path=""
          depth={0}
          active={selectedFolder === ''}
          hasChildren={false}
          dragActive={dragActive}
          onClick={() => onSelect(selectedFolder === '' ? null : '')}
          onDrop={(files) => onDrop(null, files)}
        />
      )}
      {nodes.map(n => (
        <FolderBranch key={n.path}
          node={n}
          depth={0}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
          onDrop={onDrop}
          dragActive={dragActive}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}

function FolderBranch({ node, depth, selectedFolder, onSelect, onDrop, dragActive, onDeleteFolder }: {
  node: FolderNode;
  depth: number;
  selectedFolder: string | null;
  onSelect: (path: string | null) => void;
  onDrop: (folder: string | null, files?: File[]) => void;
  dragActive: boolean;
  onDeleteFolder?: (path: string) => void;
}) {
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
        dragActive={dragActive}
        onToggle={hasChildren ? () => setOpen(!open) : undefined}
        onClick={() => onSelect(active ? null : node.path)}
        onDrop={(files) => onDrop(node.path, files)}
        onDelete={onDeleteFolder ? () => onDeleteFolder(node.path) : undefined}
      />
      {open && node.children.map(c => (
        <FolderBranch key={c.path}
          node={c}
          depth={depth + 1}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
          onDrop={onDrop}
          dragActive={dragActive}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </>
  );
}

function FolderRow({ name, icon, path, depth, active, hasChildren, open, dragActive, onToggle, onClick, onDrop, onDelete }: {
  name: string;
  icon: string;
  path: string;
  depth: number;
  active: boolean;
  hasChildren: boolean;
  open?: boolean;
  dragActive: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onDrop: (files?: File[]) => void;
  onDelete?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', marginBottom: 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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
        onDragOver={e => {
          const hasFiles = Array.from(e.dataTransfer.types || []).includes('Files');
          if (!dragActive && !hasFiles) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move';
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length > 0) onDrop(files);
          else onDrop();
        }}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px',
          background:
            dragOver  ? 'rgba(99,102,241,0.45)'
          : active    ? 'rgba(99,102,241,0.18)'
          : dragActive ? 'rgba(255,255,255,0.04)'
          : 'transparent',
          border: dragOver ? '1px dashed rgba(165,180,252,0.7)' : '1px solid transparent',
          borderRadius: 6,
          color: active || dragOver ? '#c7d2fe' : 'rgba(255,255,255,0.78)',
          fontSize: 12, cursor: 'pointer', textAlign: 'left',
          fontWeight: active ? 700 : 500,
          minWidth: 0,
        }}
      >
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </button>
      {/* 삭제 버튼 — 루트(path="")는 제외, 호버 시 표시 */}
      {onDelete && path !== '' && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="폴더 삭제 (에셋은 상위 폴더로 이동)"
          style={{
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            background: 'none', border: 'none',
            color: 'rgba(239,68,68,0.7)', fontSize: 12,
            cursor: 'pointer', padding: '2px 5px', flexShrink: 0,
            lineHeight: 1,
          }}>
          🗑
        </button>
      )}
    </div>
  );
}
