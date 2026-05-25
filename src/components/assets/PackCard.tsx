'use client';
/**
 * 마켓플레이스용 팩 카드 — 폴더 묶음
 */
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { FolderPack } from '@/lib/api';

interface PackWithMeta extends FolderPack {
  creator: { username: string | null } | null;
  assetCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cover: any;
}

interface Props {
  pack: PackWithMeta;
  importing?: boolean;
  imported?: boolean;
  onImport: (p: PackWithMeta) => void;
}

export default function PackCard({ pack, importing, imported, onImport }: Props) {
  const t = useTranslations('Assets');
  const [hovered, setHovered] = useState(false);
  const coverSrc = pack.cover?.thumbnailUrl || (pack.cover?.kind === 'image' ? pack.cover?.modelUrl : null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden', transition: 'border-color .15s',
      }}>
      <Link href={`/packs/${pack.id}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <div style={{
          width: '100%', aspectRatio: '1', position: 'relative',
          background: 'linear-gradient(135deg,#1e293b,#312e81)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 64 }}>📦</span>
          )}
          {/* 팩 배지 */}
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(99,102,241,0.85)', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4,
            backdropFilter: 'blur(4px)',
          }}>
            📦 {t('packBadge', { count: pack.assetCount })}
          </span>
        </div>
      </Link>

      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
          {pack.path}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pack.creator?.username ? (
              <Link href={`/users/${encodeURIComponent(pack.creator.username)}`}
                onClick={e => e.stopPropagation()}
                style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none' }}>
                {t('byAuthor', { name: pack.creator.username })}
              </Link>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t('byAuthor', { name: t('anonymousAuthor') })}</span>
            )}
          </div>
          {pack.importCount > 0 && (
            <span style={{ fontSize: 10, opacity: 0.5 }} title={t('importCountTooltip')}>
              ↓ {pack.importCount}
            </span>
          )}
        </div>

        {pack.description && (
          <div style={{
            fontSize: 11, opacity: 0.55, marginBottom: 8,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: 'italic',
          }}>
            “{pack.description}”
          </div>
        )}

        <button
          onClick={() => onImport(pack)}
          disabled={importing || imported}
          style={{
            width: '100%', fontSize: 11, fontWeight: 700,
            cursor: imported || importing ? 'default' : 'pointer',
            padding: '6px 8px', borderRadius: 5, border: 'none',
            background: imported ? 'rgba(16,185,129,0.2)' : '#6366f1',
            color: imported ? '#6ee7b7' : '#fff',
            opacity: importing ? 0.6 : 1,
          }}>
          {imported ? '✓ ' + t('packImported') : importing ? t('packImporting') : '↓ ' + t('packImport')}
        </button>
      </div>
    </div>
  );
}
