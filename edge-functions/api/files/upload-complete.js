import { CHUNK_SIZE, MAX_FILE_SIZE } from '../../../lib/config.js';
import {
  ID_RE,
  addUsage,
  chunkKey,
  cleanDir,
  cleanFileName,
  getBlobStore,
  guessMime,
  mapLimit,
  putManifest,
  uniqueName,
} from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';
import { finishUploadSession, getUploadSession } from '../../../lib/upload-session.js';

function contentLength(meta) {
  for (const [k, v] of Object.entries(meta?.headers ?? {})) {
    if (k.toLowerCase() === 'content-length') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

// POST /api/files/upload-complete  { id, dir, name, size }
// 所有分片传完后调用：校验分片都已落盘，再写入清单，文件才会出现在列表里
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const dir = cleanDir(body.dir);
  const wanted = cleanFileName(body.name);
  const size = Number(body.size);
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, '上传 id 不合法');
  const session = await getUploadSession(username, body.id);
  if (session.state === 'done') return json({ key: session.key, name: session.key.split('/').pop() });
  if (session.dir !== dir || session.name !== wanted || session.size !== size) {
    throw new HttpError(400, '任务信息与上传文件不符');
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_SIZE) throw new HttpError(400, '文件大小不合法');

  const chunks = Math.ceil(size / CHUNK_SIZE);
  const store = getBlobStore();

  const indexes = Array.from({ length: chunks }, (_, i) => i);
  const metas = await mapLimit(indexes, 6, (i) =>
    store.getMetadata(chunkKey(username, body.id, i), { consistency: 'strong' }),
  );
  metas.forEach((meta, i) => {
    if (!meta) throw new HttpError(400, `第 ${i + 1} 个分片尚未上传完成`);
    const len = contentLength(meta);
    const expected = i === chunks - 1 ? size - CHUNK_SIZE * (chunks - 1) : CHUNK_SIZE;
    if (len !== null && len !== expected) throw new HttpError(400, `第 ${i + 1} 个分片大小不一致，请重新上传`);
  });

  const name = await uniqueName(store, username, dir, wanted);
  await putManifest(store, username, dir + name, {
    id: body.id,
    size,
    chunks,
    chunkSize: CHUNK_SIZE,
    mime: guessMime(name),
    mtime: Date.now(),
  });
  await finishUploadSession(username, body.id, session, dir + name);
  await addUsage(username, size);
  return json({ key: dir + name, name });
});
