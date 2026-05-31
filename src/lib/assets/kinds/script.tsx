'use client';
/**
 * 'script' kind 핸들러 — 사용자 ScriptComponent 를 Asset 으로 통합.
 *
 * modelUrl 없음. asset.metadata 에 코드/메타 저장:
 *   { code: string, propsSchema?: Array<{key,label,type,default,min?,max?,step?,options?}>,
 *     icon?: string, isOfficial?: boolean }
 *
 * Thumbnail — 첫 줄 코드 미리보기 (코드 아이콘 박스)
 * Preview — 모달에 코드 textarea (편집은 Phase 2에서 활성화)
 */
import { registerKind } from '../registry';
import type { Asset } from '../types';
import AssetPreviewModal from '@/components/assets/AssetPreviewModal';

interface ScriptMeta {
  code?: string;
  propsSchema?: Array<{ key: string; label: string; type: string; default?: unknown }>;
  icon?: string;
}

function ScriptThumbnail({ asset }: { asset: Asset }) {
  const meta = (asset.metadata ?? {}) as ScriptMeta;
  const code = meta.code || '';
  const icon = meta.icon || '📜';
  // 첫 줄 또는 첫 함수 시그니처 미리보기
  const preview = code.split('\n').slice(0, 4).join('\n').slice(0, 120);
  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: 8, fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 9, lineHeight: 1.35, color: 'rgba(165,180,252,0.75)',
        whiteSpace: 'pre-wrap', overflow: 'hidden',
      }}>
        {preview || '// (빈 스크립트)'}
      </div>
      <div style={{
        position: 'absolute', bottom: 4, right: 8,
        fontSize: 26,
      }}>{icon}</div>
    </div>
  );
}

function ScriptPreview({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const meta = (asset.metadata ?? {}) as ScriptMeta;
  const code = meta.code || '';
  return (
    <AssetPreviewModal asset={asset} onClose={onClose}>
      <div style={{
        background: '#0a0f1c', borderRadius: 12, padding: 16,
        width: 'min(800px, 92vw)', maxHeight: '70vh', overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{meta.icon || '📜'}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{asset.name}</span>
        </div>
        {meta.propsSchema && meta.propsSchema.length > 0 && (
          <div style={{ marginBottom: 10, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            인스펙터 변수: {meta.propsSchema.map(p => p.key).join(', ')}
          </div>
        )}
        <pre style={{
          margin: 0, padding: 12,
          background: 'rgba(0,0,0,0.4)', borderRadius: 8,
          color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 12, lineHeight: 1.5,
          overflow: 'auto', maxHeight: '50vh',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {code || '// (빈 스크립트)'}
        </pre>
        <div style={{ marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
          ※ 편집은 Phase 2 — 인스펙터 통합 후 가능. 현재는 보기 전용.
        </div>
      </div>
    </AssetPreviewModal>
  );
}

registerKind({
  id: 'script',
  Thumbnail: ScriptThumbnail,
  Preview: ScriptPreview,
});
