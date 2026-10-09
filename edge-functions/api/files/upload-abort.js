import { ID_RE, MAX_CHUNKS, chunkKey, getBlobStore, mapLimit } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/files/upload-abort  { id, chunks }
// 上传失败 / 取消时，清理已经写入的分片（尽力而为）
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const chunks = Number(body.chunks);
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, '上传 id 不合法');
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > MAX_CHUNKS) throw new HttpError(400, '分片数不合法');

  const store = getBlobStore();
  const indexes = Array.from({ length: chunks }, (_, i) => i);
  await mapLimit(indexes, 6, (i) => store.delete(chunkKey(username, body.id, i)).catch(() => {}));
  return json({ ok: true });
});
