import { KV_BINDING_NAME } from './config.js';
import { HttpError } from './http.js';

// KV 通过控制台绑定的变量名访问（官方示例为直接使用全局变量），仅 Edge Functions 可用
// 变量名必须与 config.js 中的 KV_BINDING_NAME 一致
/* global netdisk_kv */
export function getKV() {
  let kv;
  try {
    kv = typeof netdisk_kv !== 'undefined' ? netdisk_kv : globalThis[KV_BINDING_NAME];
  } catch {
    kv = undefined;
  }
  if (!kv) {
    throw new HttpError(
      500,
      `未检测到 KV 绑定，请在控制台创建命名空间并绑定到项目，变量名填 ${KV_BINDING_NAME}；本地开发请先执行 edgeone makers link`,
    );
  }
  return kv;
}
