import { createSession, createUser, getUser, hasAnyUser, normalizeUsername, validatePassword } from '../../../lib/auth.js';
import { HttpError, json, readJson } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// 默认仅允许创建第一个账号；需要开放注册时在环境变量中设置 ALLOW_REGISTER=true
export const onRequestPost = route(
  async ({ request, env }) => {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password);

    const open = (env?.ALLOW_REGISTER ?? globalThis.ALLOW_REGISTER) === 'true';
    if (!open && (await hasAnyUser())) throw new HttpError(403, '注册已关闭：已存在管理员账号，请直接登录；如需开放注册，请在环境变量中设置 ALLOW_REGISTER=true');
    if (await getUser(username)) throw new HttpError(409, '用户名已存在');

    await createUser(username, password);
    const cookie = await createSession(request, username);
    return json({ username }, 200, { 'Set-Cookie': cookie });
  },
  { auth: false },
);
