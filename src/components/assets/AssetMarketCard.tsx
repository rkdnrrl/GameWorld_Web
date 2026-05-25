'use client';
/**
 * 마켓플레이스용 카드 — 남의 공개 에셋
 * 액션: 미리보기·다운로드·내 라이브러리로 복사
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';

interface MarketAsset extends Asset {
  creator?: { username: string | null };
}

interface Props {
  asset: MarketAsset;
  kinds: AssetKind[];
  importing?: boolean;
  imported?: boolean;
  onPreview: (a: Asset) => void;
  onImport: (a: Asset) => void;
}

export default function AssetMarketCard({
  asset, kinds, importing, imported, onPreview, onImport,
}: Props) {
  const t = useTranslations('Assets');
  const [hovered, setHovered] = useState(false);
  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;
  const canPreview = !!handler?.Preview;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 14,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
        overflow: 'hidden',
        transition: 'border-color .15s',
      }}>
      {/* 썸네일 */}
      <div
        onClick={() => { if (canPreview) onPreview(asset); }}
        style={{
          width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: canPreview ? 'pointer' : 'default',
          overflow: 'hidden',
        }}>
        {Thumb
          ? <Thumb asset={asset} />
          : <span style={{ fontSize: 44, opacity: 0.4 }}>{kindDef?.icon || '📄'}</span>}

        {kindDef && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            backdropFilter: 'blur(4px)',
          }}>
            {kindDef.icon} {kindDef.label}
          </span>
        )}
      </div>

      {/* 정보 */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {asset.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('byAuthor', { name: asset.creator?.username || t('anonymousAuthor') })}
        </div>

        {/* 태그 (읽기 전용, 최대 3개) */}
        {(asset.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
            {(asset.tags || []).slice(0, 3).map(tag => (
              <span key={tag} style={{
                padding: '1px 6px', fontSize: 10,
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
                borderRadius: 4,
              }}>
                #{tag}
              </span>
            ))}
            {(asset.tags || []).length > 3 && (
              <span style={{ fontSize: 10, opacity: 0.5, padding: '1px 4px' }}>
                +{(asset.tags || []).length - 3}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => onImport(asset)}
            disabled={importing || imported}
            style={{
              flex: 1, fontSize: 11, fontWeight: 700, cursor: imported || importing ? 'default' : 'pointer',
              padding: '5px 8px', borderRadius: 5, border: 'none',
              background: imported ? 'rgba(16,185,129,0.2)' : '#6366f1',
              color: imported ? '#6ee7b7' : '#fff',
              opacity: importing ? 0.6 : 1,
            }}>
            {imported ? '✓ ' + t('marketImported') : importing ? t('marketImporting') : '↓ ' + t('marketImport')}
          </button>
          <a
            href={asset.modelUrl}
            download
            style={{
              fontSize: 11, color: '#818cf8', textDecoration: 'none',
              padding: '5px 10px', background: 'rgba(99,102,241,0.15)', borderRadius: 5,
            }}>
            {t('download')}
          </a>
        </div>
      </div>
    </div>
  );
}
