import { CHUNK_SIZE } from '../../../lib/config.js';
import { chunkKey, getBlobStore, mapLimit } from '../../../lib/files.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';
import { getUploadSession } from '../../../lib/upload-session.js';

function lengthOf(meta) {
  const header = Object.entries(meta?.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-length');
  const size = Number(header?.[1]);
  return header && Number.isFinite(size) ? size : null;
}

// GET /api/files/upload-status?id=<taskId>
// 只统计 Blob 已写入且大小匹配的分片；浏览器关闭后不会继续传，但重新选文件可跳过这些分片。
export const onRequestGet = route(async ({ request }, username) => {
  const id = new URL(request.url).searchParams.get('id');
  const session = await getUploadSession(username, id);
  if (session.state === 'done') {
    return json({ id, state: 'done', key: session.key, size: session.size, uploaded: [] });
  }
  const indexes = Array.from({ length: session.chunks }, (_, i) => i);
  const store = getBlobStore();
  const metadata = await mapLimit(indexes, 6, (index) =>
    store.getMetadata(chunkKey(username, id, index), { consistency: 'strong' }),
  );
  const uploaded = indexes.filter((index) => {
    const meta = metadata[index];
    const expected = Math.min(CHUNK_SIZE, session.size - index * CHUNK_SIZE);
    const actual = lengthOf(meta);
    return meta && (actual === null || actual === expected);
  });
  return json({ id, state: 'uploading', size: session.size, chunkSize: CHUNK_SIZE, chunks: session.chunks, uploaded });
});
