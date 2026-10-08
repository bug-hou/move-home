import { cleanKey, getBlobStore, userPrefix } from '../../../lib/files.js';
import { json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/files/delete  { key }
export const onRequestPost = route(async ({ request }, username) => {
  const body = await readJson(request);
  const key = cleanKey(body.key);
  await getBlobStore().delete(userPrefix(username) + key);
  return json({ ok: true });
});
