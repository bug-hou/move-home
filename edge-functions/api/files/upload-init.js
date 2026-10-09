import { CHUNK_SIZE, MAX_FILE_SIZE } from '../../../lib/config.js';
import { cleanDir, cleanFileName, newId } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/files/upload-init  { dir, name, size }
// 校验参数并分配上传 id、分片数；分片再通过 upload-url 逐片申请预签名地址
export const onRequestPost = route(async ({ request }) => {
  const body = await readJson(request);
  cleanDir(body.dir);
  cleanFileName(body.name);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, '文件大小不合法');
  if (size > MAX_FILE_SIZE) {
    throw new HttpError(413, `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`);
  }
  return json({ id: newId(), chunkSize: CHUNK_SIZE, chunks: Math.ceil(size / CHUNK_SIZE) });
});
