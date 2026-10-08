import { KV_BINDING_NAME } from './config.js';
import { HttpError } from './http.js';

// KV 通过绑定的全局变量访问，仅 Edge Functions 可用
export function getKV() {
  const kv = globalThis[KV_BINDING_NAME];
  if (!kv) {
    throw new HttpError(
      500,
      `未检测到 KV 绑定，请在控制台创建命名空间并绑定到项目，变量名填 ${KV_BINDING_NAME}`,
    );
  }
  return kv;
}
