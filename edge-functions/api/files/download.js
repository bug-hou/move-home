import { HttpError } from '../../../lib/http.js';
import { canInline, cleanKey, getBlobStore, guessMime, userPrefix } from '../../../lib/files.js';
import { route } from '../../../lib/route.js';

// GET /api/files/download?key=photos/a.jpg[&inline=1]
// 登录校验 + 用户前缀隔离后，把 Blob 以流的形式返回
export const onRequestGet = route(async ({ request }, username) => {
  const params = new URL(request.url).searchParams;
  const key = cleanKey(params.get('key'));
  const name = key.split('/').pop();

  const store = getBlobStore();
  const stream = await store.get(userPrefix(username) + key, { type: 'stream' });
  if (!stream) throw new HttpError(404, '文件不存在');

  const mime = guessMime(name);
  const inline = params.get('inline') === '1' && canInline(mime);

  return new Response(stream, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
