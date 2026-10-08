import { getSessionUser } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// 未登录返回 200 + username:null，方便前端判断；同时告知是否可注册由前端自行尝试
export const onRequestGet = route(
  async ({ request }) => json({ username: await getSessionUser(request) }),
  { auth: false },
);
