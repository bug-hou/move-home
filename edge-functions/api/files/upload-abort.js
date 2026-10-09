import { chunkKey, getBlobStore, mapLimit } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';
import { getUploadSession, removeUploadSession } from '../../../lib/upload-session.js';

// POST /api/files/upload-abort { id }：仅明确取消时清理分片，上传失败留待续传。
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const session = await getUploadSession(username, body.id, { allowExpired: true });
  if (session.state !== 'uploading') throw new HttpError(409, '已完成的文件不能取消');
  const indexes = Array.from({ length: session.chunks }, (_, i) => i);
  await mapLimit(indexes, 6, (i) => getBlobStore().delete(chunkKey(username, body.id, i)));
  await removeUploadSession(username, body.id);
  return json({ ok: true });
});
