'use client';
/**
 * 마켓플레이스용 카드 — 남의 공개 에셋 (모던·미니멀)
 *  썸네일 중심, 액션(가져오기·다운로드·신고)은 호버 시 하단 오버레이로 노출.
 *  정보는 이름 + @작가 + 다운로드수만 컴팩트하게.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';

interface MarketAsset extends Asset {
  creator?: { username: string | null };
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

interface Props {
  asset: MarketAsset;
  kinds: AssetKind[];
  importing?: boolean;
  imported?: boolean;
  liking?: boolean;
  reported?: boolean;
  onPreview: (a: Asset) => void;
  onImport: (a: Asset) => void;
  onToggleLike: (a: MarketAsset) => void;
  onReport: (a: Asset) => void;
}

export default function AssetMarketCard({
  asset, kinds, importing, imported, liking, reported,
  onPreview, onImport, onToggleLike, onReport,
}: Props) {
  const t = useTranslations('Assets');
  const [hovered, setHovered] = useState(false);
  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;
  const canPreview = !!handler?.Preview;

  const iconBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, fontSize: 13, borderRadius: 7,
    background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none',
    cursor: 'pointer', backdropFilter: 'blur(4px)', textDecoration: 'none', flexShrink: 0,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 12,
        border: `1px solid ${hovered ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.07)'}`,
        overflow: 'hidden',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'border-color .15s, transform .15s',
      }}>
      {/* 썸네일 (클릭=미리보기) */}
      <div
        onClick={() => { if (canPreview) onPreview(asset); }}
        style={{
          width: '100%', aspectRatio: '1', background: 'rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: canPreview ? 'zoom-in' : 'default', overflow: 'hidden',
        }}>
        {Thumb
          ? <Thumb asset={asset} />
          : <span style={{ fontSize: 40, opacity: 0.35 }}>{kindDef?.icon || '📄'}</span>}

        {/* kind 배지 — 좌상단 (아이콘만) */}
        {kindDef && (
          <span style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(0,0,0,0.5)', fontSize: 11, padding: '2px 6px',
            borderRadius: 6, backdropFilter: 'blur(4px)',
          }} title={kindDef.label}>
            {kindDef.icon}
          </span>
        )}

        {/* 좋아요 — 우상단 (항상 표시) */}
        <button
          onClick={e => { e.stopPropagation(); onToggleLike(asset); }}
          disabled={liking}
          aria-label={asset.liked ? t('unlike') : t('like')}
          style={{
            position: 'absolute', top: 6, right: 6,
            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px',
            background: asset.liked ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.5)',
            color: '#fff', fontSize: 11, fontWeight: 700,
            border: 'none', borderRadius: 10, cursor: liking ? 'default' : 'pointer',
            backdropFilter: 'blur(4px)', opacity: liking ? 0.6 : 1,
          }}>
          <span>{asset.liked ? '♥' : '♡'}</span>
          {(asset.likeCount ?? 0) > 0 && <span>{asset.likeCount}</span>}
        </button>

        {/* 호버 액션 — 하단 오버레이 */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: 7,
          display: 'flex', gap: 5, alignItems: 'center',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.78))',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'none' : 'translateY(6px)',
          transition: 'opacity .15s, transform .15s',
          pointerEvents: hovered ? 'auto' : 'none',
        }}>
          <button
            onClick={e => { e.stopPropagation(); if (!imported && !importing) onImport(asset); }}
            disabled={importing || imported}
            style={{
              flex: 1, fontSize: 11, fontWeight: 700, height: 28, borderRadius: 7, border: 'none',
              background: imported ? 'rgba(16,185,129,0.9)' : '#6366f1', color: '#fff',
              cursor: imported || importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1,
            }}>
            {imported ? '✓ ' + t('marketImported') : importing ? '…' : '↓ ' + t('marketImport')}
          </button>
          <a href={asset.modelUrl} download onClick={e => e.stopPropagation()} title={t('download')} style={iconBtn}>⬇</a>
          <button
            onClick={e => { e.stopPropagation(); if (!reported) onReport(asset); }}
            disabled={reported}
            title={reported ? t('reportAlready') : t('reportButton')}
            aria-label={t('reportButton')}
            style={{ ...iconBtn, color: reported ? '#fbbf24' : '#fff', cursor: reported ? 'default' : 'pointer' }}>
            {reported ? '⚠' : '⋯'}
          </button>
        </div>
      </div>

      {/* 정보 — 컴팩트 (이름 + @작가 + ↓다운로드수) */}
      <div style={{ padding: '7px 9px' }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.name}>
          {asset.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10.5 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.creator?.username ? (
              <Link
                href={`/users/${encodeURIComponent(asset.creator.username)}`}
                onClick={e => e.stopPropagation()}
                title={t('viewCreatorPage')}
                style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#a5b4fc'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              >
                @{asset.creator.username}
              </Link>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{t('anonymousAuthor')}</span>
            )}
          </span>
          {(asset.importCount ?? 0) > 0 && (
            <span style={{ opacity: 0.45 }} title={t('importCountTooltip')}>↓{asset.importCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}
