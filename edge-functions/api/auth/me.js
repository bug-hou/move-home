import { getSession, refreshCookie } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// 未登录返回 200 + username:null，方便前端判断
// 已登录时顺带重新下发 Cookie：localStorage 里有凭证但 Cookie 丢失时，图片/视频预览依然可用
export const onRequestGet = route(
  async ({ request }) => {
    const sess = await getSession(request);
    if (!sess) return json({ username: null });
    return json({ username: sess.username }, 200, { 'Set-Cookie': refreshCookie(request, sess.token) });
  },
  { auth: false },
);
