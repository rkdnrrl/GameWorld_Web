/**
 * voxelMesher — 복셀 메싱 클라이언트. 웹워커 백엔드(가능 시) 또는 동기 폴백(워커 불가/SSR).
 * 컴포넌트는 이 단일 API만 사용 — 워커/동기 분기를 추상화. id별 콜백 + gen 으로 stale 응답 무시.
 */

import type { VoxelVolumeData, VoxelDeform } from './voxelVolume';
import type { MeshChunk } from './voxelChunker';

type Cb = (chunks: MeshChunk[]) => void;

const cbs = new Map<string, Cb>();
const gens = new Map<string, number>();

let worker: Worker | null = null;
let workerTried = false;

function getWorker(): Worker | null {
  if (workerTried) return worker;
  workerTried = true;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./voxelWorker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; id: string; gen: number; chunks: MeshChunk[] };
      if (m.type !== 'chunks') return;
      if ((gens.get(m.id) ?? 0) !== m.gen) return;   // stale (재init 이후 도착)
      cbs.get(m.id)?.(m.chunks);
    };
    worker.onerror = () => { worker = null; };        // 워커 실패 시 이후 동기 폴백
  } catch {
    worker = null;
  }
  return worker;
}

// 동기 폴백 — 워커 없을 때 메인스레드 voxelChunker 직접 호출 (마이크로태스크로 비차단처럼)
function syncInit(id: string, data: VoxelVolumeData, gen: number) {
  import('./voxelChunker').then(({ initChunks }) => {
    if ((gens.get(id) ?? 0) !== gen) return;
    cbs.get(id)?.(initChunks(id, data));
  });
}
function syncDeform(id: string, def: VoxelDeform, gen: number) {
  import('./voxelChunker').then(({ deformChunks }) => {
    if ((gens.get(id) ?? 0) !== gen) return;
    cbs.get(id)?.(deformChunks(id, def));
  });
}

export const voxelMesher = {
  /** id 지형 (재)생성 — 전체 청크를 cb 로 전달. */
  init(id: string, data: VoxelVolumeData, cb: Cb) {
    cbs.set(id, cb);
    const gen = (gens.get(id) ?? 0) + 1;
    gens.set(id, gen);
    const w = getWorker();
    if (w) w.postMessage({ type: 'init', id, gen, data });
    else syncInit(id, data, gen);
  },
  /** 변형 1개 — 닿은 청크만 cb 로 전달 (init 에서 등록한 cb). */
  deform(id: string, def: VoxelDeform) {
    const gen = gens.get(id) ?? 0;
    const w = getWorker();
    if (w) w.postMessage({ type: 'deform', id, gen, def });
    else syncDeform(id, def, gen);
  },
  /** id 해제 — in-flight 응답 무효화 + 워커 밀도장 해제. */
  dispose(id: string) {
    cbs.delete(id);
    gens.set(id, (gens.get(id) ?? 0) + 1);   // gen bump → 이후 도착 응답 무시
    const w = getWorker();
    if (w) w.postMessage({ type: 'dispose', id });
    else import('./voxelChunker').then(({ disposeChunks }) => disposeChunks(id));
  },
};
