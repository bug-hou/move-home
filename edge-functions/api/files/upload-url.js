import { UPLOAD_URL_TTL } from '../../../lib/config.js';
import { ID_RE, MAX_CHUNKS, chunkKey, getBlobStore } from '../../../lib/files.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

const CHUNK_CONTENT_TYPE = 'application/octet-stream';

// POST /api/files/upload-url  { id, index }
// 返回某一分片的预签名 PUT URL，浏览器直接把分片传到 Blob，不经过函数（Edge 请求体上限仅 1MB）
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const index = Number(body.index);
  if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(400, '上传 id 不合法');
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw new HttpError(400, '分片序号不合法');

  const { url } = await getBlobStore().createUploadUrl(chunkKey(username, body.id, index), {
    expireSeconds: UPLOAD_URL_TTL,
    contentType: CHUNK_CONTENT_TYPE,
  });

  // 客户端 PUT 时必须带上相同的 Content-Type
  return json({ url, contentType: CHUNK_CONTENT_TYPE });
});
