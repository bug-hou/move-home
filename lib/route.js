import { getSessionUser } from './auth.js';
import { HttpError, assertSameOrigin, json } from './http.js';

// 统一包装：CSRF 校验 + 登录校验 + 错误处理
// fn(context, username) => Response
export function route(fn, { auth = true } = {}) {
  return async (context) => {
    try {
      assertSameOrigin(context.request);
      let username = null;
      if (auth) {
        username = await getSessionUser(context.request);
        if (!username) throw new HttpError(401, '未登录');
      }
      return await fn(context, username);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      const detail = String(err?.message ?? err).slice(0, 200);
      return json({ error: '服务器内部错误', detail }, 500);
    }
  };
}
