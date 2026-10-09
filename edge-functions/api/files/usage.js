import { STORAGE_QUOTA } from '../../../lib/config.js';
import { getBlobStore, getUsage, recalcUsage, setUsage } from '../../../lib/files.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// GET /api/files/usage[?recalc=1]
// 返回 { used, quota }；没有记录或指定 recalc 时遍历清单重新计算
export const onRequestGet = route(async ({ request }, username) => {
  const recalc = new URL(request.url).searchParams.get('recalc') === '1';
  let used = recalc ? null : await getUsage(username);
  if (used === null) {
    used = await recalcUsage(getBlobStore(), username);
    await setUsage(username, used);
  }
  return json({ used, quota: STORAGE_QUOTA });
});
