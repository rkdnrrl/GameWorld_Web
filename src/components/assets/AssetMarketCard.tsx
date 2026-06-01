'use client';
/**
 * 마켓플레이스 카드 — 유니티 에셋스토어 스타일.
 *  4:3 썸네일(클릭=미리보기) + kind 배지 + 좋아요, 하단 정보(제목·퍼블리셔·평점형 통계·FREE).
 *  가져오기/다운로드/신고 액션은 썸네일 호버 오버레이로 노출.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import { session, type User } from '@/lib/api';

interface MarketAsset extends Asset {
  creatorId?: string;
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
  /** 카드 클릭 시 상세 모달 열기 (있으면 onPreview 대신 우선) */
  onOpenDetail?: (a: MarketAsset) => void;
  onImport: (a: Asset) => void;
  onToggleLike: (a: MarketAsset) => void;
  onReport: (a: Asset) => void;
}

export default function AssetMarketCard({
  asset, kinds, importing, imported, liking, reported,
  onPreview, onOpenDetail, onImport, onToggleLike, onReport,
}: Props) {
  const t = useTranslations('Assets');
  const [hovered, setHovered] = useState(false);
  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;
  const canPreview = !!handler?.Preview;
  // 공식 캐릭터 자동 등록 에셋(tag: official-character) 은 운영자 닉네임 대신 'ALP' 브랜드로 표시
  const isOfficial = (asset.tags || []).includes('official-character');
  const username = isOfficial ? 'ALP' : (asset.creator?.username || null);

  // 다운로드는 자신의 에셋(creatorId 일치)이거나 운영자일 때만 노출
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => { setMe(session.getUser()); }, []);
  const canDownload = !!me && (!!me.isOperator || (!!asset.creatorId && asset.creatorId === me.id));

  const iconBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, fontSize: 14, borderRadius: 8,
    background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none',
    cursor: 'pointer', backdropFilter: 'blur(4px)', textDecoration: 'none', flexShrink: 0,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#161c2d', borderRadius: 12,
        border: `1px solid ${hovered ? 'rgba(129,140,248,0.55)' : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 12px 28px rgba(0,0,0,0.45)' : '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'border-color .15s, transform .15s, box-shadow .15s',
      }}>
      {/* 썸네일 (4:3, 클릭=상세 모달, 미디어는 모달에서 미리보기) */}
      <div
        onClick={() => { if (onOpenDetail) onOpenDetail(asset); else if (canPreview) onPreview(asset); }}
        style={{
          width: '100%', aspectRatio: '4 / 3', background: 'radial-gradient(circle at 50% 35%, #25304a, #0e1424)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: onOpenDetail ? 'pointer' : canPreview ? 'zoom-in' : 'default', overflow: 'hidden',
        }}>
        {Thumb
          ? <Thumb asset={asset} />
          : <span style={{ fontSize: 46, opacity: 0.35 }}>{kindDef?.icon || '📄'}</span>}

        {/* kind 배지 — 좌상단 */}
        {kindDef && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(0,0,0,0.55)', fontSize: 10.5, fontWeight: 600, color: '#fff',
            padding: '3px 8px', borderRadius: 6, backdropFilter: 'blur(4px)',
          }} title={kindDef.label}>
            <span>{kindDef.icon}</span><span>{kindDef.label}</span>
          </span>
        )}

        {/* 좋아요 — 우상단 (항상 표시) */}
        <button
          onClick={e => { e.stopPropagation(); onToggleLike(asset); }}
          disabled={liking}
          aria-label={asset.liked ? t('unlike') : t('like')}
          style={{
            position: 'absolute', top: 8, right: 8,
            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px',
            background: asset.liked ? 'rgba(239,68,68,0.92)' : 'rgba(0,0,0,0.55)',
            color: '#fff', fontSize: 11, fontWeight: 700,
            border: 'none', borderRadius: 11, cursor: liking ? 'default' : 'pointer',
            backdropFilter: 'blur(4px)', opacity: liking ? 0.6 : 1,
          }}>
          <span>{asset.liked ? '♥' : '♡'}</span>
          {(asset.likeCount ?? 0) > 0 && <span>{asset.likeCount}</span>}
        </button>

        {/* 호버 액션 — 하단 오버레이 */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8,
          display: 'flex', gap: 6, alignItems: 'center',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.82))',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'none' : 'translateY(8px)',
          transition: 'opacity .15s, transform .15s',
          pointerEvents: hovered ? 'auto' : 'none',
        }}>
          <button
            onClick={e => { e.stopPropagation(); if (!imported && !importing) onImport(asset); }}
            disabled={importing || imported}
            style={{
              flex: 1, fontSize: 12, fontWeight: 700, height: 30, borderRadius: 8, border: 'none',
              background: imported ? 'rgba(16,185,129,0.95)' : '#6366f1', color: '#fff',
              cursor: imported || importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1,
            }}>
            {imported ? '✓ ' + t('marketImported') : importing ? '…' : '↓ ' + t('marketImport')}
          </button>
          {canDownload && (
            <a href={asset.modelUrl} download onClick={e => e.stopPropagation()} title={t('download')} style={iconBtn}>⬇</a>
          )}
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

      {/* 정보 영역 */}
      <div style={{ padding: '9px 11px 11px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.name}>
          {asset.name}
        </div>

        {/* 퍼블리셔 — 아바타(첫 글자) + @username */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: '#fff', fontSize: 9, fontWeight: 800,
          }}>
            {(username || '?').charAt(0).toUpperCase()}
          </span>
          {isOfficial ? (
            <span style={{ fontSize: 11, color: '#fcd34d', fontWeight: 700, whiteSpace: 'nowrap' }} title="공식 ALP 에셋">
              ⭐ ALP
            </span>
          ) : username ? (
            <Link
              href={`/users/${encodeURIComponent(username)}`}
              onClick={e => e.stopPropagation()}
              title={t('viewCreatorPage')}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a5b4fc'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            >
              @{username}
            </Link>
          ) : (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t('anonymousAuthor')}</span>
          )}
        </div>

        {/* 평점형 통계 + FREE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', fontSize: 11 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#fca5a5' }} title={t('like')}>
            ♥ <span style={{ color: 'rgba(255,255,255,0.6)' }}>{asset.likeCount ?? 0}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.45)' }} title={t('importCountTooltip')}>
            ↓ {asset.importCount ?? 0}
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
            color: '#6ee7b7', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)',
            padding: '2px 7px', borderRadius: 5,
          }}>
            {t('marketFree')}
          </span>
        </div>
      </div>
    </div>
  );
}
