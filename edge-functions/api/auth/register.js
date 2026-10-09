import { createSession, createUser, getUser, hasAnyUser, normalizeUsername, validatePassword } from '../../../lib/auth.js';
import { HttpError, json, readJson, step } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// 默认仅允许创建第一个账号；需要开放注册时在环境变量中设置 ALLOW_REGISTER=true
export const onRequestPost = route(
  async ({ request, env }) => {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password);

    const open = (env?.ALLOW_REGISTER ?? globalThis.ALLOW_REGISTER) === 'true';
    if (!open && (await step('检查已有账号(KV list)', hasAnyUser))) {
      throw new HttpError(403, '注册已关闭：已存在管理员账号，请直接登录；如需开放注册，请在环境变量中设置 ALLOW_REGISTER=true');
    }
    if (await step('查询用户名(KV get)', () => getUser(username))) throw new HttpError(409, '用户名已存在');

    await step('创建账号(密码哈希 + KV put)', () => createUser(username, password));
    const cookie = await step('创建会话(KV put)', () => createSession(request, username));
    return json({ username }, 200, { 'Set-Cookie': cookie });
  },
  { auth: false },
);
