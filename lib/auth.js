import {
  COOKIE_NAME,
  LOGIN_LOCK_SECONDS,
  LOGIN_MAX_FAILS,
  PBKDF2_ITERATIONS,
  SESSION_MAX_PER_USER,
  SESSION_TTL,
} from './config.js';
import { HttpError } from './http.js';
import { getKV } from './kv.js';

const enc = new TextEncoder();

// KV key 仅允许 数字/字母/下划线，所以用户名同样限制
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return toHex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256,
    ),
  );
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt: toHex(salt), hash, iterations: PBKDF2_ITERATIONS };
}

async function verifyPassword(password, record) {
  const hash = await pbkdf2(password, fromHex(record.salt), record.iterations);
  return safeEqual(hash, record.hash);
}

export function normalizeUsername(input) {
  const name = String(input ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new HttpError(400, '用户名需为 3-20 位小写字母、数字或下划线');
  }
  return name;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, '密码长度需为 8-128 位');
  }
  return password;
}

// ---------- 用户 ----------

export async function getUser(username) {
  return getKV().get(`user_${username}`, { type: 'json' });
}

export async function createUser(username, password) {
  const kv = getKV();
  const { salt, hash, iterations } = await hashPassword(password);
  await kv.put(
    `user_${username}`,
    JSON.stringify({ salt, hash, iterations, createdAt: Date.now() }),
  );
}

export async function hasAnyUser(log = () => {}) {
  const kv = getKV();
  log('KV 绑定已获取', { getMethod: typeof kv.get, putMethod: typeof kv.put, listMethod: typeof kv.list });
  log('KV list 调用', { prefix: 'user_', limit: 1 });
  const res = await kv.list({ prefix: 'user_', limit: 1 });
  const keys = Array.isArray(res) ? res : (res?.keys ?? res?.data);
  const resultType = res === null ? 'null' : Array.isArray(res) ? 'array' : typeof res;
  const keysType = typeof res?.keys;
  const dataType = typeof res?.data;
  const complete = typeof res?.complete === 'boolean' ? String(res.complete) : typeof res?.complete;
  const cursorType = res?.cursor === null ? 'null' : typeof res?.cursor;
  const cursorEmpty = res?.cursor === '';
  const errorType = typeof res?.error;
  const codeType = typeof res?.code;
  log('KV list 返回', {
    resultType,
    keysType,
    dataType,
    keysIsArray: Array.isArray(keys),
    keysCount: Array.isArray(keys) ? keys.length : null,
    complete,
    cursorType,
    cursorEmpty,
    errorType,
    codeType,
  });
  if (!Array.isArray(keys)) {
    // 空结果时 EdgeOne KV 可能不返回 keys 字段（仅 complete=true + 空 cursor），视为没有用户
    if (res && typeof res === 'object' && res.complete === true && !res.error && !res.code) {
      return false;
    }
    throw new Error(`KV list 返回格式异常（resultType=${resultType}, keysType=${keysType}, complete=${complete}, cursor=${cursorType}, cursorEmpty=${cursorEmpty}, errorType=${errorType}, codeType=${codeType}）`);
  }
  return keys.length > 0;
}

// 校验账号密码，失败抛 HttpError；带简单的失败次数锁定
export async function verifyLogin(username, password) {
  const kv = getKV();
  const failKey = `fail_${username}`;
  const fail = (await kv.get(failKey, { type: 'json' })) || { count: 0, until: 0 };
  if (fail.until > Date.now()) {
    throw new HttpError(429, '尝试次数过多，请稍后再试');
  }

  const record = await getUser(username);
  // 用户不存在时也做一次哈希，降低通过响应时间枚举用户名的可能
  const ok = record
    ? await verifyPassword(password, record)
    : (await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS), false);

  if (!ok) {
    const count = fail.count + 1;
    const locked = count >= LOGIN_MAX_FAILS;
    await kv.put(
      failKey,
      JSON.stringify({ count: locked ? 0 : count, until: locked ? Date.now() + LOGIN_LOCK_SECONDS * 1000 : 0 }),
    );
    throw new HttpError(401, '用户名或密码错误');
  }
  if (fail.count > 0) await kv.delete(failKey);
}

// ---------- 会话 ----------

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function buildCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

const TOKEN_RE = /^[a-f0-9]{64}$/;

// 凭证来源：优先 Authorization: Bearer（前端 localStorage），其次 Cookie（供 <img>/<video>/下载链接使用）
function getToken(request) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '');
  if (m) return m[1];
  const c = parseCookies(request)[COOKIE_NAME];
  return c && TOKEN_RE.test(c) ? c : null;
}

// 每个用户保存一份会话哈希索引，用于限制设备数量与「退出所有设备」
const sessionIndexKey = (username) => `us_${username}`;

async function addToIndex(kv, username, hash) {
  const key = sessionIndexKey(username);
  const list = (await kv.get(key, { type: 'json' })) || [];
  const next = [...(Array.isArray(list) ? list : []).filter((h) => h !== hash), hash];
  while (next.length > SESSION_MAX_PER_USER) await kv.delete(`sess_${next.shift()}`);
  await kv.put(key, JSON.stringify(next));
}

async function removeFromIndex(kv, username, hash) {
  const key = sessionIndexKey(username);
  const list = (await kv.get(key, { type: 'json' })) || [];
  if (!Array.isArray(list)) return;
  await kv.put(key, JSON.stringify(list.filter((h) => h !== hash)));
}

// 返回 { token, cookie }：token 交给前端存入 localStorage，cookie 写入响应头
export async function createSession(request, username) {
  const kv = getKV();
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  // KV 里只存 token 的哈希，即使 KV 数据泄露也无法直接冒用会话
  const hash = await sha256Hex(token);
  await kv.put(`sess_${hash}`, JSON.stringify({ username, exp: Date.now() + SESSION_TTL * 1000 }));
  await addToIndex(kv, username, hash);
  return { token, cookie: buildCookie(request, token, SESSION_TTL) };
}

// 返回 { username, token }，无效返回 null；剩余有效期不足一半时自动续期
export async function getSession(request) {
  const token = getToken(request);
  if (!token) return null;
  const kv = getKV();
  const key = `sess_${await sha256Hex(token)}`;
  const sess = await kv.get(key, { type: 'json' });
  if (!sess) return null;
  const now = Date.now();
  if (sess.exp < now) {
    await kv.delete(key);
    return null;
  }
  if (sess.exp - now < (SESSION_TTL * 1000) / 2) {
    try {
      await kv.put(key, JSON.stringify({ ...sess, exp: now + SESSION_TTL * 1000 }));
    } catch {
      // 续期失败不影响本次请求
    }
  }
  return { username: sess.username, token };
}

export async function getSessionUser(request) {
  return (await getSession(request))?.username ?? null;
}

// 登录态有效时重新下发 Cookie（localStorage 有凭证但 Cookie 被清除时用于恢复）
export const refreshCookie = (request, token) => buildCookie(request, token, SESSION_TTL);

// 返回清除 Cookie 的 Set-Cookie
export async function destroySession(request) {
  const token = getToken(request);
  if (token) {
    const kv = getKV();
    const hash = await sha256Hex(token);
    const sess = await kv.get(`sess_${hash}`, { type: 'json' });
    await kv.delete(`sess_${hash}`);
    if (sess?.username) await removeFromIndex(kv, sess.username, hash);
  }
  return buildCookie(request, '', 0);
}

// 退出该用户的所有设备
export async function destroyAllSessions(request, username) {
  const kv = getKV();
  const key = sessionIndexKey(username);
  const list = (await kv.get(key, { type: 'json' })) || [];
  for (const hash of Array.isArray(list) ? list : []) await kv.delete(`sess_${hash}`);
  await kv.delete(key);
  return buildCookie(request, '', 0);
}
