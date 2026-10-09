import { CHUNK_SIZE, MAX_FILE_SIZE, STORAGE_QUOTA } from '../../../lib/config.js';
import { cleanDir, cleanFileName, getUsage, newId } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { createUploadSession } from '../../../lib/upload-session.js';
import { route } from '../../../lib/route.js';

// POST /api/files/upload-init  { dir, name, size }
// 校验参数并分配上传 id、分片数；分片再通过 upload-url 逐片申请预签名地址
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const dir = cleanDir(body.dir);
  const name = cleanFileName(body.name);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, '文件大小不合法');
  if (size > MAX_FILE_SIZE) {
    throw new HttpError(413, `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`);
  }
  const used = await getUsage(username);
  if (used !== null && used + size > STORAGE_QUOTA) throw new HttpError(413, '存储空间不足');
  const id = newId();
  const chunks = Math.ceil(size / CHUNK_SIZE);
  await createUploadSession(username, id, { dir, name, size, chunks });
  return json({ id, chunkSize: CHUNK_SIZE, chunks });
});
