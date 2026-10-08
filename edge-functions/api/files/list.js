import { cleanDir, getBlobStore, userPrefix } from '../../../lib/files.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// GET /api/files/list?dir=photos/2024/
export const onRequestGet = route(async ({ request }, username) => {
  const dir = cleanDir(new URL(request.url).searchParams.get('dir'));
  const base = userPrefix(username);

  const store = getBlobStore();
  const { blobs, directories } = await store.list({
    prefix: base + dir,
    directories: true,
    consistency: 'strong',
  });

  return json({
    dir,
    folders: (directories || []).map((d) => d.slice(base.length)),
    files: (blobs || []).map((b) => ({ key: b.key.slice(base.length), etag: b.etag })),
  });
});
