'use client';
/**
 * 텍스트 내 URL 자동 링크화 — DM 메시지·댓글 등에 쓰는 단순 유틸.
 *  - http(s) URL 만 인식. 끝의 구두점(`.`, `,`, `)` 등) 제거.
 *  - 외부 새 창 (target=_blank + rel=noreferrer).
 *  - 입력은 짧은 메시지 가정. 매우 긴 텍스트는 별도 처리 필요.
 */
import type { ReactNode } from 'react';

const URL_RE = /\b(https?:\/\/[^\s<>"']+)/g;

function trimTrailingPunct(url: string): { url: string; trailing: string } {
  // URL 끝의 의미 없는 구두점 떼어내기 (예: "https://x.com." → URL "https://x.com" + "." 텍스트)
  const m = url.match(/^(.*?)([.,;:!?)\]\}'"]+)$/);
  if (!m) return { url, trailing: '' };
  // 괄호 균형 체크 — URL 안의 ( 가 짝 있으면 ) 안 떼어냄
  const stripped = m[1];
  const trailing = m[2];
  const opens = (stripped.match(/\(/g) || []).length;
  const closes = (stripped.match(/\)/g) || []).length;
  if (trailing === ')' && opens > closes) {
    return { url, trailing: '' };
  }
  return { url: stripped, trailing };
}

export function linkify(text: string): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  text.replace(URL_RE, (match, _g1, offset: number) => {
    if (offset > last) out.push(text.slice(last, offset));
    const { url, trailing } = trimTrailingPunct(match);
    out.push(
      <a
        key={`l${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#93c5fd', textDecoration: 'underline', wordBreak: 'break-all' }}
        onClick={(e) => e.stopPropagation()}
      >{url}</a>,
    );
    if (trailing) out.push(trailing);
    last = offset + match.length;
    return match;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}
