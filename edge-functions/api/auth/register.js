import { createSession, createUser, getUser, hasAnyUser, normalizeUsername, validatePassword } from '../../../lib/auth.js';
import { HttpError, json, readJson, step } from '../../../lib/http.js';
import { route } from '../../../lib/route.js';

// 默认仅允许创建第一个账号；需要开放注册时在环境变量中设置 ALLOW_REGISTER=true
export const onRequestPost = route(
  async ({ request, env }) => {
    const traceId = [...crypto.getRandomValues(new Uint8Array(8))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const log = (stage, details = {}) => {
      console.info('[auth/register]', JSON.stringify({ traceId, stage, ...details }));
    };
    const run = async (stage, fn) => {
      log(stage, { status: 'start' });
      try {
        const result = await step(stage, fn);
        log(stage, { status: 'ok' });
        return result;
      } catch (err) {
        log(stage, { status: 'error', errorType: err?.cause?.name ?? err?.name ?? 'Error' });
        throw err;
      }
    };

    log('请求开始');
    const body = await run('解析请求体', () => readJson(request));
    const username = await run('校验用户名', () => normalizeUsername(body.username));
    const password = await run('校验密码', () => validatePassword(body.password));

    const open = (env?.ALLOW_REGISTER ?? globalThis.ALLOW_REGISTER) === 'true';
    log('注册模式', { open });
    if (!open) {
      const hasUser = await run('检查已有账号(KV list)', () => hasAnyUser(log));
      log('检查已有账号结果', { hasUser });
      if (hasUser) {
        log('注册拒绝', { reason: '已有账号' });
        throw new HttpError(403, '注册已关闭：已存在管理员账号，请直接登录；如需开放注册，请在环境变量中设置 ALLOW_REGISTER=true');
      }
    } else {
      log('检查已有账号跳过', { reason: '开放注册' });
    }
    const existingUser = await run('查询用户名(KV get)', () => getUser(username));
    log('查询用户名结果', { exists: Boolean(existingUser) });
    if (existingUser) {
      log('注册拒绝', { reason: '用户名已存在' });
      throw new HttpError(409, '用户名已存在');
    }

    await run('创建账号(密码哈希 + KV put)', () => createUser(username, password));
    const { token, cookie } = await run('创建会话(KV put)', () => createSession(request, username));
    log('注册完成');
    return json({ username, token }, 200, { 'Set-Cookie': cookie });
  },
  { auth: false },
);
