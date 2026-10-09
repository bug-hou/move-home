import { destroyAllSessions } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// POST /api/auth/logout-all：退出当前账号在所有设备上的登录
export const onRequestPost = route(async ({ request }, username) => {
  const cookie = await destroyAllSessions(request, username);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
});
