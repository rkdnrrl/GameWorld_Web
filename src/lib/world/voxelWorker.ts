/**
 * voxelWorker — 웹워커 엔트리. 메인스레드 블로킹 없이 마칭큐브 메싱.
 * voxelChunker(순수)를 호출하고 결과 버퍼를 transferable 로 돌려보냄.
 */

import { initChunks, deformChunks, disposeChunks, type MeshChunk } from './voxelChunker';
import type { VoxelVolumeData, VoxelDeform } from './voxelVolume';

type InMsg =
  | { type: 'init'; id: string; gen: number; data: VoxelVolumeData }
  | { type: 'deform'; id: string; gen: number; def: VoxelDeform }
  | { type: 'dispose'; id: string };

// DOM Window 타이핑 회피 — 워커 글로벌로 캐스팅
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

function reply(id: string, gen: number, chunks: MeshChunk[]) {
  const transfer: Transferable[] = [];
  for (const c of chunks) transfer.push(c.positions.buffer, c.normals.buffer, c.colors.buffer);
  ctx.postMessage({ type: 'chunks', id, gen, chunks }, transfer);
}

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const m = e.data;
  if (m.type === 'init') reply(m.id, m.gen, initChunks(m.id, m.data));
  else if (m.type === 'deform') reply(m.id, m.gen, deformChunks(m.id, m.def));
  else if (m.type === 'dispose') disposeChunks(m.id);
};
