import { HttpError } from '../../../lib/http.js';
import {
  canInline,
  chunkedStream,
  cleanKey,
  getBlobStore,
  getManifest,
  guessMime,
  parseRange,
  splitKey,
} from '../../../lib/files.js';
import { route } from '../../../lib/route.js';

// GET /api/files/download?key=photos/a.jpg[&inline=1]
// 登录校验 + 用户前缀隔离后，按清单把各分片拼成一个流返回；支持 Range（视频拖动进度条）
export const onRequestGet = route(async ({ request }, username) => {
  const params = new URL(request.url).searchParams;
  const key = cleanKey(params.get('key'));
  const { name } = splitKey(key);

  const store = getBlobStore();
  const manifest = await getManifest(store, username, key);
  if (!manifest) throw new HttpError(404, '文件不存在');

  const mime = manifest.mime || guessMime(name);
  const inline = params.get('inline') === '1' && canInline(mime);
  const etag = `"${manifest.id}"`;

  const headers = {
    'Content-Type': mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    // 每次向服务端校验登录态与 ETag，内容未变时只返回 304
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    'Accept-Ranges': 'bytes',
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': headers['Cache-Control'] } });
  }

  const range = parseRange(request.headers.get('range'), manifest.size);
  const start = range?.start ?? 0;
  const end = range?.end ?? manifest.size;
  headers['Content-Length'] = String(end - start);
  if (range) headers['Content-Range'] = `bytes ${start}-${end - 1}/${manifest.size}`;

  return new Response(chunkedStream(store, username, manifest, start, end), {
    status: range ? 206 : 200,
    headers,
  });
});
