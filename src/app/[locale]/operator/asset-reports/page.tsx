"use client";

import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, session, ApiError } from "@/lib/api";

type Report = Awaited<ReturnType<typeof api.operatorListAssetReports>>['reports'][number];

const REASON_LABELS: Record<string, string> = {
  inappropriate: '부적절한 콘텐츠',
  copyright:     '저작권 침해',
  spam:          '스팸/낚시성',
  malware:       '악성코드 의심',
  other:         '기타',
};

const STATUS_LABELS: Record<string, string> = {
  pending:   '대기',
  dismissed: '기각',
  resolved:  '처리완료',
};

export default function OperatorAssetReportsPage() {
  const router = useRouter();

  const [reports, setReports] = useState<Report[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'dismissed' | 'resolved' | 'all'>('pending');

  function load() {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListAssetReports(tk, { status: statusFilter })
      .then(res => setReports(res.reports))
      .catch(e => {
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setErr(e instanceof ApiError ? e.message : "로드 실패");
      });
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  async function resolve(r: Report, resolution: 'dismiss' | 'hide' | 'delete') {
    const tk = session.getToken();
    if (!tk) return;
    if (resolution === 'delete' && !confirm('에셋을 영구 삭제합니다. 계속하시겠습니까?')) return;
    setActing(r.id);
    try {
      await api.operatorResolveAssetReport(tk, r.id, resolution);
      // 같은 에셋에 대한 다른 대기 신고도 같이 사라짐 → 새로 로드
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "처리 실패");
    } finally {
      setActing(null);
    }
  }

  if (forbidden) return <div className="p-8 text-red-500">접근 권한이 없습니다.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">⚠️ 에셋 신고 검토</h1>
        <p className="mt-1 text-sm text-zinc-500">
          공개 에셋에 대한 신고를 검토합니다. <strong>기각</strong>(문제 없음) · <strong>비공개 처리</strong>(보존) · <strong>영구 삭제</strong>(되돌릴 수 없음) 중 선택.
        </p>
        <p className="mt-1 text-xs text-amber-500">
          ※ 5개 이상 신고 누적 시 자동으로 비공개 처리됨 (`ASSET_AUTO_HIDE_THRESHOLD` 환경변수로 조정 가능)
        </p>
      </div>

      {err && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{err}</p>}

      {/* 상태 필터 */}
      <div className="flex gap-2">
        {(['pending', 'dismissed', 'resolved', 'all'] as const).map(s => (
          <button key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs ${statusFilter === s
              ? 'bg-blue-600 text-white font-semibold'
              : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
            }`}>
            {s === 'all' ? '전체' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <section>
        {reports === null ? (
          <p className="text-sm text-zinc-400">로딩 중…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-zinc-400">{statusFilter === 'pending' ? '대기 중인 신고가 없습니다. 👍' : '신고가 없습니다.'}</p>
        ) : (
          <ul className="space-y-3">
            {reports.map(r => (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div className="flex items-start gap-4">
                  {/* 썸네일 */}
                  <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                    {r.asset.thumbnailUrl
                      ? <img src={r.asset.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      : r.asset.kind === 'image'
                        ? <img src={r.asset.modelUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-3xl opacity-40">📦</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* 헤더 */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">{r.asset.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold">
                        {REASON_LABELS[r.reason] || r.reason}
                      </span>
                      {!r.asset.isPublic && (
                        <span className="text-xs px-2 py-0.5 rounded bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          비공개
                        </span>
                      )}
                      {r.asset.reportCount > 1 && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          누적 {r.asset.reportCount}건
                        </span>
                      )}
                    </div>

                    {/* 작가 + 시간 */}
                    <div className="text-xs text-zinc-500 mb-2">
                      작가: {r.asset.creator?.username
                        ? <Link href={`/users/${encodeURIComponent(r.asset.creator.username)}`} className="text-indigo-500 hover:underline">{r.asset.creator.username}</Link>
                        : <span className="italic">알 수 없음</span>
                      }
                      <span className="mx-2">·</span>
                      신고시각: {new Date(r.createdAt).toLocaleString()}
                    </div>

                    {/* 코멘트 */}
                    {r.comment && (
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/50 rounded p-2 mb-3 italic">
                        “{r.comment}”
                      </div>
                    )}

                    {/* 액션 */}
                    {r.status === 'pending' ? (
                      <div className="flex gap-2 flex-wrap">
                        <a href={r.asset.modelUrl} target="_blank" rel="noreferrer"
                          className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300">
                          파일 열기
                        </a>
                        <button onClick={() => resolve(r, 'dismiss')} disabled={acting === r.id}
                          className="rounded bg-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200">
                          기각
                        </button>
                        <button onClick={() => resolve(r, 'hide')} disabled={acting === r.id}
                          className="rounded bg-amber-500 px-2.5 py-1 text-xs text-white hover:bg-amber-600 disabled:opacity-50">
                          비공개 처리
                        </button>
                        <button onClick={() => resolve(r, 'delete')} disabled={acting === r.id}
                          className="rounded bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                          영구 삭제
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        {STATUS_LABELS[r.status]}
                        {r.resolution && <> · {r.resolution === 'dismiss' ? '기각' : r.resolution === 'hide' ? '비공개' : '삭제'}</>}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
