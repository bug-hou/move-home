import { MAX_FILE_SIZE, UPLOAD_URL_TTL } from '../../../lib/config.js';
import { cleanDir, cleanFileName, getBlobStore, guessMime, userPrefix } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/files/upload-url  { dir, name, size }
// 返回预签名 PUT URL，浏览器直接把文件传到 Blob，不经过函数（Edge 请求体上限仅 1MB）
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const dir = cleanDir(body.dir);
  const name = cleanFileName(body.name);
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, '文件大小不合法');
  if (size > MAX_FILE_SIZE) {
    throw new HttpError(413, `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限`);
  }

  const key = userPrefix(username) + dir + name;
  const contentType = guessMime(name);

  const store = getBlobStore();
  const { url } = await store.createUploadUrl(key, {
    expireSeconds: UPLOAD_URL_TTL,
    contentType,
  });

  // 客户端 PUT 时必须带上相同的 Content-Type
  return json({ url, key: dir + name, contentType });
});
